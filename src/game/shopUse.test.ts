import { describe, it, expect, beforeEach } from 'vitest';
import type { Enemy, EmojiItem, GameState, MapGrid, Player, Tile } from './types';
import { canBuyAndUse, isShopDirectUseBlocked, applyInstantItemUse, hasVisibleEnemy } from './shopUse';
import { _flashSignals } from './flashSignals';

function tile(type: Tile['type'], emoji: string, visible = true): Tile {
  return { type, emoji, seen: true, visible };
}

function floorGrid(): MapGrid {
  return Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => tile('floor', '⬜')),
  );
}

function playerAt(over: Partial<Player['stats']> = {}): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 6, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 50,
      ...over,
    },
    inventory: Array.from({ length: 9 }, (_, i) => ({
      id: `slot-${i}`, emoji: '🍀', name: 'Clover', description: 'luck', consumed: false,
      bagPassive: { description: 'loot', bonusLoot: true },
    })),
    bank: [],
    equipment: {},
  };
}

function goblin(): Enemy {
  return {
    id: 'g1', pos: { x: 4, y: 2 }, emoji: '👺', name: 'Goblin',
    hp: 5, maxHp: 5, attack: 4, defense: 0, speed: 3, engaged: true,
  };
}

function state(over: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: 1,
    player: playerAt(),
    currentFloor: 1,
    map: floorGrid(),
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
    ...over,
  };
}

const apple: EmojiItem = {
  id: 'apple', emoji: '🍎', name: 'Apple', description: 'heal', consumed: false, healAmount: 4,
};
const lightning: EmojiItem = {
  id: 'zap', emoji: '⚡', name: 'Lightning', description: 'zap', consumed: false,
  effect: { instakillNearest: true, moodBonus: 10, label: 'Lightning strikes!' },
} as EmojiItem;
const gun: EmojiItem = {
  id: 'gun', emoji: '🔫', name: 'Gun', description: 'gun', consumed: false, activeKind: 'gun',
};
const sword: EmojiItem = {
  id: 'eq', emoji: '🗡️', name: 'Iron Sword', description: 'eq', consumed: false, isEquipment: true, equipSlots: ['mainHand'],
};

describe('canBuyAndUse', () => {
  it('allows heals when affordable and not at full HP, even with a full hotbar', () => {
    expect(canBuyAndUse(apple, state(), 10)).toEqual({ ok: true });
  });

  it('blocks heals at full HP', () => {
    const s = state({ player: playerAt({ hp: 10, maxHp: 10 }) });
    expect(canBuyAndUse(apple, s, 10)).toEqual({ ok: false, reason: 'Already at full HP' });
  });

  it('blocks when broke', () => {
    const s = state({ player: playerAt({ gold: 3 }) });
    expect(canBuyAndUse(apple, s, 10)).toEqual({ ok: false, reason: 'Not enough gold' });
  });

  it('blocks money bags — they are for selling', () => {
    const bag: EmojiItem = { id: 'mb', emoji: '💰', name: 'Money Bag', description: 'coins', consumed: false, isMoneyBag: true };
    expect(isShopDirectUseBlocked(bag)).toBe(true);
    expect(canBuyAndUse(bag, state(), 10)).toEqual({ ok: false, reason: 'Sell it at the shop' });
  });

  it('blocks aimed actives and equipment', () => {
    expect(isShopDirectUseBlocked(gun)).toBe(true);
    expect(isShopDirectUseBlocked(sword)).toBe(true);
    expect(canBuyAndUse(gun, state(), 10).ok).toBe(false);
    expect(canBuyAndUse(sword, state(), 10).ok).toBe(false);
  });

  it('allows Buy & Use for Rope', () => {
    const rope: EmojiItem = {
      id: 'r1', emoji: '🪢', name: 'Rope', description: 'vault', consumed: false, activeKind: 'rope', charges: 1,
    };
    expect(isShopDirectUseBlocked(rope)).toBe(false);
    expect(canBuyAndUse(rope, state(), 10)).toEqual({ ok: true });
  });

  it('blocks lightning with no visible foe, allows with one', () => {
    expect(canBuyAndUse(lightning, state(), 10)).toEqual({ ok: false, reason: 'No enemies on screen' });
    const s = state({ enemies: [goblin()] });
    expect(hasVisibleEnemy(s)).toBe(true);
    expect(canBuyAndUse(lightning, s, 10)).toEqual({ ok: true });
  });
});

