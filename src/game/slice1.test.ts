import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Enemy, EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { ENEMY_TYPES, FOREST_ENEMY_TYPES } from './enemies';
import { floorScale } from './spawning';
import { stealOneHotbarItem, stealOneSoulEmoji } from './monkeyLoot';
import { applyEnemyTurns, runEnemyTurns, spendPlayerStun } from './enemyTurns';
import { foeDetectionRadius } from './emojiBalance';
import { playerSightRadius } from './vision';
import { applyInstantItemUse } from './shopUse';
import { EMOJI_POWERS } from './emojis';
import {
  BAT_EVASION,
  CANDLE_LOS,
  CANDLE_TURNS,
  elephantKnockTiles,
  elephantTag,
  resolveKnockback,
  tickCandleSight,
} from './slice1';

function tile(type: Tile['type'], emoji = '⬜'): Tile {
  return { type, emoji, seen: true, visible: true };
}

function playerAt(x: number, y: number, inventory: EmojiItem[] = []): Player {
  return {
    pos: { x, y },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 40, maxHp: 40, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory,
    bank: [],
    equipment: {},
  };
}

function foe(over: Partial<Enemy> & Pick<Enemy, 'emoji' | 'name' | 'pos'>): Enemy {
  return {
    id: over.id ?? over.emoji,
    hp: 8,
    maxHp: 8,
    attack: 2,
    defense: 0,
    speed: 4,
    engaged: true,
    huntTurns: 5,
    ...over,
  };
}

function state(map: MapGrid, player: Player, enemies: Enemy[], floor = 1): GameState {
  return {
    schemaVersion: 13,
    player,
    currentFloor: floor,
    map,
    enemies,
    items: [],
    turn: 4,
    logs: [],
    floatingTexts: [],
    gameOver: false,
    victory: false,
    levelUpPending: false,
    cameraOffset: { x: 0, y: 0 },
    placedBombs: [],
    activeProjectile: null,
    killCounts: {},
    difficultyTier: 0,
    highestPressureTierWarned: 0,
  };
}

function rowMap(kinds: Tile['type'][]): MapGrid {
  const width = kinds.length;
  const wall = tile('wall', '⬛');
  const mid = kinds.map(kind => tile(kind, kind === 'stairs' ? '🪜' : kind === 'lava' ? '🟧' : '⬜'));
  return [
    Array.from({ length: width }, () => wall),
    mid,
    Array.from({ length: width }, () => wall),
  ];
}

