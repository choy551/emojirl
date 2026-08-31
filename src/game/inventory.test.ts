import { describe, it, expect } from 'vitest';
import type { EmojiItem } from './types';
import { removeAndRefillBag, refillBagFromBank, sortBagSlots } from './inventory';

function ice(id: string): EmojiItem {
  return {
    id,
    emoji: '🧊',
    name: 'Ice',
    description: 'aura slows',
    consumed: false,
    bagPassive: { description: 'aura slows', freezeAura: true, nonStackable: true, defenseBonus: 1, evasionBonus: 1 },
  };
}

function fire(id: string): EmojiItem {
  return {
    id,
    emoji: '🔥',
    name: 'Fire',
    description: 'ignite',
    consumed: false,
    bagPassive: { description: 'ignite', burningOnHit: true, nonStackable: true, attackBonus: 1 },
  };
}

function star(id: string): EmojiItem {
  return {
    id,
    emoji: '🌟',
    name: 'Star',
    description: 'vision',
    consumed: false,
    bagPassive: { description: 'vision', losBonus: 1, stealthPenalty: 1, nonStackable: true },
  };
}

function moon(id: string): EmojiItem {
  return {
    id,
    emoji: '🌙',
    name: 'Moon',
    description: 'stealth',
    consumed: false,
    bagPassive: { description: 'stealth', losBonus: -1, stealthBonus: 1, nonStackable: true },
  };
}

function crown(id: string): EmojiItem {
  return {
    id,
    emoji: '👑',
    name: 'Crown',
    description: 'royal aura',
    consumed: false,
    bagPassive: { description: 'royal aura', royalAura: true, nonStackable: true },
  };
}

function magnet(id: string): EmojiItem {
  return {
    id,
    emoji: '🧲',
    name: 'Magnet',
    description: 'item magnet',
    consumed: false,
    bagPassive: { description: 'item magnet', itemMagnet: true, nonStackable: true },
  };
}

function boat(id: string): EmojiItem {
  return {
    id,
    emoji: '⛵',
    name: 'Boat',
    description: 'swim',
    consumed: false,
    bagPassive: { description: 'swim', canSwim: true, nonStackable: true },
  };
}

function heart(id: string, stackCount = 1): EmojiItem {
  return {
    id,
    emoji: '❤️',
    name: 'Heart',
    description: 'life steal',
    consumed: false,
    stackCount,
    bagPassive: { description: 'Each hit restores 1 HP', vampiricStrike: true },
  };
}

function gun(id: string): EmojiItem {
  return {
    id,
    emoji: '🔫',
    name: 'Gun',
    description: 'shoot',
    consumed: false,
    activeKind: 'gun',
    charges: 3,
  };
}

/** 7-item hotbar with Ice on key 6 (index 5); keys 8–9 empty. */
function sevenSlotBagWithIceAt6() {
  return [
    fire('f1'),
    star('s1'),
    moon('m1'),
    crown('c1'),
    magnet('g1'),
    ice('ice-hot'),
    boat('b1'),
  ];
}

