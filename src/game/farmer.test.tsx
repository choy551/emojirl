import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EmojiItem, Enemy, GameState, MapGrid, Player, Tile } from './types';
import { ENEMY_PASSABLE_TILES, PLAYER_PASSABLE_TILES, RANGED_BLOCKING_TILES } from './tiles';
import { OPAQUE_TILES } from './vision';
import { canFloodTile, generateMap } from './mapgen';
import { passableTilesForEnemy } from './enemies';
import { spawnEnemies } from './spawning';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { FarmerTradeModal } from '../components/FarmerTradeModal';
import {
  CROP_EMOJIS,
  GRASS_EMOJI,
  executeFarmerTrade,
  farmDenizenIntent,
  farmerAskPrice,
  farmerPayKind,
  farmerRulesBlurb,
  farmerTradeValue,
  placePrairie,
  prairieAppearsOnFloor,
  rollFarmAnimal,
  rollFarmerStock,
  PRAIRIE_FLOOR_CHANCE,
} from './farmer';

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: false, visible: false };
}

function blank(h: number, w: number): MapGrid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => tile('wall', '⬛')));
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function item(over: Partial<EmojiItem> & Pick<EmojiItem, 'emoji' | 'name'>): EmojiItem {
  return { id: over.id ?? over.emoji, description: over.description ?? '', consumed: false, ...over };
}

function playerWith(items: EmojiItem[], gold = 40): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold,
    },
    inventory: items,
    bank: [],
    equipment: {},
  };
}

const soul = item({
  id: 'soul',
  emoji: '🍀',
  name: 'Clover',
  description: 'luck',
  bagPassive: { description: 'lucky', luckBonus: 1 },
});

describe('prairie floors', () => {
  it('appears only on D:3–26 at about 18%', () => {
    expect(PRAIRIE_FLOOR_CHANCE).toBeCloseTo(0.18);
    for (const floor of [1, 2, 27, 40]) {
      expect(prairieAppearsOnFloor(floor, 0)).toBe(false);
      expect(prairieAppearsOnFloor(floor, 0.17)).toBe(false);
    }
    expect(prairieAppearsOnFloor(3, 0.179)).toBe(true);
    expect(prairieAppearsOnFloor(26, 0)).toBe(true);
    expect(prairieAppearsOnFloor(10, 0.18)).toBe(false);
    expect(prairieAppearsOnFloor(10, 0.179999)).toBe(true);
  });

  it('never themes a prairie outside that band', () => {
    for (const floor of [1, 2, 27, 40]) {
      expect(generateMap(floor).rooms.some(r => r.theme === 'prairie')).toBe(false);
    }
  });
});

describe('prairie tiles', () => {
  it('paints green grass and blocking crops that still let you see and shoot', () => {
    const map = blank(10, 12);
    for (let y = 1; y < 7; y++) for (let x = 1; x < 9; x++) map[y][x] = tile('floor', '⬜');
    const room = { x: 1, y: 1, w: 8, h: 6 };
    placePrairie(map, room, () => 0);
    const cx = room.x + Math.floor(room.w / 2);
    const cy = room.y + Math.floor(room.h / 2);
    expect(map[room.y][room.x]).toMatchObject({ type: 'grass', emoji: GRASS_EMOJI });
    expect(map[cy][cx]).toMatchObject({ type: 'grass', emoji: GRASS_EMOJI });
    expect(map[cy][room.x + 2].type).toBe('grass');
    const crops = map.flat().filter(t => t.type === 'crop');
    expect(crops.length).toBeGreaterThan(0);
    expect(crops.every(t => (CROP_EMOJIS as readonly string[]).includes(t.emoji))).toBe(true);
    expect(PLAYER_PASSABLE_TILES.has('grass')).toBe(true);
    expect(PLAYER_PASSABLE_TILES.has('crop')).toBe(false);
    expect(ENEMY_PASSABLE_TILES.has('crop')).toBe(false);
    expect(RANGED_BLOCKING_TILES.has('crop')).toBe(false);
    expect(OPAQUE_TILES.has('crop')).toBe(false);
  });

  it('is protected from rivers and ponds', () => {
    const map = blank(8, 8);
    map[3][3] = tile('grass', GRASS_EMOJI);
    const rooms = [{ x: 2, y: 2, w: 4, h: 4, theme: 'prairie' as const }];
    expect(canFloodTile(map, 3, 3, rooms)).toBe(false);
  });
});

