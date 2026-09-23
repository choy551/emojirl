import { describe, it, expect } from 'vitest';
import { moneyBagSellValue, getItemSellValue, isHealJunk, isCookedHeal, COOKED_OVERFLOW_THRESHOLD, pickBestDishesToSell, restaurantCookedPrice, chefLessonCost, cookedHealBonus, cookedSellBonus, MAX_CHEF_LESSONS, restaurantCookedSellPrice, cookedEatHeal, foodHealLabel, foodHealDescription } from './economy';
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

describe("Chef's Lesson", () => {
  it('uses locked floor costs', () => {
    expect(chefLessonCost(1)).toBe(1000);
    expect(chefLessonCost(10)).toBe(3500);
    expect(chefLessonCost(13)).toBe(4550);
    expect(chefLessonCost(27)).toBe(9450);
    expect(chefLessonCost(32)).toBe(11200);
    expect(MAX_CHEF_LESSONS).toBe(5);
  });

  it('heal and sell bonuses at 5 lessons', () => {
    expect(cookedHealBonus(5, 100)).toBe(40);
    expect(cookedSellBonus(5, 100)).toBe(100);
    expect(cookedHealBonus(0, 100)).toBe(0);
    expect(cookedSellBonus(2, 80)).toBe(20 + 16);
  });

  it('restaurant cooked sell includes lesson bonus', () => {
    const steak: EmojiItem = {
      id: 's', emoji: '🥩', name: 'Steak', description: 'cooked', consumed: false,
      healAmount: 12, isCooked: true,
    };
    const base = getItemSellValue(steak, 2.5);
    expect(restaurantCookedSellPrice(steak, 0)).toBe(base);
    expect(restaurantCookedSellPrice(steak, 5)).toBe(base + cookedSellBonus(5, base));
    expect(restaurantCookedPrice(steak, 5)).toBe(restaurantCookedSellPrice(steak, 5));
  });

  it('cooked eat heal and labels include lesson bonus', () => {
    const steak: EmojiItem = {
      id: 's', emoji: '🥩', name: 'Grilled Steak',
      description: '+12 HP & +2 ATK for 10 turns', consumed: false,
      healAmount: 12, isCooked: true,
    };
    const apple: EmojiItem = {
      id: 'a', emoji: '🍎', name: 'Apple',
      description: 'Restores 2 HP · cook on 🔥 for more', consumed: false,
      healAmount: 2,
    };
    expect(cookedEatHeal(steak, 0, 100)).toBe(12);
    expect(cookedEatHeal(steak, 5, 100)).toBe(52);
    expect(cookedEatHeal(apple, 5, 100)).toBe(2);
    expect(foodHealLabel(steak, 0, 100)).toBe('+12 HP');
    expect(foodHealLabel(steak, 5, 100)).toBe('+52 HP (12 + 40 Chef)');
    expect(foodHealLabel(apple, 5, 100)).toBe('+2 HP');
    expect(foodHealDescription(steak, 5, 100)).toBe('+52 HP & +2 ATK for 10 turns (12 + 40 Chef)');
    expect(foodHealDescription(steak, 5, 100, false)).toBe('+52 HP & +2 ATK for 10 turns');
    expect(foodHealDescription(apple, 5, 100)).toBe('Restores 2 HP · cook on 🔥 for more');
  });
});