describe('removeAndRefillBag hotbar slot stability', () => {
  it('keeps Ice on hotbar key 6 when a banked extra Ice replaces it', () => {
    const inventory = sevenSlotBagWithIceAt6();
    const bank = [ice('ice-bank')];

    expect(sortBagSlots(inventory).map(i => i.emoji)).toEqual(['🔥', '🌟', '🌙', '👑', '🧲', '🧊', '⛵']);

    const { inventory: next, bank: nextBank } = removeAndRefillBag(inventory, bank, 'ice-hot');
    const slots = sortBagSlots(next);

    expect(slots.map(i => i.emoji)).toEqual(['🔥', '🌟', '🌙', '👑', '🧲', '🧊', '⛵']);
    expect(slots[5].id).toBe('ice-bank');
    expect(slots.map(i => i.id)).toEqual(['f1', 's1', 'm1', 'c1', 'g1', 'ice-bank', 'b1']);
    expect(nextBank).toHaveLength(0);
  });

  it('prefers the matching Ice extra even if another eligible Bank item is first', () => {
    const inventory = sevenSlotBagWithIceAt6();
    const bank = [star('star-bank'), ice('ice-bank')];

    const { inventory: next, bank: nextBank } = removeAndRefillBag(inventory, bank, 'ice-hot');
    const slots = sortBagSlots(next);

    expect(slots[5].emoji).toBe('🧊');
    expect(slots[5].id).toBe('ice-bank');
    expect(slots.map(i => i.id)).toEqual(['f1', 's1', 'm1', 'c1', 'g1', 'ice-bank', 'b1']);
    expect(nextBank.map(i => i.id)).toEqual(['star-bank']);
  });

  it('does not pull Ice Arrows equipment as the Ice extra', () => {
    const inventory = sevenSlotBagWithIceAt6();
    const iceArrows: EmojiItem = {
      id: 'ice-arrows',
      emoji: '🧊',
      name: 'Ice Arrows',
      description: 'Ranger off-hand',
      consumed: false,
      isEquipment: true,
      equipSlots: ['offHand'],
      specialAmmoKind: 'freeze',
      equipBonus: {},
    };
    const bank = [iceArrows, ice('ice-bank')];

    const { inventory: next, bank: nextBank } = removeAndRefillBag(inventory, bank, 'ice-hot');
    expect(sortBagSlots(next)[5].id).toBe('ice-bank');
    expect(nextBank.map(i => i.id)).toEqual(['ice-arrows']);
  });

  it('compacts remaining items when there is no Bank extra', () => {
    const inventory = sevenSlotBagWithIceAt6();
    const { inventory: next, bank: nextBank } = removeAndRefillBag(inventory, [], 'ice-hot');
    const slots = sortBagSlots(next);

    expect(slots.map(i => i.emoji)).toEqual(['🔥', '🌟', '🌙', '👑', '🧲', '⛵']);
    expect(slots.map(i => i.id)).toEqual(['f1', 's1', 'm1', 'c1', 'g1', 'b1']);
    expect(nextBank).toHaveLength(0);
  });

  it('replaces a spent Gun with a banked extra Gun on the same key', () => {
    const inventory = [gun('gun-hot'), fire('f1'), ice('ice-hot')];
    const extra: EmojiItem = { ...gun('gun-bank'), charges: 3 };
    const { inventory: next } = removeAndRefillBag(inventory, [extra], 'gun-hot');
    const slots = sortBagSlots(next);
    expect(slots[0].emoji).toBe('🔫');
    expect(slots[0].id).toBe('gun-bank');
    expect(slots.map(i => i.id)).toEqual(['gun-bank', 'f1', 'ice-hot']);
  });
});

describe('stackable refill stays in place', () => {
  it('merges a banked Heart into the existing stack without moving other slots', () => {
    const inventory = [fire('f1'), heart('h1', 2), ice('ice-hot')];
    const bank = [heart('h-bank', 1)];
    const beforeIds = sortBagSlots(inventory).map(i => i.id);

    const { inventory: next } = refillBagFromBank(inventory, bank);
    const slots = sortBagSlots(next);

    expect(slots.map(i => i.id)).toEqual(beforeIds);
    expect(slots.find(i => i.emoji === '❤️')?.stackCount).toBe(3);
  });

  it('does not steal Ice\'s hotbar slot to merge a Heart already in the bag', () => {
    const inventory = [
      fire('f1'),
      star('s1'),
      moon('m1'),
      heart('h1', 1),
      magnet('g1'),
      ice('ice-hot'),
      boat('b1'),
    ];
    const bank = [heart('h-bank', 1)];

    const { inventory: next, bank: nextBank } = removeAndRefillBag(inventory, bank, 'ice-hot');
    const slots = sortBagSlots(next);

    expect(slots.some(i => i.emoji === '🧊')).toBe(false);
    expect(slots.filter(i => i.emoji === '❤️')).toHaveLength(1);
    expect(slots.find(i => i.emoji === '❤️')?.stackCount).toBe(2);
    expect(slots.map(i => i.id)).toEqual(['f1', 's1', 'm1', 'g1', 'b1', 'h1']);
    expect(nextBank).toHaveLength(0);
  });
});