describe('farmer trade values', () => {
  const cooked = item({ emoji: '🥩', name: 'Grilled Steak', healAmount: 12, isCooked: true });
  const raw = item({ emoji: '🍖', name: 'Meat', healAmount: 3 });
  const potion = item({ emoji: '🧪', name: 'Potion', healAmount: 6 });
  const heart = item({ emoji: '🫀', name: 'Heart', healAmount: 8 });

  it('pays cooked 1.25×, raw 1×, potion 0.75×, and refuses gold', () => {
    expect(farmerPayKind(cooked)).toBe('cooked');
    expect(farmerPayKind(raw)).toBe('raw');
    expect(farmerPayKind(potion)).toBe('potion');
    expect(farmerTradeValue(cooked)).toBe(15);
    expect(farmerTradeValue(raw)).toBe(3);
    expect(farmerTradeValue(potion)).toBe(4.5);
    expect(farmerTradeValue(heart)).toBe(8);
    expect(farmerTradeValue(item({ emoji: '💰', name: 'Money Bag', isMoneyBag: true }))).toBe(0);
    expect(farmerTradeValue(item({ emoji: '🍺', name: 'Beer', drinkTier: 2, healAmount: 5 }))).toBe(0);
  });

  it('stocks 3–5 emoji goods and spends food, not gold', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const stock = rollFarmerStock(mulberry32(seed));
      expect(stock.length).toBeGreaterThanOrEqual(3);
      expect(stock.length).toBeLessThanOrEqual(5);
      expect(new Set(stock.map(s => s.emoji)).size).toBe(stock.length);
    }
    const price = farmerAskPrice(soul);
    expect(price).toBe(9);
    const buyer = playerWith([
      item({ id: 'steak', emoji: '🥩', name: 'Grilled Steak', healAmount: 12, isCooked: true }),
    ], 40);
    const stock = [{ ...soul, id: 'ask' }];
    const done = executeFarmerTrade(buyer, stock, 'ask', ['steak']);
    expect(done.ok).toBe(true);
    expect(done.player?.stats.gold).toBe(40);
    expect(done.player?.inventory.some(i => i.id === 'steak')).toBe(false);
    expect(done.player?.inventory.some(i => i.emoji === '🍀')).toBe(true);
    expect(done.stock).toHaveLength(0);

    const short = executeFarmerTrade(
      playerWith([item({ id: 'p1', emoji: '🧪', name: 'Potion', healAmount: 6 })], 40),
      stock,
      'ask',
      ['p1'],
    );
    expect(short.ok).toBe(false);
    expect(short.player).toBeUndefined();

    const exact = executeFarmerTrade(
      playerWith([
        item({ id: 'p1', emoji: '🧪', name: 'Potion', healAmount: 6 }),
        item({ id: 'p2', emoji: '🧪', name: 'Potion', healAmount: 6 }),
      ], 40),
      stock,
      'ask',
      ['p1', 'p2'],
    );
    expect(exact.ok).toBe(true);
    expect(exact.player?.stats.gold).toBe(40);
    expect(exact.player?.inventory.filter(i => i.emoji === '🧪')).toHaveLength(0);

    const bribe = executeFarmerTrade(
      playerWith([item({ id: 'bag', emoji: '💰', name: 'Money Bag', isMoneyBag: true })], 40),
      stock,
      'ask',
      ['bag'],
    );
    expect(bribe.ok).toBe(false);
    expect(bribe.reason ?? '').toMatch(/gold/i);
  });
});

