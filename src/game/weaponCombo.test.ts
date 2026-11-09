import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canEquipItem, classWeaponRulesBlurb, emptyLegalEquipSlot, legalEquipSlots } from '../components/itemUtils';
import { DROP_TABLE } from './dropTable';
import { getItemSellValue } from './economy';
import { EQUIPMENT_DROPS_T1, EQUIPMENT_DROPS_T2, EQUIPMENT_DROPS_T3, equipmentVariantForEmoji } from './emojis';
import { COWBOY, HITMAN, RANGER, ROYAL_GUARD, VOID } from './prestigeConstants';
import type { EmojiItem, Equipment } from './types';
import { BULLET_AMMO_SELL_VALUE, GEAR_SELL_VALUE, legalSpecialAmmo, settleHandEquip } from './weaponCombo';

function piece(over: Partial<EmojiItem> & Pick<EmojiItem, 'id' | 'emoji' | 'name'>): EmojiItem {
  return { description: over.name, consumed: false, isEquipment: true, ...over };
}

const bow = piece({ id: 'bow', emoji: '🏹', name: 'Longbow', weaponKind: 'bow', equipSlots: ['mainHand'] });
const gun = piece({ id: 'gun', emoji: '🔫', name: 'Revolver', weaponKind: 'gun', equipSlots: ['mainHand', 'offHand'] });
const arrows = piece({ id: 'arrows', emoji: '🔥', name: 'Fire Arrows', specialAmmoKind: 'fire', ammoCarrier: 'arrow', equipSlots: ['offHand'] });
const iceArrows = piece({ id: 'ice-arrows', emoji: '🧊', name: 'Ice Arrows', specialAmmoKind: 'freeze', ammoCarrier: 'arrow', equipSlots: ['offHand'] });
const rounds = piece({ id: 'rounds', emoji: '🧨', name: 'Incendiary Rounds', specialAmmoKind: 'fire', ammoCarrier: 'bullet', equipSlots: ['offHand'] });
const iceBullets = piece({ id: 'ice-bullets', emoji: '❄️', name: 'Ice Bullets', specialAmmoKind: 'freeze', ammoCarrier: 'bullet', equipSlots: ['offHand'] });

describe('weapon and ammo combos', () => {
  it('keeps arrows with bows and bullets with guns, and takes the clash off', () => {
    const arrowOnGun = settleHandEquip({ mainHand: gun }, arrows, 'offHand');
    expect(arrowOnGun.stow.map(item => item.id)).toEqual(['gun']);
    expect(arrowOnGun.equipment.mainHand).toBeUndefined();
    expect(arrowOnGun.log).toContain('needs a bow');
    expect(arrowOnGun.log).toContain("don't work together");

    const bulletOnBow = settleHandEquip({ mainHand: bow }, rounds, 'offHand');
    expect(bulletOnBow.stow.map(item => item.id)).toEqual(['bow']);
    expect(bulletOnBow.log).toContain('needs a gun');

    const arrowOnBow = settleHandEquip({ mainHand: bow }, iceArrows, 'offHand');
    expect(arrowOnBow.stow).toHaveLength(0);
    expect(arrowOnBow.equipment.mainHand?.id).toBe('bow');

    const bulletOnGun = settleHandEquip({ mainHand: gun }, iceBullets, 'offHand');
    expect(bulletOnGun.stow).toHaveLength(0);

    const gunOverArrows = settleHandEquip({ offHand: arrows }, gun, 'mainHand');
    expect(gunOverArrows.stow.map(item => item.id)).toEqual(['arrows']);
    expect(gunOverArrows.log).toContain('needs a bow');

    expect(legalSpecialAmmo({ equipment: { mainHand: bow, offHand: arrows } })).toEqual({ kind: 'fire', carrier: 'arrow' });
    expect(legalSpecialAmmo({ equipment: { mainHand: gun, offHand: rounds } })).toEqual({ kind: 'fire', carrier: 'bullet' });
    expect(legalSpecialAmmo({ equipment: { mainHand: gun, offHand: arrows } })).toBeNull();
    expect(legalSpecialAmmo({ equipment: { offHand: arrows } })).toBeNull();

    const hands: Equipment = { mainHand: gun };
    expect(emptyLegalEquipSlot(arrows, ROYAL_GUARD, hands)).toBeUndefined();
    expect(emptyLegalEquipSlot(rounds, ROYAL_GUARD, hands)).toBe('offHand');
  });

  it('respects class locks and prices bullets above arrows', () => {
    expect(legalEquipSlots(arrows, RANGER)).toEqual(['offHand']);
    expect(canEquipItem(rounds, RANGER)).toBe(false);
    expect(canEquipItem(iceBullets, RANGER)).toBe(false);
    expect(canEquipItem(arrows, COWBOY)).toBe(false);
    expect(canEquipItem(iceArrows, HITMAN)).toBe(false);
    expect(legalEquipSlots(rounds, COWBOY)).toEqual(['offHand']);
    expect(legalEquipSlots(iceBullets, HITMAN)).toEqual(['offHand']);
    expect(legalEquipSlots(rounds, ROYAL_GUARD)).toEqual(['offHand']);
    expect(legalEquipSlots(arrows, ROYAL_GUARD)).toEqual(['offHand']);
    expect(canEquipItem(rounds, VOID)).toBe(false);
    expect(canEquipItem(arrows, VOID)).toBe(false);

    expect(getItemSellValue(arrows)).toBe(GEAR_SELL_VALUE);
    expect(getItemSellValue(iceArrows)).toBe(15);
    expect(getItemSellValue(rounds)).toBe(BULLET_AMMO_SELL_VALUE);
    expect(getItemSellValue(iceBullets)).toBe(20);
    expect(BULLET_AMMO_SELL_VALUE).toBeGreaterThan(GEAR_SELL_VALUE);
  });

  it('drops the bullet ammo at the same uncommon tier as the arrows', () => {
    expect(DROP_TABLE.find(row => row.itemId === 'gear:fire-arrows')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(row => row.itemId === 'gear:ice-arrows')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(row => row.itemId === 'gear:incendiary')?.rarity).toBe('uncommon');
    expect(DROP_TABLE.find(row => row.itemId === 'gear:ice-bullets')?.rarity).toBe('uncommon');
    for (const pool of [EQUIPMENT_DROPS_T1, EQUIPMENT_DROPS_T2, EQUIPMENT_DROPS_T3]) {
      expect(pool.some(item => item.name === 'Incendiary Rounds' && item.ammoCarrier === 'bullet')).toBe(true);
      expect(pool.some(item => item.name === 'Ice Bullets' && item.specialAmmoKind === 'freeze')).toBe(true);
    }
    expect(equipmentVariantForEmoji('🧨', 1, () => 0).name).toBe('Incendiary Rounds');
    expect(equipmentVariantForEmoji('❄️', 1, () => 0).name).toBe('Ice Bullets');
    const blurb = classWeaponRulesBlurb();
    expect(blurb).toContain('need a bow');
    expect(blurb).toContain('need a gun');
    expect(blurb).toContain('sell for 20 gold');
    expect(blurb).toContain('both hands may be ranged');
    const manual = readFileSync(new URL('../pages/how-to-play.tsx', import.meta.url), 'utf8');
    expect(manual).toContain('Incendiary Rounds');
    expect(manual).toContain('classWeaponRulesBlurb');
  });
});
