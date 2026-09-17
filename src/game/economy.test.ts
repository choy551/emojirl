import { describe, it, expect } from 'vitest';
import { moneyBagSellValue, getItemSellValue, isHealJunk, isCookedHeal, COOKED_OVERFLOW_THRESHOLD, pickBestDishesToSell, restaurantCookedPrice } from './economy';
import { MONEY_BAG } from './emojis';
import type { EmojiItem } from './types';

const bag: EmojiItem = { ...MONEY_BAG, id: 'mb', consumed: false };

describe('moneyBagSellValue', () => {
  it('D:1 is 100–200 inclusive', () => {
    for (let i = 0; i < 80; i++) {
      const v = moneyBagSellValue(1);
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThanOrEqual(200);
    }
  });

  it('D:2 is 150–250 inclusive', () => {
    for (let i = 0; i < 80; i++) {
      const v = moneyBagSellValue(2);
      expect(v).toBeGreaterThanOrEqual(150);
      expect(v).toBeLessThanOrEqual(250);
    }
  });

  it('getItemSellValue uses the money-bag formula', () => {
    const v = getItemSellValue(bag, 1, 3);
    expect(v).toBeGreaterThanOrEqual(200);
    expect(v).toBeLessThanOrEqual(300);
  });
});

describe('cooked-heal overflow junk', () => {
  const potion = (id: string): EmojiItem => ({
    id, emoji: '🧪', name: 'Potion', description: 'heal', consumed: false, healAmount: 6,
  });
  const heart = (id: string): EmojiItem => ({
    id, emoji: '🫀', name: 'Heart', description: 'heal', consumed: false, healAmount: 8,
  });
  const apple = (id: string): EmojiItem => ({
    id, emoji: '🍎', name: 'Apple', description: 'raw', consumed: false, healAmount: 2,
  });
  const steak = (id: string): EmojiItem => ({
    id, emoji: '🥩', name: 'Grilled Steak', description: 'cooked', consumed: false, healAmount: 12,
    isCooked: true, cookedBuff: { stat: 'attack', amount: 2, turns: 10 },
  });

  it('locks the threshold at 12', () => {
    expect(COOKED_OVERFLOW_THRESHOLD).toBe(12);
  });

  it('does not junk potions/hearts below 12 cooked', () => {
    expect(isHealJunk(potion('p'), false)).toBe(false);
    expect(isHealJunk(heart('h'), false)).toBe(false);
  });

  it('junks potions/hearts when overflow is on', () => {
    expect(isHealJunk(potion('p'), true)).toBe(true);
    expect(isHealJunk(heart('h'), true)).toBe(true);
  });

  it('never junks cooked steak or raw apple via overflow', () => {
    expect(isCookedHeal(steak('s'))).toBe(true);
    expect(isHealJunk(steak('s'), true)).toBe(false);
    expect(isHealJunk(apple('a'), true)).toBe(false);
    expect(isHealJunk(apple('a'), false)).toBe(false);
  });
});

describe('pickBestDishesToSell', () => {
  const dish = (id: string, heal: number): EmojiItem => ({
    id, emoji: '🥩', name: id, description: 'cooked', consumed: false, healAmount: heal,
    isCooked: true, cookedBuff: { stat: 'attack', amount: 1, turns: 4 },
  });
  const raw = (id: string): EmojiItem => ({
    id, emoji: '🍎', name: 'Apple', description: 'raw', consumed: false, healAmount: 2,
  });

  it('from 0 sold + 6 cooked sells the 4 highest (to 4/5)', () => {
    const items = [dish('a', 4), dish('b', 12), dish('c', 8), dish('d', 6), dish('e', 10), dish('f', 3), raw('r')];
    const picked = pickBestDishesToSell(items, 0);
    expect(picked.map(i => i.id)).toEqual(['b', 'e', 'c', 'd']);
    expect(picked).toHaveLength(4);
  });

  it('from 3 sold + 1 cooked sells that 1 (to 4, not 5)', () => {
    const picked = pickBestDishesToSell([dish('only', 12), raw('r')], 3);
    expect(picked.map(i => i.id)).toEqual(['only']);
  });

  it('from 4 sold + 2 cooked sells only the highest 1 (close kitchen)', () => {
    const picked = pickBestDishesToSell([dish('cheap', 4), dish('best', 12)], 4);
    expect(picked.map(i => i.id)).toEqual(['best']);
  });

  it('gold equals sum of getItemSellValue(i, 2.5) for the sold set', () => {
    const items = [dish('cheap', 4), dish('best', 12)];
    const picked = pickBestDishesToSell(items, 0);
    const gold = picked.reduce((s, i) => s + restaurantCookedPrice(i), 0);
    expect(gold).toBe(picked.reduce((s, i) => s + getItemSellValue(i, 2.5), 0));
    expect(picked.map(i => i.id)).toEqual(['best', 'cheap']);
  });
});