describe('farmers and animals', () => {
  it('rolls common livestock, with the cow on a rare roll', () => {
    expect(rollFarmAnimal(() => 0).emoji).toBe('🐄');
    const seq = [0.5, 0];
    expect(rollFarmAnimal(() => seq.shift() ?? 0).emoji).toBe('🐕');
  });

  it('spawns one friendly farmer with a herd inside the grass', () => {
    const map = blank(16, 16);
    const room = { x: 2, y: 2, w: 8, h: 6, theme: 'prairie' as const };
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) map[y][x] = tile('floor', '⬜');
    }
    placePrairie(map, room, () => 0.99);
    const enemies = spawnEnemies(10, [
      { x: 0, y: 0, w: 3, h: 3, theme: 'normal' },
      room,
    ], { x: 0, y: 0 }, 0, map);
    const farmers = enemies.filter(e => e.isFarmer);
    const animals = enemies.filter(e => e.isFarmAnimal);
    expect(farmers).toHaveLength(1);
    expect(farmers[0].emoji).toBe('🧑‍🌾');
    expect(farmers[0].tag).toBe('Friendly');
    expect(farmers[0].tradeStock?.length).toBeGreaterThanOrEqual(3);
    expect(farmers[0].tradeStock?.length).toBeLessThanOrEqual(5);
    expect(animals.length).toBeGreaterThanOrEqual(1);
    expect(animals.length).toBeLessThanOrEqual(3);
    expect(animals.every(a => a.tag === 'Friendly' && a.guardsFarmerId === farmers[0].id)).toBe(true);
    expect(enemies.every(e => e.tag === 'Friendly')).toBe(true);
    for (const e of enemies) {
      expect(map[e.pos.y][e.pos.x].type).toBe('grass');
      expect(e.pos.x).toBeGreaterThanOrEqual(room.x);
      expect(e.pos.x).toBeLessThan(room.x + room.w);
      expect(e.pos.y).toBeGreaterThanOrEqual(room.y);
      expect(e.pos.y).toBeLessThan(room.y + room.h);
    }
    expect(passableTilesForEnemy({ emoji: '🐕', name: 'Farm Dog', isFarmAnimal: true }).has('door-closed')).toBe(false);
    expect(passableTilesForEnemy({ emoji: '🧑‍🌾', name: 'Farmer' }).has('grass')).toBe(true);
  });

  it('wanders inside the grassland and steps back when outside', () => {
    const map = blank(8, 8);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) map[y][x] = tile('grass', GRASS_EMOJI);
    map[3][3] = tile('crop', '🌽');
    const bounds = { x: 1, y: 1, w: 5, h: 5 };
    const farmer = {
      id: 'f', pos: { x: 1, y: 1 }, hp: 10, isFarmer: true, spawnRoomBounds: bounds,
    };
    const passable = ENEMY_PASSABLE_TILES;
    for (let n = 0; n < 20; n++) {
      const intent = farmDenizenIntent(farmer, [farmer], [], map, new Set(), passable, () => 0.9);
      expect(intent.kind).toBe('step');
      if (intent.kind !== 'step') continue;
      expect(intent.pos.x).toBeGreaterThanOrEqual(1);
      expect(intent.pos.x).toBeLessThan(6);
      expect(intent.pos.y).toBeGreaterThanOrEqual(1);
      expect(intent.pos.y).toBeLessThan(6);
      expect(map[intent.pos.y][intent.pos.x].type).not.toBe('crop');
      farmer.pos = intent.pos;
    }
    const outside = farmDenizenIntent(
      { ...farmer, pos: { x: 0, y: 1 } },
      [],
      [],
      map,
      new Set(),
      passable,
      () => 0,
    );
    expect(outside.kind).toBe('step');
    if (outside.kind === 'step') {
      expect(outside.pos.x).toBeGreaterThanOrEqual(1);
    }
  });

  it('sends animals after hostiles near the farmer and ignores friends', () => {
    const map = blank(12, 12);
    for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) map[y][x] = tile('grass', GRASS_EMOJI);
    const bounds = { x: 1, y: 1, w: 6, h: 6 };
    const farmer = { id: 'f', pos: { x: 2, y: 4 }, hp: 14, isFarmer: true, spawnRoomBounds: bounds };
    const dog = { id: 'd', pos: { x: 2, y: 2 }, hp: 8, isFarmAnimal: true, guardsFarmerId: 'f', spawnRoomBounds: bounds };
    const hostile = { id: 'g', pos: { x: 3, y: 2 }, hp: 8, tag: 'Hostile' as const };
    const friend = { id: 'c', pos: { x: 1, y: 2 }, hp: 5, tag: 'Friendly' as const };
    const attack = farmDenizenIntent(dog, [farmer, dog], [hostile, friend, farmer], map, new Set(['3,2', '1,2', '2,4']), ENEMY_PASSABLE_TILES, () => 0.9);
    expect(attack).toEqual({ kind: 'attack', targetId: 'g' });

    const far = { ...hostile, id: 'far', pos: { x: 10, y: 10 } };
    const idle = farmDenizenIntent(dog, [farmer, dog], [far], map, new Set(), ENEMY_PASSABLE_TILES, () => 0);
    expect(idle.kind).not.toBe('attack');

    const chase = farmDenizenIntent(
      dog,
      [farmer, dog],
      [{ id: 'near', pos: { x: 3, y: 4 }, hp: 8 }],
      map,
      new Set(['3,4', '2,4']),
      ENEMY_PASSABLE_TILES,
      () => 0.2,
    );
    expect(chase.kind).toBe('step');
  });
});

