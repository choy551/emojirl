import { EmojiItem, EquipSlot, Equipment, Player } from '../game/types';
import { COWBOY, FENCER, GENIE, HITMAN, NINJA, RANGER, ROYAL_GUARD, VOID, WIZARD, CLASS_SELECT_ORDER } from '../game/prestigeConstants';
import { getClassDef } from '../game/classes';
import { hotbarCapFor } from '../game/voidDamage';

export const EQUIP_STAT_LABELS: Record<string, string> = {
  attack: 'ATK', defense: 'DEF', speed: 'SPD', evasion: 'EVA', luck: 'LCK', hp: 'HP', vitality: 'VIT',
};

const EQUIP_SLOT_ORDER: EquipSlot[] = ['body', 'mainHand', 'offHand', 'accessory'];

const SLOT_NAME: Record<EquipSlot, string> = {
  body: 'body',
  mainHand: 'main hand',
  offHand: 'off hand',
  accessory: 'accessory',
};

const KIND_LABEL: Record<string, string> = {
  staff: 'staves/wands',
  blade: 'blades',
  bow: 'bows',
  gun: 'guns',
};

/**
 * What each class may hold. Body armor and accessories fit everyone.
 * Shields fit the off hand except Ranger, Cowboy, and Levitating Hitman.
 */
export const CLASS_WEAPON_SUMMARY: Record<string, string> = {
  [WIZARD]: 'staves and wands in either hand',
  [GENIE]: 'staves and wands in either hand',
  [NINJA]: 'blades in either hand',
  [FENCER]: 'blades in either hand',
  [RANGER]: 'bows in the main hand, arrows or swords in the off hand',
  [COWBOY]: 'guns in either hand, never muskets',
  [HITMAN]: 'guns in either hand, including muskets in the main hand',
  [ROYAL_GUARD]: 'bows, guns, and blades in either hand; muskets in the main hand; arrows in the off hand; both hands may be ranged',
  [VOID]: 'any weapon in its usual slot, except muskets and special arrows',
};

export function classWeaponRulesBlurb(): string {
  const classes = CLASS_SELECT_ORDER.map(emoji => `${emoji} ${getClassDef(emoji).name}: ${CLASS_WEAPON_SUMMARY[emoji]}.`).join(' ');
  return `Hands are class-locked. Body armor and accessories fit every class. Shields fit the off hand, except for the Ranger, the Cowboy, and the Levitating Hitman. ${classes}`;
}

