import { describe, it, expect } from 'vitest';
import { moneyBagSellValue, getItemSellValue } from './economy';
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
