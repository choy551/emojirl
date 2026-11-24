import { beforeEach, describe, expect, it } from 'vitest';
import { cookOneFromPantry } from './foodSinks';
import { addToPlayerBag } from './inventory';
import { SAVE_KEY, SAVE_SCHEMA_VERSION, loadGame } from './save';
import type { EmojiItem, Player } from './types';
import {
  RESTAURANT_RESALE_NOTE,
  foodCarryKey,
  foodHealDescription,
  getItemBuyPrice,
  isHealJunk,
  isRestaurantBought,
  pickBestDishesToSell,
  restaurantCanResell,
  restaurantCookedSellPrice,
  tagRestaurantPurchase,
} from './economy';

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
    emoji: '🧙',
    characterClass: '🧙',
    ammo: 0,
    stats: {
      hp: 20, maxHp: 20, attack: 3, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 500,
    },
    inventory: [],
    bank: [],
    equipment: {},
    ...over,
  };
}

const steak = (): EmojiItem => ({
  id: 'menu-steak',
  emoji: '🥩',
  name: 'Grilled Steak',
  description: '+12 HP & +2 ATK for 10 turns',
  consumed: false,
  healAmount: 12,
  isCooked: true,
  cookedBuff: { stat: 'attack', amount: 2, turns: 10 },
});

const apple = (): EmojiItem => ({
  id: 'menu-apple',
  emoji: '🍎',
  name: 'Apple',
  description: 'Restores 2 HP',
  consumed: false,
  healAmount: 2,
});

describe('restaurant resale', () => {
  it('blocks the buy-then-sell profit on cooked menu food', () => {
    const menu = steak();
    const floor = 10;
    const lessons = 5;
    const buy = getItemBuyPrice(menu, floor);
    const resale = restaurantCookedSellPrice(menu, lessons);
    expect(resale).toBeGreaterThan(buy);

    const bought = tagRestaurantPurchase({ ...menu, id: 'bought' });
    expect(bought.restaurantBought).toBe(true);
    expect(restaurantCanResell(bought)).toBe(false);
    expect(pickBestDishesToSell([bought], 0)).toEqual([]);
    expect(isHealJunk(bought, true)).toBe(false);

    const cooked = steak();
    cooked.id = 'home';
    expect(restaurantCanResell(cooked)).toBe(true);
    expect(pickBestDishesToSell([bought, cooked], 0).map(item => item.id)).toEqual(['home']);
  });

  it('leaves raw purchases and home cooking sellable, and keeps the piles apart', () => {
    const raw = tagRestaurantPurchase(apple());
    expect(isRestaurantBought(raw)).toBe(false);
    const stored = addToPlayerBag(player(), raw, tagRestaurantPurchase(steak()));
    const cooked = cookOneFromPantry(player({ food: stored.food }));
    const dishes = cooked?.player.food ?? [];
    expect(dishes.map(item => item.emoji)).toEqual(['🍏', '🥩']);
    expect(dishes[0]?.restaurantBought).toBeUndefined();
    expect(dishes[1]?.restaurantBought).toBe(true);
    expect(foodCarryKey(dishes[0]!)).not.toBe(foodCarryKey(dishes[1]!));

    const home = steak();
    home.id = 'found';
    const again = addToPlayerBag(player(), tagRestaurantPurchase(steak()), home);
    expect(again.food).toHaveLength(2);
    expect(foodCarryKey(again.food[0]!)).not.toBe(foodCarryKey(again.food[1]!));
    expect(again.food.filter(item => item.restaurantBought).map(item => item.id)).toEqual(['menu-steak']);
    expect(pickBestDishesToSell(again.food, 0).map(item => item.id)).toEqual(['found']);
  });

  it('shows the resale note and keeps the tag through save/load without a schema bump', () => {
    const bought = tagRestaurantPurchase(steak());
    expect(foodHealDescription(bought, 0, 20)).toContain(RESTAURANT_RESALE_NOTE);
    expect(foodHealDescription(steak(), 5, 100)).not.toContain(RESTAURANT_RESALE_NOTE);

    const onion = apple();
    onion.emoji = '🧅';
    onion.healAmount = 1;
    onion.restaurantBought = true;
    expect(isHealJunk(onion, false)).toBe(false);

    localStorage.setItem(SAVE_KEY, JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION,
      map: [],
      player: {
        characterClass: '🧙',
        ammo: 0,
        stats: {},
        inventory: [],
        bank: [],
        food: [bought],
        equipment: {},
      },
    }));
    const loaded = loadGame();
    expect(loaded.kind).toBe('ok');
    if (loaded.kind !== 'ok') return;
    expect(loaded.state.schemaVersion).toBe(13);
    expect(loaded.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.state.player.food?.[0]?.restaurantBought).toBe(true);
    expect(loaded.state.player.food?.[0]?.emoji).toBe('🥩');
  });
});
