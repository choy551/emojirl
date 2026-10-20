import { beforeEach, describe, expect, it } from 'vitest';
import type { Enemy, EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { applyNullMomentum, nullMomentumPercent } from './voidDamage';
import { readGhostCatalog, readVoidModeProgress, recordVoidModeConsume } from './voidMeta';
import {
  activeGhostEmojisFor,
  applyEntropicTithe,
  nextVoidAttackMode,
  resolveUnmake,
  voidEmojiTheme,
} from './voidAbilities';

function installStorage() {
  const mem = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
}

installStorage();

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function openMap(): MapGrid {
  return Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => tile('floor', '⬜')));
}

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: '👤',
    characterClass: '👤',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ghostHotbar: Array.from({ length: 9 }, () => null),
    ghostBank: [],
    voidBossesCleared: 0,
    ...over,
  };
}

function state(p: Player, floor = 1, over: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 1,
    player: p,
    currentFloor: floor,
    map: openMap(),
    enemies: [],
    items: [],
    turn: 3,
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
    voidBossesCleared: p.voidBossesCleared ?? 0,
    ...over,
  };
}

function foe(over: Partial<Enemy> = {}): Enemy {
  return {
    id: 'e1',
    pos: { x: 2, y: 1 },
    emoji: '🐀',
    name: 'Rat',
    hp: 8,
    maxHp: 8,
    attack: 10,
    defense: 0,
    speed: 1,
    engaged: true,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('Null Momentum', () => {
  it('is 1% + 1% per level, capped at 44', () => {
    expect(nullMomentumPercent(1)).toBe(2);
    expect(nullMomentumPercent(10)).toBe(11);
    expect(nullMomentumPercent(43)).toBe(44);
    expect(nullMomentumPercent(99)).toBe(44);
  });

  it('reduces Void incoming damage and leaves other classes alone', () => {
    const voidPlayer = player({ stats: { ...player().stats, level: 43 } });
    expect(applyNullMomentum(10, voidPlayer)).toBe(5);
    expect(applyNullMomentum(1, voidPlayer)).toBe(1);
    expect(applyNullMomentum(0, voidPlayer)).toBe(0);
    const wizard = player({ characterClass: '🧙', emoji: '🧙' });
    expect(applyNullMomentum(10, wizard)).toBe(10);
  });

  it('softens an adjacent enemy hit', () => {
    const p = player({ stats: { ...player().stats, level: 43, hp: 20, maxHp: 20, evasion: 0, defense: 0 } });
    const next = applyEnemyTurns(state(p, 1, { enemies: [foe()] }), runEnemyTurns(state(p, 1, { enemies: [foe()] })));
    expect(next.player.stats.hp).toBe(15);
    expect(next.logs.some(l => l.text.includes('for 5 dmg'))).toBe(true);
  });
});

describe('Entropic Tithe', () => {
  it('credits an active ghost and adds no loot when a burn kill lands', () => {
    const p = player({
      ghostHotbar: [{ emoji: '🔥', stacks: 1 }, null, null, null, null, null, null, null, null],
    });
    const burning = foe({ hp: 1, maxHp: 1, burningTurns: 1, pos: { x: 0, y: 0 }, attack: 0 });
    const start = state(p, 2, { enemies: [burning], items: [] });
    const next = applyEnemyTurns(start, runEnemyTurns(start));
    expect(next.enemies.find(e => e.id === 'e1')).toBeUndefined();
    expect(next.items).toHaveLength(0);
    expect(readGhostCatalog()['🔥']?.consumes).toBe(1);
    expect(next.logs.some(l => l.text.includes('Entropic Tithe'))).toBe(true);
  });

  it('ignores a dormant ghost and a real hotbar soul', () => {
    const real: EmojiItem = {
      id: 'fire', emoji: '🔥', name: 'Fire', description: 'soul', consumed: false,
      bagPassive: { description: 'ignite', burningOnHit: true, attackBonus: 1 },
    };
    const dormant = player({
      inventory: [real],
      ghostHotbar: [
        { emoji: '❤️', stacks: 1 },
        { emoji: '🔥', stacks: 1 },
        null, null, null, null, null, null, null,
      ],
    });
    expect(activeGhostEmojisFor(dormant, 'burningOnHit')).toEqual([]);
    const burning = foe({ hp: 1, maxHp: 1, burningTurns: 1, pos: { x: 0, y: 0 }, attack: 0 });
    const start = state(dormant, 1, { enemies: [burning] });
    applyEnemyTurns(start, runEnemyTurns(start));
    expect(readGhostCatalog()['🔥']).toBeUndefined();
  });

  it('unlocks a stack when the tithe crosses 10 consumes', () => {
    const p = player({ ghostHotbar: [{ emoji: '⚡', stacks: 1 }, null, null, null, null, null, null, null, null] });
    let s = state(p);
    for (let i = 0; i < 9; i++) s = applyEntropicTithe(s, 'lightningBolt');
    expect(readGhostCatalog()['⚡']?.unlocks ?? 0).toBe(0);
    s = applyEntropicTithe(s, 'lightningBolt');
    expect(readGhostCatalog()['⚡']?.unlocks).toBe(1);
    expect(s.player.ghostHotbar?.[0]?.stacks).toBe(1);
    expect(s.logs.some(l => l.text.includes('Ghost unlocked: ⚡'))).toBe(true);
  });
});

describe('Void attack modes', () => {
  it('classifies ranged and magic emoji', () => {
    expect(voidEmojiTheme({ emoji: '🏹', name: 'Quiver' })).toBe('ranger');
    expect(voidEmojiTheme({ emoji: '🔫', activeKind: 'gun' })).toBe('ranger');
    expect(voidEmojiTheme({ emoji: '🪃', activeKind: 'boomerang' })).toBe('ranger');
    expect(voidEmojiTheme({ emoji: '🪙', name: 'Bullets' })).toBe('ranger');
    expect(voidEmojiTheme({ emoji: '🪄', weaponKind: 'staff', name: 'Magic Wand' })).toBe('wizard');
    expect(voidEmojiTheme({ emoji: '🧪', name: 'Potion' })).toBe('wizard');
    expect(voidEmojiTheme({ emoji: '🔮', name: 'Crystal Ball' })).toBe('wizard');
    expect(voidEmojiTheme({ emoji: '🌟', name: 'Star' })).toBe('wizard');
    expect(voidEmojiTheme({ emoji: '📖', name: 'Spellbook' })).toBe('wizard');
    expect(voidEmojiTheme({ emoji: '🍎', name: 'Apple' })).toBeNull();
  });

  it('skips locked modes and reports progress', () => {
    const locked = nextVoidAttackMode('melee', { ranger: 4, wizard: 4 });
    expect(locked.mode).toBe('melee');
    expect(locked.hints).toEqual([
      'Ranger autos: 4/10 ranged emoji',
      'Wizard autos: 4/10 magic emoji',
    ]);
    const rangerOpen = nextVoidAttackMode('melee', { ranger: 10, wizard: 4 });
    expect(rangerOpen.mode).toBe('ranger');
    expect(rangerOpen.hints).toEqual([]);
    const skipWizard = nextVoidAttackMode('ranger', { ranger: 10, wizard: 4 });
    expect(skipWizard.mode).toBe('melee');
    expect(skipWizard.hints).toEqual(['Wizard autos: 4/10 magic emoji']);
    const both = nextVoidAttackMode('ranger', { ranger: 10, wizard: 10 });
    expect(both.mode).toBe('wizard');
  });

  it('persists mode progress in the void meta save', () => {
    expect(readVoidModeProgress()).toEqual({ ranger: 0, wizard: 0 });
    const ninth = recordVoidModeConsume('wizard');
    expect(ninth.unlocked).toBe(false);
    for (let i = 0; i < 8; i++) recordVoidModeConsume('wizard');
    const tenth = recordVoidModeConsume('wizard');
    expect(tenth.progress.wizard).toBe(10);
    expect(tenth.unlocked).toBe(true);
    expect(readVoidModeProgress().wizard).toBe(10);
    expect(readVoidModeProgress().ranger).toBe(0);
  });
});

describe('Unmake', () => {
  it('deletes a wall, spends the floor charge, and costs filled slots', () => {
    const map = openMap();
    map[1][2] = tile('wall', '🧱');
    const held: EmojiItem = {
      id: 'soul', emoji: '🍀', name: 'Clover', description: 'soul', consumed: false,
      bagPassive: { description: 'loot', bonusLoot: true },
    };
    const p = player({ inventory: [held, { ...held, id: 'soul2' }] });
    const start = state(p, 4, { map });
    const next = resolveUnmake(start, 2, 1, () => 0.99);
    expect(next.map[1][2].type).toBe('floor');
    expect(next.player.stats.hp).toBe(18);
    expect(next.unmakeUsedFloor).toBe(4);
    const again = resolveUnmake(next, 2, 0, () => 0.99);
    expect(again.player.stats.hp).toBe(18);
    expect(again.map[0][2].type).toBe('floor');
    expect(again.logs[0]?.text).toMatch(/spent/);
  });

  it('damages an enemy for empty slots × floor and can be used again after descending', () => {
    const p = player();
    const start = state(p, 3, { enemies: [foe({ hp: 30, maxHp: 30, attack: 1 })] });
    const next = resolveUnmake(start, 2, 1, () => 0.99);
    expect(next.enemies.find(e => e.id === 'e1')?.hp).toBe(3);
    expect(next.player.stats.hp).toBe(20);
    const deeper = resolveUnmake({
      ...next,
      currentFloor: 4,
      player: { ...next.player, stats: { ...next.player.stats, xp: 100, level: 5 } },
      enemies: [foe({ hp: 5, maxHp: 5 })],
    }, 2, 1, () => 0.99);
    expect(deeper.enemies.find(e => e.id === 'e1')).toBeUndefined();
    expect(deeper.items).toHaveLength(0);
    expect(deeper.unmakeUsedFloor).toBe(4);
  });

  it('does not spend the charge without line of sight', () => {
    const map = openMap();
    map[1][2] = tile('wall', '🧱');
    const start = state(player(), 2, { map });
    const next = resolveUnmake(start, 2, 0, () => 0.99);
    expect(next.unmakeUsedFloor).toBeUndefined();
    expect(next.map[1][2].type).toBe('wall');
    expect(next.logs[0]?.text).toMatch(/line of sight/);
  });
});
