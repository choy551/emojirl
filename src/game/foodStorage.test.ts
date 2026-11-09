import { beforeEach, describe, expect, it } from 'vitest';
import { cookOneFromPantry } from './foodSinks';
import { addToPlayerBag } from './inventory';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame } from './save';
import type { EmojiItem, Player } from './types';

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
beforeEach(() => localStorage.clear());

function player(over: Partial<Player> = {}): Player {
  return {
    pos: { x: 1, y: 1 },
    emoji: '🥷',
    characterClass: '🥷',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 4, defense: 0, speed: 2, evasion: 0,
      luck: 0, level: 9, xp: 0, moodValue: 0, gold: 40,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

function food(id: string, emoji: string, name: string): EmojiItem {
  return { id, emoji, name, description: name, consumed: false, healAmount: 2 };
}

describe('food storage', () => {
  it('keeps food out of the hotbar and the Bank, locked or not', () => {
    const apple = food('apple', '🍎', 'Apple');
    const soul = { id: 'soul', emoji: '💀', name: 'Skull', description: 'crit', consumed: false };
    const open = addToPlayerBag(player(), apple);
    expect(open.food.map(item => item.id)).toEqual(['apple']);
    expect(open.inventory).toHaveLength(0);
    expect(open.bank).toHaveLength(0);

    const locked = addToPlayerBag(player({ hotbarLocked: true, inventory: [soul] }), apple, soul);
    expect(locked.food.map(item => item.id)).toEqual(['apple']);
    expect(locked.inventory.map(item => item.id)).toEqual(['soul']);
    expect(locked.bank.map(item => item.id)).toEqual(['soul']);
  });

  it('cooks restaurant food from storage, including food that was on the hotbar', () => {
    const bought = addToPlayerBag(player(), food('shroom', '🍄', 'Mushroom'), food('grapes', '🍇', 'Grapes'));
    const cooked = cookOneFromPantry(player({ food: bought.food }));
    expect(cooked?.log).toContain('🍄');
    expect(cooked?.player.food?.map(item => item.emoji)).toEqual(['🍲', '🍇']);
    expect(cooked?.player.inventory).toHaveLength(0);
    expect(cooked?.player.bank).toHaveLength(0);

    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: 10,
      map: [],
      player: {
        characterClass: '🥷',
        ammo: 0,
        stats: {},
        inventory: [food('berries', '🍓', 'Cooked Berries'), { id: 'soul', emoji: '💀', name: 'Skull', description: '', consumed: false }],
        bank: [food('bread', '🍞', 'Bread')],
        equipment: {},
      },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.state.player.food?.map(item => item.emoji)).toEqual(['🍓', '🍞']);
    expect(loaded.state.player.inventory.map(item => item.emoji)).toEqual(['💀']);
    expect(loaded.state.player.bank).toHaveLength(0);
  });
});
