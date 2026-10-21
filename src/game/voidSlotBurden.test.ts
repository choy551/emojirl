import { beforeEach, describe, expect, it } from 'vitest';
import type { EmojiItem, Enemy, GameState, MapGrid, Player, Tile } from './types';
import { applyEnemyTurns, runEnemyTurns } from './enemyTurns';
import { replaceEmojiConsumes } from './meta';
import { voidClassTurnDamage } from './voidDamage';
import { consumeVoidBurdenItem } from './voidCharge';
import {
  attributeVoidSlotPressure,
  reclaimVoidSlotPressure,
  releaseVoidSlotBurden,
  syncVoidSlotBurden,
} from './voidSlotBurden';

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

beforeEach(() => {
  localStorage.clear();
  replaceEmojiConsumes({});
});

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 2, y: 2 },
    emoji: '👤',
    characterClass: '👤',
    ammo: 0,
    stats: {
      hp: 10, maxHp: 10, attack: 3, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

function soul(id: string, emoji = '⚡'): EmojiItem {
  return {
    id, emoji, name: emoji, description: 'soul', consumed: false,
    bagPassive: { description: 'soul', attackBonus: 1 },
  };
}

function gun(id = 'gun'): EmojiItem {
  return { id, emoji: '🔫', name: 'Gun', description: 'shots', consumed: false, activeKind: 'gun', charges: 3 };
}

function tile(type: Tile['type'], emoji: string): Tile {
  return { type, emoji, seen: true, visible: true };
}

function state(p: Player, floor = 1): GameState {
  const map: MapGrid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => tile('floor', '⬜')));
  return {
    schemaVersion: 1,
    player: p,
    currentFloor: floor,
    map,
    enemies: [] as Enemy[],
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

describe('per-slot Void pressure', () => {
  it('adds each filled slot an equal share of that turn\'s pressure', () => {
    const held = player({ inventory: [soul('bolt'), soul('heart', '❤️')] });
    const once = attributeVoidSlotPressure(held, 4, 0);
    const share = voidClassTurnDamage(2, 4) / 2;
    expect(share).toBe(5);
    expect(once.voidSlotBurden?.[0]).toEqual({ itemId: 'bolt', dealt: 5 });
    expect(once.voidSlotBurden?.[1]).toEqual({ itemId: 'heart', dealt: 5 });
    const twice = attributeVoidSlotPressure(once, 4, 0);
    expect(twice.voidSlotBurden?.[0]?.dealt).toBe(10);
    expect(twice.voidSlotBurden?.[1]?.dealt).toBe(10);
  });

  it('ignores the earliest filled slots when a drink suppresses pressure', () => {
    const held = player({ inventory: [soul('bolt'), soul('heart', '❤️')] });
    const tracked = attributeVoidSlotPressure(held, 3, 1);
    expect(tracked.voidSlotBurden?.[0]?.dealt).toBe(0);
    expect(tracked.voidSlotBurden?.[1]?.dealt).toBe(4);
  });

  it('does not charge a ghost slot', () => {
    const held = player({
      ghostHotbar: [{ emoji: '🔥', stacks: 1 }, null, null, null, null, null, null, null, null],
      inventory: [soul('bolt')],
    });
    const tracked = attributeVoidSlotPressure(held, 2, 0);
    expect(tracked.voidSlotBurden?.[0]).toEqual({ itemId: null, dealt: 0 });
    expect(tracked.voidSlotBurden?.[1]).toEqual({ itemId: 'bolt', dealt: 3 });
  });

  it('resets a slot when its item moves out', () => {
    let held = player({ inventory: [soul('bolt'), soul('heart', '❤️')] });
    held = attributeVoidSlotPressure(held, 1, 0);
    expect(held.voidSlotBurden?.[0]?.dealt).toBe(2);
    held = { ...held, inventory: [held.inventory[1], held.inventory[0]] };
    held = syncVoidSlotBurden(held);
    expect(held.voidSlotBurden?.[0]).toEqual({ itemId: 'heart', dealt: 0 });
    expect(held.voidSlotBurden?.[1]).toEqual({ itemId: 'bolt', dealt: 0 });
  });

  it('leaves other classes untouched', () => {
    const wizard = player({ emoji: '🧙', characterClass: '🧙', inventory: [soul('bolt')] });
    expect(attributeVoidSlotPressure(wizard, 4, 0)).toBe(wizard);
    expect(reclaimVoidSlotPressure(wizard, wizard.inventory[0]).log).toBeNull();
  });
});

describe('reclaim on consume', () => {
  it('heals half the slot pressure, rounded down', () => {
    let held = player({
      stats: { ...player().stats, hp: 2, maxHp: 20 },
      inventory: [soul('bolt')],
    });
    held = attributeVoidSlotPressure(held, 4, 0);
    held = attributeVoidSlotPressure(held, 4, 0);
    held = attributeVoidSlotPressure(held, 4, 0);
    expect(held.voidSlotBurden?.[0]?.dealt).toBe(15);
    const reclaim = reclaimVoidSlotPressure(held, held.inventory[0]);
    expect(reclaim.heal).toBe(7);
    expect(reclaim.player.stats.hp).toBe(9);
    expect(reclaim.log).toBe('👤 Released ⚡, reclaimed 7 HP');
    const released = releaseVoidSlotBurden(
      { ...reclaim.player, inventory: [] },
      'bolt',
    );
    expect(released.voidSlotBurden?.[0]).toEqual({ itemId: null, dealt: 0 });
  });

  it('rounds a leftover point down', () => {
    const held = player({
      stats: { ...player().stats, hp: 1, maxHp: 20 },
      inventory: [soul('bolt')],
      voidSlotBurden: [{ itemId: 'bolt', dealt: 5 }, ...Array.from({ length: 8 }, () => ({ itemId: null, dealt: 0 }))],
    });
    const reclaim = reclaimVoidSlotPressure(held, held.inventory[0]);
    expect(reclaim.heal).toBe(2);
    expect(reclaim.player.stats.hp).toBe(3);
  });

  it('caps the heal at max HP', () => {
    const held = player({
      stats: { ...player().stats, hp: 8, maxHp: 10 },
      inventory: [soul('bolt')],
      voidSlotBurden: [{ itemId: 'bolt', dealt: 40 }, ...Array.from({ length: 8 }, () => ({ itemId: null, dealt: 0 }))],
    });
    const reclaim = reclaimVoidSlotPressure(held, held.inventory[0]);
    expect(reclaim.heal).toBe(2);
    expect(reclaim.player.stats.hp).toBe(10);
    expect(reclaim.log).toBe('👤 Released ⚡, reclaimed 2 HP');

    const empty = player({
      stats: { ...player().stats, hp: 0, maxHp: 10 },
      inventory: [soul('bolt')],
      voidSlotBurden: [{ itemId: 'bolt', dealt: 100 }, ...Array.from({ length: 8 }, () => ({ itemId: null, dealt: 0 }))],
    });
    const full = reclaimVoidSlotPressure(empty, empty.inventory[0]);
    expect(full.heal).toBe(10);
    expect(full.player.stats.hp).toBe(10);
  });

  it('does not reclaim an item that is not in a hotbar slot', () => {
    const held = player({ inventory: [], bank: [soul('bolt')] });
    const reclaim = reclaimVoidSlotPressure(held, held.bank[0]);
    expect(reclaim.heal).toBe(0);
    expect(reclaim.log).toBeNull();
    expect(reclaim.player.stats.hp).toBe(10);
  });

  it('pays the reclaim when Void unmakes a charge item and then clears the slot', () => {
    let held = player({
      stats: { ...player().stats, hp: 4, maxHp: 20 },
      inventory: [gun()],
    });
    held = attributeVoidSlotPressure(held, 1, 0);
    held = attributeVoidSlotPressure(held, 1, 0);
    expect(held.voidSlotBurden?.[0]?.dealt).toBe(4);
    const result = consumeVoidBurdenItem(held, held.inventory[0], 1);
    expect(result.removed).toBe(true);
    expect(result.player.stats.hp).toBe(6);
    expect(result.logs).toContain('👤 Released 🔫, reclaimed 2 HP');
    expect(result.player.voidSlotBurden?.[0]).toEqual({ itemId: null, dealt: 0 });
    const again = attributeVoidSlotPressure(result.player, 1, 0);
    expect(again.voidSlotBurden?.every(row => row.dealt === 0)).toBe(true);
  });

  it('records the share during an enemy turn', () => {
    const next = applyEnemyTurns(state(player({ inventory: [soul('bolt')] }), 4), runEnemyTurns(state(player({ inventory: [soul('bolt')] }), 4)));
    expect(next.player.stats.hp).toBe(10 - voidClassTurnDamage(1, 4));
    expect(next.player.voidSlotBurden?.[0]).toEqual({ itemId: 'bolt', dealt: 5 });
  });
});
