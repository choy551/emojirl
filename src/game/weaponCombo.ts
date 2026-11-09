import type { AmmoCarrier, EmojiItem, EquipSlot, Equipment, Player, SpecialAmmoKind } from './types';

export const GEAR_SELL_VALUE = 15;
/** Slightly above ordinary gear, including Fire Arrows and Ice Arrows. */
export const BULLET_AMMO_SELL_VALUE = 20;

export function ammoCarrierOf(item: { specialAmmoKind?: SpecialAmmoKind; ammoCarrier?: AmmoCarrier } | undefined): AmmoCarrier | undefined {
  if (!item?.specialAmmoKind) return undefined;
  return item.ammoCarrier ?? 'arrow';
}

/** A held weapon fights this ammo. No weapon and no ammo is not a clash. */
export function ammoConflicts(
  weapon: { weaponKind?: string } | undefined,
  ammo: { specialAmmoKind?: SpecialAmmoKind; ammoCarrier?: AmmoCarrier } | undefined,
): boolean {
  if (!ammo?.specialAmmoKind || !weapon) return false;
  if (ammoCarrierOf(ammo) === 'arrow') return weapon.weaponKind !== 'bow';
  return weapon.weaponKind !== 'gun';
}

export function ammoNeed(ammo: { specialAmmoKind?: SpecialAmmoKind; ammoCarrier?: AmmoCarrier }): string {
  return ammoCarrierOf(ammo) === 'bullet' ? 'a gun' : 'a bow';
}

/**
 * Equipping the off hand that does not match the main hand takes the main hand off.
 * Equipping a main-hand weapon that does not match the ammo takes the ammo off.
 * The caller parks `stow` with the usual bag/bank rules.
 */
export function settleHandEquip(
  equipment: Equipment,
  item: EmojiItem,
  slot: EquipSlot,
): { equipment: Equipment; stow: EmojiItem[]; log?: string } {
  const next: Equipment = { ...equipment };
  if (slot === 'offHand' && ammoConflicts(next.mainHand, item)) {
    const main = next.mainHand!;
    delete next.mainHand;
    return {
      equipment: next,
      stow: [main],
      log: `${item.emoji} ${item.name} needs ${ammoNeed(item)}. ${main.emoji} ${main.name} comes off — they don't work together.`,
    };
  }
  if (slot === 'mainHand' && ammoConflicts(item, next.offHand)) {
    const off = next.offHand!;
    delete next.offHand;
    return {
      equipment: next,
      stow: [off],
      log: `${off.emoji} ${off.name} needs ${ammoNeed(off)}. ${item.emoji} ${item.name} takes the main hand, so the ammo comes off.`,
    };
  }
  return { equipment: next, stow: [] };
}

/** Off-hand ammo that is actually paired with the weapon it needs. */
export function legalSpecialAmmo(player: Pick<Player, 'equipment'>): { kind: SpecialAmmoKind; carrier: AmmoCarrier } | null {
  const ammo = player.equipment.offHand;
  const main = player.equipment.mainHand;
  if (!ammo?.specialAmmoKind || !main || ammoConflicts(main, ammo)) return null;
  return { kind: ammo.specialAmmoKind, carrier: ammoCarrierOf(ammo)! };
}