describe('applyInstantItemUse', () => {
  beforeEach(() => { _flashSignals.lightningFlashPending = false; });

  it('shop soul consume writes catalog flavor into combat logs even without item.effect', () => {
    const logs: string[] = [];
    const mushroom: EmojiItem = {
      id: 'shroom', emoji: '🍄', name: 'Mushroom', description: '+3 HP', consumed: false,
    };
    const next = applyInstantItemUse(state(), mushroom, { source: 'shop', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    expect(next).not.toBeNull();
    expect(next!.player.stats.hp).toBe(9);
    expect(next!.player.stats.speed).toBe(6);
    expect(next!.logs[0].text).toBe('🍄 Strange mushroom energy flows through you!');
    expect(logs).toContain('🍄 Strange mushroom energy flows through you!');
  });

  it('bag-use of a money bag logs a tip and is not consumed', () => {
    const logs: string[] = [];
    const bag: EmojiItem = { id: 'mb', emoji: '💰', name: 'Money Bag', description: 'coins', consumed: false, isMoneyBag: true };
    const s = state();
    const next = applyInstantItemUse(s, bag, { source: 'bag', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    expect(next).not.toBeNull();
    expect(next!.player.stats.gold).toBe(s.player.stats.gold);
    expect(next!.player.inventory).toHaveLength(s.player.inventory.length);
    expect(logs.some(l => l.includes('sell it at a shop'))).toBe(true);
  });

  it('cooked eats gain chef-lesson bonus; raw does not', () => {
    const logs: string[] = [];
    const steak: EmojiItem = {
      id: 'st', emoji: '🥩', name: 'Steak', description: 'cooked', consumed: false,
      healAmount: 4, isCooked: true,
    };
    const raw: EmojiItem = {
      id: 'ap', emoji: '🍎', name: 'Apple', description: 'raw', consumed: false, healAmount: 4,
    };
    const s0 = state({ chefLessonCount: 0, player: playerAt({ hp: 6, maxHp: 100, gold: 50 }) });
    const n0 = applyInstantItemUse(s0, steak, { source: 'bag', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    const s2 = state({ chefLessonCount: 2, player: playerAt({ hp: 6, maxHp: 100, gold: 50 }) });
    const n2 = applyInstantItemUse(s2, steak, { source: 'bag', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    expect(n0!.player.stats.hp).toBe(10);
    expect(n2!.player.stats.hp).toBe(6 + 4 + 10 + 6);
    const r0 = applyInstantItemUse(s0, raw, { source: 'bag', addLog: () => {}, applyMonkeyDropOnKill: (_k, p) => p });
    const r2 = applyInstantItemUse(s2, raw, { source: 'bag', addLog: () => {}, applyMonkeyDropOnKill: (_k, p) => p });
    expect(r0!.player.stats.hp).toBe(r2!.player.stats.hp);
  });

  it('heals without adding to inventory (full hotbar stays 9)', () => {
    const logs: string[] = [];
    const s = state();
    const next = applyInstantItemUse(s, apple, { source: 'shop', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    expect(next).not.toBeNull();
    expect(next!.player.stats.hp).toBe(10);
    expect(next!.player.inventory).toHaveLength(9);
    expect(logs.some(l => l.includes('+4 HP'))).toBe(true);
  });

  it('shop lightning uses shopkeeper log and flashes', () => {
    const logs: string[] = [];
    const s = state({ enemies: [goblin()] });
    const next = applyInstantItemUse(s, lightning, { source: 'shop', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    expect(next).not.toBeNull();
    expect(next!.enemies).toHaveLength(0);
    expect(_flashSignals.lightningFlashPending).toBe(true);
    expect(logs.some(l => l.includes('Shopkeeper') && l.includes('Goblin'))).toBe(true);
    expect(logs.some(l => l.includes('ZAP!'))).toBe(false);
  });

  it('bag lightning uses ZAP log and flashes', () => {
    const logs: string[] = [];
    const s = state({ enemies: [goblin()] });
    const next = applyInstantItemUse(s, lightning, { source: 'bag', addLog: t => logs.push(t), applyMonkeyDropOnKill: (_k, p) => p });
    expect(next).not.toBeNull();
    expect(_flashSignals.lightningFlashPending).toBe(true);
    expect(logs.some(l => l.includes('ZAP!'))).toBe(true);
    expect(logs.some(l => l.includes('Shopkeeper'))).toBe(false);
  });
});
