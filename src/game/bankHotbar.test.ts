import { describe, expect, it } from 'vitest';
import type { EmojiItem, Player } from './types';
import { applyBankToHotbarSlot, bankSelectionAfterTap, buildHotbarSlots } from './inventory';
import { STACKABLE_BAG_CAPS, hotbarCountBadge } from './passives';

function soul(id: string, emoji: string, extra: Partial<EmojiItem> = {}): EmojiItem {
  return { id, emoji, name: emoji, description: 'soul', consumed: false, ...extra };
}

function player(inventory: EmojiItem[], bank: EmojiItem[], extra: Partial<Player> = {}): Player {
  return {
    pos: { x: 0, y: 0 },
    emoji: '🧝',
    characterClass: '🧝',
    ammo: 0,
    stats: {
      hp: 10, maxHp: 10, attack: 1, defense: 0, speed: 1, evasion: 0,
      luck: 0, level: 1, xp: 0, moodValue: 0, gold: 0,
    },
    inventory,
    bank,
    equipment: {},
    ...extra,
  } as Player;
}

describe('bank tap into a hotbar slot', () => {
  it('swaps into an occupied slot without losing either emoji', () => {
    const insured = soul('insured-heart', '❤️');
    const start = player(
      [soul('heart', '❤️', { bagPassive: { description: 'life', vampiricStrike: true } })],
      [soul('moon', '🌙', { bagPassive: { description: 'stealth', nonStackable: true } })],
      { insurance: { items: [insured] } },
    );
    const next = applyBankToHotbarSlot(start, 'moon', 0);
    expect(buildHotbarSlots(next)[0]?.id).toBe('moon');
    expect(next.bank.map(i => i.id)).toEqual(['heart']);
    expect(next.inventory.map(i => i.id)).toEqual(['moon']);
    expect(next.insurance?.items.map(i => i.id)).toEqual(['insured-heart']);
  });

  it('moves a bank emoji into an empty slot', () => {
    const start = player([], [soul('moon', '🌙', { bagPassive: { description: 'stealth', nonStackable: true } })]);
    const next = applyBankToHotbarSlot(start, 'moon', 0);
    expect(buildHotbarSlots(next)[0]?.id).toBe('moon');
    expect(next.bank).toHaveLength(0);
  });

  it('merges a stackable up to the cap and leaves the overflow in the bank', () => {
    const cap = STACKABLE_BAG_CAPS['🍀'];
    const start = player(
      [soul('hot', '🍀', { stackCount: cap - 1, bagPassive: { description: 'loot', bonusLoot: true } })],
      [soul('bank', '🍀', { stackCount: 3, bagPassive: { description: 'loot', bonusLoot: true } })],
    );
    const next = applyBankToHotbarSlot(start, 'bank', 0);
    const hot = next.inventory.find(i => i.id === 'hot');
    const left = next.bank.find(i => i.id === 'bank');
    expect(hot?.stackCount).toBe(cap);
    expect(left?.stackCount).toBe(3 - 1);
    expect(hotbarCountBadge(hot!, left!.stackCount ?? 1).map(b => b.className)).toEqual([
      'text-emerald-400',
      'text-sky-400',
    ]);
    expect(next.inventory.filter(i => i.emoji === '🍀')).toHaveLength(1);
  });

  it('refuses a duplicate passive and equipment that does not belong in the hotbar', () => {
    const moon = soul('moon-hot', '🌙', { bagPassive: { description: 'stealth', nonStackable: true } });
    const extra = soul('moon-bank', '🌙', { bagPassive: { description: 'stealth', nonStackable: true } });
    const start = player([moon], [extra]);
    expect(applyBankToHotbarSlot(start, 'moon-bank', 1)).toBe(start);

    const musket = soul('musket', '🔫', { isEquipment: true, weaponKind: 'gun', gunTier: 'musket' });
    const cowboy = player([], [musket], { characterClass: '🤠', emoji: '🤠' });
    expect(applyBankToHotbarSlot(cowboy, 'musket', 0)).toBe(cowboy);
  });

  it('cancels when the selected emoji is tapped again', () => {
    expect(bankSelectionAfterTap('moon', 'moon')).toBeNull();
    expect(bankSelectionAfterTap(null, 'moon')).toBe('moon');
  });
});
