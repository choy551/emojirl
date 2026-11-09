import type { EmojiItem, Equipment, Player } from './types';
import { applySoulCatalogCopy, getEmojiPowerByEmoji } from './emojis';
import { addToBag } from './inventory';
import { ROYAL_GUARD } from './prestigeConstants';

/** Each hotbar Crown is a 5% stun. Five crowns is 25%. */
export const CROWN_STACK_CAP = 5;
export const CROWN_STUN_PER_STACK = 0.05;

export function crownStunChance(stacks: number): number {
  const z = Math.min(CROWN_STACK_CAP, Math.max(0, Math.floor(stacks)));
  return z * CROWN_STUN_PER_STACK;
}

/** Royal Guard only. `roll` is in [0, 1). */
export function crownStuns(stacks: number, roll: number, characterClass: string): boolean {
  if (characterClass !== ROYAL_GUARD) return false;
  const chance = crownStunChance(stacks);
  return chance > 0 && roll < chance;
}

/** Off-hand share of ATK when both hands are blades. 50% + 1% per level, 100% at level 50. */
export function royalOffhandFraction(level: number): number {
  const lv = Math.max(0, Math.floor(level));
  return Math.min(1, 0.5 + lv * 0.01);
}

export function royalDualBlades(player: Pick<Player, 'characterClass' | 'equipment'>): boolean {
  return player.characterClass === ROYAL_GUARD
    && player.equipment.mainHand?.weaponKind === 'blade'
    && player.equipment.offHand?.weaponKind === 'blade';
}

export function guardHasBow(player: Pick<Player, 'equipment'>): boolean {
  return [player.equipment.mainHand, player.equipment.offHand].some(item => item?.weaponKind === 'bow');
}

export function guardHasGun(player: Pick<Player, 'equipment'>): boolean {
  return [player.equipment.mainHand, player.equipment.offHand].some(item => item?.weaponKind === 'gun');
}

export function guardHasRangedWeapon(player: Pick<Player, 'equipment'>): boolean {
  return guardHasBow(player) || guardHasGun(player);
}

/** Odd remainder stays with the arrows. 7 → 4 arrows and 3 bullets. */
export function splitPooledGuardAmmo(total: number): { arrowAmmo: number; bulletAmmo: number } {
  const n = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const bulletAmmo = Math.floor(n / 2);
  return { arrowAmmo: n - bulletAmmo, bulletAmmo };
}

export type GuardShot = 'bow' | 'gun';

export function guardArrowCount(player: Pick<Player, 'arrowAmmo'>): number {
  return Math.max(0, player.arrowAmmo ?? 0);
}

export function guardBulletCount(player: Pick<Player, 'bulletAmmo'>): number {
  return Math.max(0, player.bulletAmmo ?? 0);
}

/**
 * Bow and gun together take turns. A dry weapon yields to the one that still has ammo.
 * A lone bow uses arrows. A lone gun uses bullets.
 */
export function chooseGuardShot(player: Pick<Player, 'equipment' | 'arrowAmmo' | 'bulletAmmo' | 'guardNextShot'>): { shot: GuardShot; ammo: number } | null {
  const bow = guardHasBow(player) && guardArrowCount(player) > 0;
  const gun = guardHasGun(player) && guardBulletCount(player) > 0;
  const both = guardHasBow(player) && guardHasGun(player);
  if (both) {
    const prefer: GuardShot = player.guardNextShot === 'gun' ? 'gun' : 'bow';
    if (prefer === 'bow' && bow) return { shot: 'bow', ammo: guardArrowCount(player) };
    if (prefer === 'gun' && gun) return { shot: 'gun', ammo: guardBulletCount(player) };
    if (bow) return { shot: 'bow', ammo: guardArrowCount(player) };
    if (gun) return { shot: 'gun', ammo: guardBulletCount(player) };
    return null;
  }
  if (bow) return { shot: 'bow', ammo: guardArrowCount(player) };
  if (gun) return { shot: 'gun', ammo: guardBulletCount(player) };
  return null;
}

export function afterGuardShot<T extends Pick<Player, 'arrowAmmo' | 'bulletAmmo' | 'guardNextShot' | 'equipment'>>(
  player: T,
  shot: GuardShot,
  ammoDelta: number,
): T {
  const next: T = { ...player };
  if (shot === 'bow') next.arrowAmmo = Math.max(0, guardArrowCount(player) + ammoDelta);
  else next.bulletAmmo = Math.max(0, guardBulletCount(player) + ammoDelta);
  if (guardHasBow(player) && guardHasGun(player)) next.guardNextShot = shot === 'bow' ? 'gun' : 'bow';
  return next;
}

/** Quivers fill arrows. Bullet stacks fill bullets. Other classes keep the shared pool. */
export function gainCarriedAmmo<T extends Pick<Player, 'characterClass' | 'ammo' | 'arrowAmmo' | 'bulletAmmo'>>(
  player: T,
  item: { emoji: string; ammoAmount?: number },
): { player: T; total: number; word: 'arrows' | 'bullets' } {
  const amount = Math.max(0, item.ammoAmount ?? 0);
  const bullets = item.emoji === '🪙';
  if (player.characterClass === ROYAL_GUARD) {
    if (bullets) {
      const bulletAmmo = guardBulletCount(player) + amount;
      return { player: { ...player, bulletAmmo }, total: bulletAmmo, word: 'bullets' };
    }
    const arrowAmmo = guardArrowCount(player) + amount;
    return { player: { ...player, arrowAmmo }, total: arrowAmmo, word: 'arrows' };
  }
  const ammo = (player.ammo ?? 0) + amount;
  return { player: { ...player, ammo }, total: ammo, word: bullets ? 'bullets' : 'arrows' };
}

/** Rangers stay on ranged. The Royal Guard starts in melee. */
export function initialRangerMode(characterClass: string): 'ranged' | 'melee' {
  return characterClass === ROYAL_GUARD ? 'melee' : 'ranged';
}

export function hotbarCrown(id = 'start-crown'): EmojiItem {
  return { ...getEmojiPowerByEmoji('👑'), id, consumed: false };
}

function asItems(value: unknown): EmojiItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => applySoulCatalogCopy(item as EmojiItem));
}

/**
 * Equipped 👑 becomes a hotbar Crown. A full bar banks it.
 * Existing hotbar Crowns stack with it, up to 5.
 */
export function migrateEquippedCrown(raw: Record<string, unknown>): void {
  const player = raw.player;
  if (!player || typeof player !== 'object') return;
  const record = player as Record<string, unknown>;
  let inventory = asItems(record.inventory);
  let bank = asItems(record.bank);
  const equipment: Equipment = { ...((record.equipment as Equipment) ?? {}) };
  const accessory = equipment.accessory;
  if (accessory?.emoji === '👑') {
    delete equipment.accessory;
    const placed = addToBag(inventory, bank, hotbarCrown(accessory.id || 'royal-crown'));
    inventory = placed.inventory;
    bank = placed.bank;
  }
  record.inventory = inventory;
  record.bank = bank;
  record.equipment = equipment;
  if (Array.isArray(raw.items)) raw.items = asItems(raw.items);
  if (Array.isArray(raw.shopStock)) raw.shopStock = asItems(raw.shopStock);
}
