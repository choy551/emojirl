import { describe, expect, it } from 'vitest';
import type { EmojiItem } from './types';
import { addToBag, addToBagCapped } from './inventory';
import { STACKABLE_BAG_CAPS } from './passives';

function soul(id: string, emoji: string): EmojiItem {
  return {
    id,
    emoji,
    name: emoji,
    description: 'soul',
    consumed: false,
    bagPassive: { description: 'unique', nonStackable: true },
  };
}

function clover(id: string, stackCount = 1): EmojiItem {
  return {
    id,
    emoji: '🍀',
    name: 'Clover',
    description: 'loot',
    consumed: false,
    stackCount,
    bagPassive: { description: 'loot', bonusLoot: true },
  };
}

describe('emoji pickups fill empty hotbar slots', () => {
  it('does not bank a new stackable just because the bar is taller than its stack cap', () => {
    const inventory = [soul('a', '🔥'), soul('b', '🌟'), soul('c', '🌙'), soul('d', '👑')];
    const { inventory: next, bank } = addToBag(inventory, [], clover('clover'));
    expect(next.some(i => i.id === 'clover')).toBe(true);
    expect(bank).toHaveLength(0);
  });

  it('banks a new emoji only after all 9 hotbar slots are taken', () => {
    const inventory = ['🔥', '🌟', '🌙', '👑', '🧲', '🧊', '⛵', '💀', '🔮'].map((emoji, i) => soul(`s${i}`, emoji));
    const { inventory: next, bank } = addToBag(inventory, [], clover('clover'));
    expect(next.some(i => i.emoji === '🍀')).toBe(false);
    expect(bank.map(i => i.id)).toEqual(['clover']);
  });

  it('keeps the stack on an empty slot and banks only copies past the stack cap', () => {
    const inventory = [soul('a', '🔥'), soul('b', '🌟'), soul('c', '🌙')];
    const { inventory: next, bank } = addToBag(inventory, [], clover('clover', 5));
    expect(next.find(i => i.emoji === '🍀')?.stackCount).toBe(STACKABLE_BAG_CAPS['🍀']);
    expect(bank[0]?.stackCount).toBe(2);
  });

  it('still uses ghost-reserved room, not the stack cap, as the hotbar limit', () => {
    const four = [soul('a', '🔥'), soul('b', '🌟'), soul('c', '🌙'), soul('d', '👑')];
    const open = addToBagCapped(four, [], 6, clover('open'));
    expect(open.inventory.some(i => i.id === 'open')).toBe(true);
    expect(open.bank).toHaveLength(0);

    const six = ['🔥', '🌟', '🌙', '👑', '🧲', '🧊'].map((emoji, i) => soul(`f${i}`, emoji));
    const full = addToBagCapped(six, [], 6, clover('full'));
    expect(full.bank.map(i => i.id)).toEqual(['full']);
  });
});
