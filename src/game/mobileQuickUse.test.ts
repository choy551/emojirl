import { describe, it, expect } from 'vitest';
import type { EmojiItem } from './types';
import { isMobileQuickUseItem, listMobileQuickUseSlots } from './mobileQuickUse';

function item(partial: Partial<EmojiItem> & Pick<EmojiItem, 'emoji' | 'name'>): EmojiItem {
  return { id: partial.name, description: '', consumed: false, ...partial };
}

describe('mobile quick use', () => {
  it('qualifies aimed actives and lightning, not heals or passive souls', () => {
    expect(isMobileQuickUseItem(item({ emoji: '🔫', name: 'Gun', activeKind: 'gun' }))).toBe(true);
    expect(isMobileQuickUseItem(item({ emoji: '🪢', name: 'Rope', activeKind: 'rope' }))).toBe(true);
    expect(isMobileQuickUseItem(item({ emoji: '⚡', name: 'Lightning' }))).toBe(true);
    expect(isMobileQuickUseItem(item({ emoji: '❤️', name: 'Heart', healAmount: 8 }))).toBe(false);
    expect(isMobileQuickUseItem(item({ emoji: '🍄', name: 'Mushroom', bagPassive: { description: 'x' } }))).toBe(false);
    expect(isMobileQuickUseItem(item({ emoji: '🔫', name: 'Spent', activeKind: 'gun', consumed: true }))).toBe(false);
    expect(isMobileQuickUseItem(item({ emoji: '⚔️', name: 'Sword', isEquipment: true }))).toBe(false);
  });

  it('lists hotbar slots only and skips an empty bar', () => {
    expect(listMobileQuickUseSlots([])).toEqual([]);
    const slots = listMobileQuickUseSlots([
      item({ emoji: '🍄', name: 'Shroom' }),
      item({ emoji: '🔫', name: 'Revolver', activeKind: 'gun' }),
      item({ emoji: '❤️', name: 'Heart', healAmount: 8 }),
      item({ emoji: '⚡', name: 'Bolt' }),
    ]);
    expect(slots.map(s => [s.slot, s.item.emoji])).toEqual([[0, '🔫'], [2, '⚡']]);
  });
});