export function getEquipBonusSuffix(item: EmojiItem): string {
  if (!item.isEquipment) return '';
  const parts = Object.entries(item.equipBonus ?? {})
    .filter(([, v]) => (v ?? 0) !== 0)
    .map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${EQUIP_STAT_LABELS[k] ?? k.toUpperCase()}`);
  return parts.length > 0 ? ` · ${parts.join(', ')}` : '';
}

export function activeKindEmoji(activeKind: string | undefined): string | null {
  if (!activeKind) return null;
  const map: Record<string, string> = {
    bomb: '💣', gun: '🔫', boomerang: '🪃', rope: '🪢', freeze: '❄️',
  };
  return map[activeKind] ?? null;
}

function isHand(slot: EquipSlot): boolean {
  return slot === 'mainHand' || slot === 'offHand';
}

/** Royal Guard Versatility: a bow may sit in either hand, even when the drop only lists main hand. */
function royalBowOffHand(item: EmojiItem, playerClass: string, slot: EquipSlot): boolean {
  return playerClass === ROYAL_GUARD && slot === 'offHand' && item.weaponKind === 'bow' && item.gunTier !== 'musket';
}

function slotListed(item: EmojiItem, playerClass: string, slot: EquipSlot): boolean {
  return (item.equipSlots ?? []).includes(slot) || royalBowOffHand(item, playerClass, slot);
}

function handAllows(item: EmojiItem, playerClass: string, slot: EquipSlot): boolean {
  if (!isHand(slot)) return true;

  if (item.armorKind === 'shield') {
    if (slot !== 'offHand') return false;
    if (playerClass === RANGER || playerClass === COWBOY || playerClass === HITMAN) return false;
    return true;
  }
  if (item.armorKind) return false;

  if (item.specialAmmoKind) {
    return slot === 'offHand' && (playerClass === RANGER || playerClass === ROYAL_GUARD);
  }

  if (item.gunTier === 'musket') {
    return slot === 'mainHand' && (playerClass === ROYAL_GUARD || playerClass === HITMAN);
  }

  const kind = item.weaponKind;
  if (!kind) return true;

  if (playerClass === WIZARD || playerClass === GENIE) return kind === 'staff';
  if (playerClass === NINJA || playerClass === FENCER) return kind === 'blade';
  if (playerClass === RANGER) {
    if (slot === 'mainHand') return kind === 'bow';
    return kind === 'blade';
  }
  if (playerClass === ROYAL_GUARD) return kind === 'bow' || kind === 'gun' || kind === 'blade';
  if (playerClass === COWBOY || playerClass === HITMAN) return kind === 'gun';
  return true;
}

export function canEquipInSlot(item: EmojiItem, playerClass: string, slot: EquipSlot): boolean {
  if (!item.isEquipment && item.isEquipment !== undefined) return false;
  if (!slotListed(item, playerClass, slot)) return false;
  return handAllows(item, playerClass, slot);
}

export function legalEquipSlots(item: EmojiItem, playerClass: string): EquipSlot[] {
  return EQUIP_SLOT_ORDER.filter(slot => canEquipInSlot(item, playerClass, slot));
}

export function canEquipItem(item: EmojiItem, playerClass: string): boolean {
  return legalEquipSlots(item, playerClass).length > 0;
}

/** First empty slot this class may use. Undefined when every legal slot is full or none exist. */
export function emptyLegalEquipSlot(
  item: EmojiItem,
  playerClass: string,
  equipment: Equipment | undefined,
): EquipSlot | undefined {
  return legalEquipSlots(item, playerClass).find(slot => !equipment?.[slot]);
}

/** Empty legal slot, or the first legal slot when the player is replacing what they already wear. */
export function preferredEquipSlot(
  item: EmojiItem,
  playerClass: string,
  equipment: Equipment | undefined,
): EquipSlot | undefined {
  const legal = legalEquipSlots(item, playerClass);
  return legal.find(slot => !equipment?.[slot]) ?? legal[0];
}

export function equipRestrictionReason(item: EmojiItem, playerClass: string, slot?: EquipSlot): string {
  const cls = getClassDef(playerClass).name;
  const summary = CLASS_WEAPON_SUMMARY[playerClass] ?? 'compatible weapons';

  if (item.armorKind === 'shield' && slot && slot !== 'offHand') return 'Shield goes in the off-hand slot.';
  if (item.armorKind && item.armorKind !== 'shield' && slot && isHand(slot)) return 'Armor goes in the Body slot.';

  if (slot && !slotListed(item, playerClass, slot)) {
    return `${item.emoji} can't go in the ${SLOT_NAME[slot]} slot.`;
  }

  if (item.gunTier === 'musket' && playerClass !== ROYAL_GUARD && playerClass !== HITMAN) {
    return `${cls} cannot equip muskets. Only the Royal Guard and the Levitating Hitman carry them.`;
  }
  if (item.specialAmmoKind && playerClass !== RANGER && playerClass !== ROYAL_GUARD) {
    return `${cls} cannot use special arrows — Ranger and Royal Guard only.`;
  }
  if (playerClass === COWBOY && ((item.weaponKind && item.weaponKind !== 'gun') || item.armorKind === 'shield')) {
    return 'Only real Cowboys fight with their fists!';
  }
  if (playerClass === RANGER && slot === 'mainHand' && item.weaponKind === 'blade') {
    return 'Ranger main hand takes a bow. Swords and arrows go in the off hand.';
  }
  if (playerClass === RANGER && slot === 'offHand' && item.weaponKind && item.weaponKind !== 'blade') {
    return 'Ranger off hand takes arrows or swords.';
  }

  const kind = item.specialAmmoKind
    ? 'special arrows'
    : item.armorKind === 'shield'
      ? 'shields'
      : (KIND_LABEL[item.weaponKind ?? ''] ?? item.weaponKind ?? 'that');
  return `${cls} cannot equip ${kind}. ${cls} weapons: ${summary}.`;
}