const dagger: EmojiItem = {
  id: 'dagger', emoji: '🗡️', name: 'Dagger', description: 'blade', consumed: false, isEquipment: true,
};
const heart: EmojiItem = {
  id: 'heart', emoji: '❤️', name: 'Heart', description: 'life', consumed: false,
  bagPassive: { description: 'life' },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content slice 1', () => {
  it('lets a raccoon steal a non-soul hotbar item, flee, and escape with it', () => {
    const taken: Record<string, number> = {};
    expect(stealOneSoulEmoji([dagger], taken)).toBeNull();
    const theft = stealOneHotbarItem([dagger], {});
    expect(theft?.stolen.emoji).toBe('🗡️');

    const map = rowMap(['wall', 'floor', 'floor', 'floor', 'stairs', 'wall']);
    const start = state(
      map,
      playerAt(1, 1, [dagger]),
      [foe({ emoji: '🦝', name: 'Raccoon', pos: { x: 2, y: 1 }, raccoon: true, attack: 0 })],
    );
    const fled = applyEnemyTurns(start, runEnemyTurns(start));
    expect(fled.player.inventory.some(item => item.id === 'dagger')).toBe(false);
    expect(fled.enemies[0]?.pos).toEqual({ x: 3, y: 1 });
    expect(fled.enemies[0]?.stolenEmojis?.[0]?.emoji).toBe('🗡️');
    expect(fled.logs.some(line => line.text.includes('snatches'))).toBe(true);

    const gone = applyEnemyTurns(fled, runEnemyTurns(fled));
    expect(gone.enemies.some(enemy => enemy.raccoon && enemy.hp > 0)).toBe(false);
    expect(gone.player.inventory.some(item => item.emoji === '🗡️')).toBe(false);
    expect(gone.logs.some(line => line.text.includes('escapes down the stairs'))).toBe(true);
  });

  it('returns the stolen item when the raccoon dies', () => {
    const map = rowMap(['wall', 'floor', 'floor', 'floor', 'floor', 'wall']);
    const gem: EmojiItem = {
      id: 'gem', emoji: '💎', name: 'Diamond', description: 'gem', consumed: false,
      bagPassive: { description: 'thorns' },
    };
    const stolen: EmojiItem = { ...gem, id: 'stolen-gem' };
    const start = state(
      map,
      playerAt(1, 1, [heart]),
      [foe({
        emoji: '🦝', name: 'Raccoon', pos: { x: 4, y: 1 }, raccoon: true,
        hp: 1, maxHp: 6, burningTurns: 1, burnDamage: 5, stolenEmojis: [stolen],
      })],
    );
    const next = applyEnemyTurns(start, runEnemyTurns(start));
    expect(next.enemies.some(enemy => enemy.raccoon && enemy.hp > 0)).toBe(false);
    expect(next.player.inventory.some(item => item.emoji === '💎')).toBe(true);
    expect(next.logs.some(line => line.text.includes('drops your'))).toBe(true);
  });

  it('keeps the bat at 50 EVA on every floor and steps erratically', () => {
    const bat = ENEMY_TYPES.find(enemy => enemy.emoji === '🦇');
    expect(bat?.weight).toBeLessThan(1);
    expect(bat && Math.min(...ENEMY_TYPES.map(enemy => enemy.weight))).toBe(bat?.weight);
    expect(floorScale(bat!, 1).evasion).toBe(BAT_EVASION);
    expect(floorScale(bat!, 20).evasion).toBe(50);
    expect(floorScale(ENEMY_TYPES.find(enemy => enemy.emoji === '🐍')!, 1).evasion).toBe(0);

    const map: MapGrid = Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) => (y === 0 || x === 0 || y === 6 || x === 6 ? tile('wall', '⬛') : tile('floor'))),
    );
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const start = state(
      map,
      playerAt(5, 5, [heart]),
      [foe({ emoji: '🦇', name: 'Bat', pos: { x: 3, y: 3 }, bat: true, attack: 0 })],
    );
    const next = applyEnemyTurns(start, runEnemyTurns(start));
    expect(next.enemies[0]?.pos).toEqual({ x: 3, y: 2 });
  });

  it('rolls elephants 75/25 and gives them bear-scale stats', () => {
    const elephant = ENEMY_TYPES.find(enemy => enemy.emoji === '🐘')!;
    const bear = FOREST_ENEMY_TYPES.find(enemy => enemy.emoji === '🐻')!;
    expect(elephant.hp).toBe(Math.round(bear.hp * 1.5));
    expect(elephant.attack).toBeLessThan(bear.attack);
    expect(elephantTag(0)).toBe('Neutral');
    expect(elephantTag(0.74)).toBe('Neutral');
    expect(elephantTag(0.75)).toBe('Hostile');
  });

  it('turns a hit elephant hostile and stomps an adjacent hostile', () => {
    const map: MapGrid = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => tile('floor')));
    const start = state(
      map,
      playerAt(1, 1, [heart]),
      [
        foe({
          emoji: '🐘', name: 'Elephant', pos: { x: 3, y: 3 }, elephant: true,
          tag: 'Neutral', attack: 6, hp: 30, maxHp: 30,
        }),
        foe({ emoji: '🧟', name: 'Zombie', id: 'z', pos: { x: 4, y: 3 }, hp: 3, maxHp: 4, attack: 0 }),
      ],
    );
    const next = applyEnemyTurns(start, runEnemyTurns(start));
    const elephant = next.enemies.find(enemy => enemy.elephant);
    expect(elephant?.tag).toBe('Hostile');
    expect(next.enemies.some(enemy => enemy.emoji === '🧟' && enemy.hp > 0)).toBe(false);
    expect(next.logs.some(line => line.text.includes('turns hostile'))).toBe(true);
    expect(next.logs.some(line => line.text.includes('stomps'))).toBe(true);
  });

  it('knocks one tile, two from D:15, stuns on a wall, and burns in lava', () => {
    expect(elephantKnockTiles(14)).toBe(1);
    expect(elephantKnockTiles(15)).toBe(2);
    const open = (x: number) => (x >= 0 && x <= 5 ? 'floor' : undefined);
    const clear = resolveKnockback({
      elephant: { x: 1, y: 0 }, player: { x: 2, y: 0 }, tiles: 2, flies: false,
      tileAt: pos => open(pos.x), occupied: () => false,
    });
    expect(clear).toEqual({ pos: { x: 4, y: 0 }, stunned: false, burned: false });
    const intoWall = resolveKnockback({
      elephant: { x: 1, y: 0 }, player: { x: 2, y: 0 }, tiles: 2, flies: false,
      tileAt: pos => (pos.x === 4 ? 'wall' : 'floor'), occupied: () => false,
    });
    expect(intoWall).toEqual({ pos: { x: 3, y: 0 }, stunned: true, burned: false });
    const flyer = resolveKnockback({
      elephant: { x: 1, y: 0 }, player: { x: 2, y: 0 }, tiles: 1, flies: true,
      tileAt: () => 'wall', occupied: () => false,
    });
    expect(flyer).toEqual({ pos: { x: 2, y: 0 }, stunned: false, burned: false });

    vi.spyOn(Math, 'random').mockReturnValue(0);
    const walled = rowMap(['wall', 'floor', 'floor', 'floor', 'wall']);
    const stunned = applyEnemyTurns(
      state(walled, playerAt(3, 1, [heart]), [foe({ emoji: '🐘', name: 'Elephant', pos: { x: 2, y: 1 }, elephant: true, tag: 'Hostile', attack: 6, hp: 30, maxHp: 30 })]),
      runEnemyTurns(state(walled, playerAt(3, 1, [heart]), [foe({ emoji: '🐘', name: 'Elephant', pos: { x: 2, y: 1 }, elephant: true, tag: 'Hostile', attack: 6, hp: 30, maxHp: 30 })])),
    );
    expect(stunned.player.pos).toEqual({ x: 3, y: 1 });
    expect(stunned.player.stats.stunTurns).toBe(1);
    expect(stunned.logs.some(line => line.text.includes('stunned'))).toBe(true);

    const lavaMap = rowMap(['wall', 'floor', 'floor', 'lava', 'floor']);
    const burned = applyEnemyTurns(
      state(lavaMap, playerAt(2, 1, [heart]), [foe({ emoji: '🐘', name: 'Elephant', pos: { x: 1, y: 1 }, elephant: true, tag: 'Hostile', attack: 6, hp: 30, maxHp: 30 })]),
      runEnemyTurns(state(lavaMap, playerAt(2, 1, [heart]), [foe({ emoji: '🐘', name: 'Elephant', pos: { x: 1, y: 1 }, elephant: true, tag: 'Hostile', attack: 6, hp: 30, maxHp: 30 })])),
    );
    expect(burned.player.pos).toEqual({ x: 3, y: 1 });
    expect(burned.player.stats.stunTurns).toBeUndefined();
    expect(burned.logs.some(line => line.text.includes('lava'))).toBe(true);

    const flying = playerAt(3, 1, [heart]);
    flying.characterClass = '🧞‍♀️';
    const pushed = applyEnemyTurns(
      state(walled, flying, [foe({ emoji: '🐘', name: 'Elephant', pos: { x: 2, y: 1 }, elephant: true, tag: 'Hostile', attack: 6, hp: 30, maxHp: 30 })]),
      runEnemyTurns(state(walled, flying, [foe({ emoji: '🐘', name: 'Elephant', pos: { x: 2, y: 1 }, elephant: true, tag: 'Hostile', attack: 6, hp: 30, maxHp: 30 })])),
    );
    expect(pushed.player.pos).toEqual({ x: 3, y: 1 });
    expect(pushed.player.stats.stunTurns).toBeUndefined();
    expect(pushed.logs.some(line => line.text.includes('stunned'))).toBe(false);
  });

  it('skips the next move while stunned', () => {
    const map = rowMap(['wall', 'floor', 'floor', 'floor', 'wall']);
    const start = state(map, playerAt(2, 1, [heart]), []);
    start.player = { ...start.player, stats: { ...start.player.stats, stunTurns: 1 } };
    const next = spendPlayerStun(start);
    expect(next?.player.stats.stunTurns).toBeUndefined();
    expect(next?.turn).toBe(start.turn + 1);
    expect(next?.logs.some(line => line.text.includes('lose a turn'))).toBe(true);
  });

  it('lights a candle for 30 turns of sight without revealing stealth', () => {
    expect(tickCandleSight(CANDLE_TURNS)).toBe(CANDLE_TURNS - 1);
    expect(tickCandleSight(1)).toBeUndefined();
    const wizard = playerAt(1, 1, [heart]);
    expect(playerSightRadius({ ...wizard, stats: { ...wizard.stats, candleLosTurns: CANDLE_TURNS } }))
      .toBe(playerSightRadius(wizard) + CANDLE_LOS);
    expect(foeDetectionRadius(6, { stealthy: true, starStacks: 0, restaurant: false })).toBe(3);
    expect(foeDetectionRadius(6, { stealthy: true, starStacks: 5, restaurant: false })).toBe(9999);

    const candle = EMOJI_POWERS.find(power => power.emoji === '🕯️')!;
    expect(candle.description.toLowerCase()).toContain('does not reveal');
    const map = rowMap(['wall', 'floor', 'floor', 'floor', 'wall']);
    const lit = applyInstantItemUse(
      state(map, playerAt(2, 1, [heart, { id: 'candle', emoji: '🕯️', name: 'Candle', description: candle.description, consumed: false }]), []),
      { id: 'candle', emoji: '🕯️', name: 'Candle', description: candle.description, consumed: false },
      { source: 'bag', addLog: () => {}, applyMonkeyDropOnKill: (_enemy, player) => player },
    );
    expect(lit?.player.stats.candleLosTurns).toBe(CANDLE_TURNS - 1);
    expect(lit?.logs.some(line => line.text.includes('+3 sight'))).toBe(true);
    expect(lit?.player.stats.xpBoostTurns).toBeUndefined();
  });

  it('documents all four in the manual', () => {
    const manual = readFileSync('src/pages/how-to-play.tsx', 'utf8');
    expect(manual).toContain('Raccoon');
    expect(manual).toContain('Bat');
    expect(manual).toContain('Elephant');
    expect(manual).toContain('does not reveal stealthed');
  });
});