describe('farm turns', () => {
  function state(enemies: Enemy[]): GameState {
    const map = blank(8, 8);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) map[y][x] = tile('grass', GRASS_EMOJI);
    map[3][3] = tile('crop', '🌽');
    map[6][6] = tile('floor', '⬜');
    const player: Player = {
      ...playerWith([item({
        id: 'soul-keep', emoji: '🍀', name: 'Clover', description: 'luck',
        bagPassive: { description: 'lucky' },
      })]),
      pos: { x: 6, y: 6 },
    };
    return {
      schemaVersion: 1,
      player,
      currentFloor: 4,
      map,
      enemies,
      items: [],
      turn: 2,
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

  const bounds = { x: 1, y: 1, w: 5, h: 5 };

  it('keeps a wandering farmer inside the grass', () => {
    let current = state([{
      id: 'farmer', emoji: '🧑‍🌾', name: 'Farmer', pos: { x: 1, y: 1 },
      hp: 14, maxHp: 14, attack: 1, defense: 1, speed: 3, engaged: false,
      tag: 'Friendly', isFarmer: true, spawnRoomBounds: bounds,
    }]);
    for (let n = 0; n < 25; n++) {
      current = applyEnemyTurns(current, runEnemyTurns(current));
      const farmer = current.enemies.find(e => e.isFarmer);
      expect(farmer).toBeTruthy();
      expect(farmer!.pos.x).toBeGreaterThanOrEqual(bounds.x);
      expect(farmer!.pos.x).toBeLessThan(bounds.x + bounds.w);
      expect(farmer!.pos.y).toBeGreaterThanOrEqual(bounds.y);
      expect(farmer!.pos.y).toBeLessThan(bounds.y + bounds.h);
      expect(current.map[farmer!.pos.y][farmer!.pos.x].type).not.toBe('crop');
    }
  });

  it('has a farm dog strike an adjacent hostile', () => {
    const current = state([
      {
        id: 'dog', emoji: '🐕', name: 'Farm Dog', pos: { x: 2, y: 2 },
        hp: 8, maxHp: 8, attack: 3, defense: 1, speed: 5, engaged: false,
        tag: 'Friendly', isFarmAnimal: true, guardsFarmerId: 'farmer', spawnRoomBounds: bounds,
      },
      {
        id: 'farmer', emoji: '🧑‍🌾', name: 'Farmer', pos: { x: 2, y: 4 },
        hp: 14, maxHp: 14, attack: 1, defense: 1, speed: 3, engaged: false,
        tag: 'Friendly', isFarmer: true, spawnRoomBounds: bounds,
      },
      {
        id: 'gob', emoji: '👿', name: 'Demon', pos: { x: 3, y: 2 },
        hp: 8, maxHp: 8, attack: 1, defense: 0, speed: 2, engaged: true, tag: 'Hostile',
      },
    ]);
    const next = applyEnemyTurns(current, runEnemyTurns(current));
    const gob = next.enemies.find(e => e.id === 'gob');
    expect(gob ? gob.hp : 0).toBeLessThan(8);
    expect(next.logs.some(l => l.text.includes('defends the farmer')) || (gob && gob.hp < 8)).toBe(true);
    expect(next.player.stats.gold).toBe(40);
  });
});

describe('farmer trade ui and rtfm', () => {
  it('renders a food barter sheet and does not show gold', () => {
    const steak = item({ id: 'steak', emoji: '🥩', name: 'Grilled Steak', healAmount: 12, isCooked: true });
    const gs = {
      schemaVersion: 1,
      player: playerWith([steak], 999),
      currentFloor: 8,
      map: blank(3, 3),
      enemies: [{
        id: 'farmer', emoji: '🧑‍🌾', name: 'Farmer', pos: { x: 1, y: 1 },
        hp: 14, maxHp: 14, attack: 1, defense: 1, speed: 3, engaged: false,
        tag: 'Friendly' as const, isFarmer: true,
        tradeStock: [{ ...soul, id: 'ask' }],
      }],
      items: [],
      turn: 1,
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
    } as GameState;
    const html = renderToStaticMarkup(
      <FarmerTradeModal gameState={gs} setGameState={() => {}} farmerId="farmer" addLog={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain('Farmer');
    expect(html).toContain('Trade');
    expect(html).toContain('🥩');
    expect(html).toContain('No gold');
    expect(html).toContain('min-h-11');
    expect(html).not.toContain('999');
  });

  it('documents the shop in the rules blurb used by RTFM', () => {
    const text = farmerRulesBlurb();
    expect(text).toMatch(/D:3/);
    expect(text).toContain('26');
    expect(text).toContain('18%');
    expect(text).toContain('1.25');
    expect(text).toContain('0.75');
    expect(text).toMatch(/never gold/i);
    expect(text).toContain('🧑‍🌾');
    const rtfm = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(rtfm).toContain('farmerRulesBlurb');
  });
});
