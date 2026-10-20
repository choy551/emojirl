import { describe, it, expect } from 'vitest';
import type { EmojiItem } from './types';
import {
  BAG_DOUBLE_TAP_MS,
  bagConsumeRefusal,
  bagDoubleTapDisposition,
  canConsumeBagItem,
  consumeButtonMode,
  mobileBagUseClosesBag,
  resolveBagSlotClick,
} from './bagConsume';

function item(partial: Partial<EmojiItem> & Pick<EmojiItem, 'emoji' | 'name'>): EmojiItem {
  return { id: partial.id ?? partial.name, description: '', consumed: false, ...partial };
}

const apple = item({ emoji: '🍎', name: 'Apple', healAmount: 2 });
const clover = item({ emoji: '🍀', name: 'Clover', bagPassive: { description: 'loot', bonusLoot: true } });
const rope = item({ emoji: '🪢', name: 'Rope', activeKind: 'rope' });
const gun = item({ emoji: '🔫', name: 'Gun', activeKind: 'gun', charges: 3 });
const money = item({ emoji: '💰', name: 'Money Bag', isMoneyBag: true });
const sword = item({ emoji: '🗡️', name: 'Sword', isEquipment: true });
const quiver = item({ emoji: '🏹', name: 'Quiver', ammoAmount: 5 });
const mystery = item({ emoji: '📦', name: 'Crate' });

describe('canConsumeBagItem', () => {
  it('allows food, souls, and rope', () => {
    expect(canConsumeBagItem(apple)).toBe(true);
    expect(canConsumeBagItem(clover)).toBe(true);
    expect(canConsumeBagItem(rope)).toBe(true);
    expect(canConsumeBagItem(item({ emoji: '🍀', name: 'Catalog clover' }))).toBe(true);
  });

  it('rejects gear, ammo, money, aimed weapons, and unknown items', () => {
    expect(canConsumeBagItem(gun)).toBe(false);
    expect(canConsumeBagItem(money)).toBe(false);
    expect(canConsumeBagItem(sword)).toBe(false);
    expect(canConsumeBagItem(quiver)).toBe(false);
    expect(canConsumeBagItem(mystery)).toBe(false);
    expect(canConsumeBagItem(null)).toBe(false);
    expect(canConsumeBagItem({ ...apple, consumed: true })).toBe(false);
    expect(canConsumeBagItem(item({ emoji: '🍀', name: 'Ghost', bagPassive: { description: 'loot', bonusLoot: true }, isVoidGhost: true }))).toBe(false);
  });
});

describe('bag double-tap disposition', () => {
  it('uses the hotbar path for consumables and aimed weapons', () => {
    expect(bagDoubleTapDisposition(apple)).toBe('use');
    expect(bagDoubleTapDisposition(clover)).toBe('use');
    expect(bagDoubleTapDisposition(rope)).toBe('use');
    expect(bagDoubleTapDisposition(gun)).toBe('use');
  });

  it('refuses items that must not be spent', () => {
    for (const it of [money, sword, quiver, mystery, { ...apple, consumed: true }, item({ emoji: '🍀', name: 'Ghost', bagPassive: { description: 'loot' }, isVoidGhost: true })]) {
      expect(bagDoubleTapDisposition(it)).toBe('refuse');
      expect(bagConsumeRefusal(it).length).toBeGreaterThan(0);
    }
  });
});

describe('consume button', () => {
  it('stays hidden unless the mobile info screen offers it', () => {
    expect(consumeButtonMode(false, apple)).toBe('hidden');
    expect(consumeButtonMode(false, gun)).toBe('hidden');
  });

  it('enables consumables and greys out the rest', () => {
    expect(consumeButtonMode(true, apple)).toBe('enabled');
    expect(consumeButtonMode(true, rope)).toBe('enabled');
    expect(consumeButtonMode(true, gun)).toBe('disabled');
    expect(consumeButtonMode(true, money)).toBe('disabled');
  });
});

describe('mobileBagUseClosesBag', () => {
  it('closes for aiming and the boat warning, not for a normal soul', () => {
    expect(mobileBagUseClosesBag(gun)).toBe(true);
    expect(mobileBagUseClosesBag(item({ emoji: '⛵', name: 'Boat' }))).toBe(true);
    expect(mobileBagUseClosesBag(clover)).toBe(false);
    expect(mobileBagUseClosesBag(rope)).toBe(false);
  });
});

describe('resolveBagSlotClick', () => {
  const base = {
    mobile: true,
    slot: 2,
    item: clover,
    selectedItemId: null as string | null,
    now: 1_000,
    last: null,
  };

  it('selects on a single tap and remembers it', () => {
    const first = resolveBagSlotClick(base);
    expect(first.action).toBe('select');
    expect(first.last).toEqual({ slot: 2, at: 1_000, selectOnly: true });
  });

  it('uses the slot on a second tap inside the window', () => {
    const first = resolveBagSlotClick(base);
    const second = resolveBagSlotClick({
      ...base,
      now: base.now + BAG_DOUBLE_TAP_MS,
      last: first.last,
      selectedItemId: clover.id,
    });
    expect(second.action).toBe('use');
    expect(second.last).toBeNull();
  });

  it('does not treat a slow second tap as consume', () => {
    const first = resolveBagSlotClick(base);
    const second = resolveBagSlotClick({
      ...base,
      now: base.now + BAG_DOUBLE_TAP_MS + 1,
      last: first.last,
      selectedItemId: clover.id,
    });
    expect(second.action).toBe('select');
  });

  it('refuses a double-tap on a non-consumable without selecting again', () => {
    const first = resolveBagSlotClick({ ...base, item: money });
    const second = resolveBagSlotClick({
      ...base,
      item: money,
      now: base.now + 200,
      last: first.last,
      selectedItemId: money.id,
    });
    expect(second.action).toBe('refuse');
  });

  it('keeps a swap when another item is already selected', () => {
    const first = resolveBagSlotClick({ ...base, selectedItemId: 'other' });
    expect(first.action).toBe('select');
    expect(first.last?.selectOnly).toBe(false);
    const second = resolveBagSlotClick({
      ...base,
      now: base.now + 100,
      last: first.last,
      selectedItemId: null,
    });
    expect(second.action).toBe('select');
  });

  it('does not consume across different slots', () => {
    const first = resolveBagSlotClick(base);
    const second = resolveBagSlotClick({
      ...base,
      slot: 4,
      now: base.now + 100,
      last: first.last,
    });
    expect(second.action).toBe('select');
    expect(second.last?.slot).toBe(4);
  });

  it('leaves desktop clicks and empty slots on the select path', () => {
    const desktop = resolveBagSlotClick({ ...base, mobile: false });
    expect(desktop).toEqual({ action: 'select', last: null });
    const again = resolveBagSlotClick({
      ...base,
      mobile: false,
      now: base.now + 100,
      last: { slot: 2, at: base.now, selectOnly: true },
    });
    expect(again.action).toBe('select');
    const empty = resolveBagSlotClick({ ...base, item: null });
    expect(empty.action).toBe('select');
  });
});
