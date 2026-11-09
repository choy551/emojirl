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

export function guardHasRangedWeapon(player: Pick<Player, 'equipment'>): boolean {
  return [player.equipment.mainHand, player.equipment.offHand].some(
    item => item?.weaponKind === 'bow' || item?.weaponKind === 'gun',
  );
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
