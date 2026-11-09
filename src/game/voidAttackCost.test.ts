import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canEquipItem, emptyLegalEquipSlot } from '../components/itemUtils';
import { gainCarriedAmmo } from './royalGuard';
import type { EmojiItem } from './types';
import { VOID } from './prestigeConstants';
import {
  voidHpAttackPaidLog,
  voidHpAttackTooltip,
  voidRangedHpCost,
  voidRangedSpend,
} from './voidAttackCost';

function gear(over: Partial<EmojiItem> & Pick<EmojiItem, 'id' | 'emoji' | 'name'>): EmojiItem {
  return { description: over.name, consumed: false, isEquipment: true, ...over };
}

const bow = gear({ id: 'bow', emoji: '🏹', name: 'Bow', weaponKind: 'bow', equipSlots: ['mainHand'] });
const gun = gear({ id: 'gun', emoji: '🔫', name: 'Gun', weaponKind: 'gun', equipSlots: ['mainHand', 'offHand'] });
const fireArrows = gear({ id: 'fire', emoji: '🔥', name: 'Fire Arrows', specialAmmoKind: 'fire', ammoCarrier: 'arrow', equipSlots: ['offHand'] });
const iceBullets = gear({ id: 'ice', emoji: '❄️', name: 'Ice Bullets', specialAmmoKind: 'freeze', ammoCarrier: 'bullet', equipSlots: ['offHand'] });

describe('void HP-priced attacks', () => {
  it('raises the cost by one for each depth boss beaten', () => {
    expect(voidRangedHpCost(0)).toBe(1);
    expect(voidRangedHpCost(1)).toBe(2);
    expect(voidRangedHpCost(2)).toBe(3);
  });

  it('spends ammo before HP and refuses a lethal or sub-25% payment', () => {
    expect(voidRangedSpend({ style: 'ranger', hp: 2, maxHp: 20, ammo: 3, bossesCleared: 0 })).toEqual({ kind: 'ammo' });
    expect(voidRangedSpend({ style: 'wizard', hp: 16, maxHp: 20, ammo: 4, bossesCleared: 0 })).toEqual({ kind: 'hp', cost: 1 });
    expect(voidRangedSpend({ style: 'ranger', hp: 16, maxHp: 20, ammo: 0, bossesCleared: 1 })).toEqual({ kind: 'hp', cost: 2 });
    expect(voidRangedSpend({ style: 'wizard', hp: 5, maxHp: 20, ammo: 0, bossesCleared: 0 }).kind).toBe('hp');
    const low = voidRangedSpend({ style: 'wizard', hp: 4, maxHp: 20, bossesCleared: 0 });
    expect(low.kind).toBe('melee');
    if (low.kind === 'melee') expect(low.log).toContain('25%');
    const lethal = voidRangedSpend({ style: 'ranger', hp: 12, maxHp: 20, ammo: 0, bossesCleared: 11 });
    expect(lethal.kind).toBe('melee');
    if (lethal.kind === 'melee') expect(lethal.log).toContain('lethal');
    expect(voidRangedSpend({ style: 'wizard', hp: 2, maxHp: 20, bossesCleared: 0 }).kind).toBe('melee');
    expect(voidHpAttackPaidLog('wizard', 2)).toBe('👤 Wizard autos — 2 HP.');
    expect(voidHpAttackTooltip(1)).toContain('2 HP');
  });

  it('lets the void pick up ammo and equip paired special arrows and bullets', () => {
    const arrows = gainCarriedAmmo({ characterClass: VOID, ammo: 1 }, { emoji: '🏹', ammoAmount: 5 });
    expect(arrows).toMatchObject({ total: 6, word: 'arrows' });
    const bullets = gainCarriedAmmo(arrows.player, { emoji: '🪙', ammoAmount: 5 });
    expect(bullets.total).toBe(11);
    expect(canEquipItem(fireArrows, VOID)).toBe(true);
    expect(canEquipItem(iceBullets, VOID)).toBe(true);
    expect(emptyLegalEquipSlot(fireArrows, VOID, { mainHand: bow })).toBe('offHand');
    expect(emptyLegalEquipSlot(fireArrows, VOID, { mainHand: gun })).toBeUndefined();
    expect(emptyLegalEquipSlot(iceBullets, VOID, { mainHand: gun })).toBe('offHand');
    expect(emptyLegalEquipSlot(iceBullets, VOID, { mainHand: bow })).toBeUndefined();
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('plus 1 HP for each depth boss beaten');
    expect(manual).toContain('Below 25% HP');
  });
});