function isBagSoul(item: EmojiItem): boolean {
  return !item.consumed
    && !item.isEquipment
    && !item.isVoidGhost
    && item.healAmount === undefined
    && item.ammoAmount === undefined
    && item.drinkTier === undefined;
}

export interface GearStow {
  inventory: EmojiItem[];
  bank: EmojiItem[];
  /** Souls plus gear already parked in the bag during this pass. */
  bagUsed: number;
  where: 'bag' | 'bank';
}

/** Unequipped gear prefers a free Bag slot. A full Bag sends it to the Bank. */
export function stowUnequippedGear(
  inventory: EmojiItem[],
  bank: EmojiItem[],
  item: EmojiItem,
  bagUsed: number,
  bagCap: number,
): GearStow {
  if (bagUsed < bagCap) {
    return { inventory: [...inventory, item], bank, bagUsed: bagUsed + 1, where: 'bag' };
  }
  return { inventory, bank: [...bank, item], bagUsed, where: 'bank' };
}

/**
 * In-place save migration. Gear the class cannot wear in that slot leaves the
 * body and lands in the Bag, or the Bank when the Bag is full.
 */
export function applyEquipmentRestrictionMigration(raw: Record<string, unknown>): void {
  const player = raw.player;
  if (!player || typeof player !== 'object') return;
  const record = player as Record<string, unknown>;
  const cls = typeof record.characterClass === 'string' ? record.characterClass : WIZARD;
  const equipment: Equipment = record.equipment && typeof record.equipment === 'object'
    ? { ...(record.equipment as Equipment) }
    : {};
  let inventory = Array.isArray(record.inventory) ? [...(record.inventory as EmojiItem[])] : [];
  let bank = Array.isArray(record.bank) ? [...(record.bank as EmojiItem[])] : [];
  const cap = hotbarCapFor({
    characterClass: cls,
    ghostHotbar: Array.isArray(record.ghostHotbar) ? record.ghostHotbar as Player['ghostHotbar'] : undefined,
  });
  let bagUsed = inventory.filter(isBagSoul).length;
  const notes: string[] = [];
  const name = getClassDef(cls).name;

  for (const slot of EQUIP_SLOT_ORDER) {
    const item = equipment[slot];
    if (!item || canEquipInSlot(item, cls, slot)) continue;
    delete equipment[slot];
    const stowed = stowUnequippedGear(inventory, bank, item, bagUsed, cap);
    inventory = stowed.inventory;
    bank = stowed.bank;
    bagUsed = stowed.bagUsed;
    notes.push(stowed.where === 'bag'
      ? `${item.emoji} ${item.name} doesn't fit a ${name} — moved to the Bag.`
      : `${item.emoji} ${item.name} doesn't fit a ${name} — Bag full, moved to the Bank.`);
  }

  record.equipment = equipment;
  record.inventory = inventory;
  record.bank = bank;
  if (notes.length === 0) return;
  const turn = typeof raw.turn === 'number' ? raw.turn : 0;
  const prev = Array.isArray(raw.logs) ? raw.logs : [];
  raw.logs = [
    ...notes.map((text, i) => ({ id: `equip-migrate-${turn}-${i}`, text, turn })),
    ...prev,
  ].slice(0, 24);
}
