import { normalizeEmojiKey } from './discoveries';
import type { EmojiItem } from './types';

/**
 * Structures are not kill-table loot. A floor sometimes hides one.
 * Surveying it from the hotbar writes the existing consume ledger, which is the city token.
 * The city can also raise a blueprint by spending spare non-building tokens into that same ledger.
 */
export const STRUCTURE_FLOOR_CHANCE = 0.18;
export const BUILDING_EXCHANGE_COST = 3;
export const STRUCTURE_SURVEY_MOOD = 8;
/** Shop price for a blueprint. Selling does not grant a city token. */
export const STRUCTURE_SELL_VALUE = 1;

export type BuildingDistrict = 'thieves' | 'arcane' | 'saloon' | 'grove' | 'void';
export type BuildingRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface BuildingDef {
  emoji: string;
  name: string;
  district: BuildingDistrict | null;
  rarity: BuildingRarity;
  /** Lots this building contributes toward the 1-citizen-per-5-lots rule. */
  housing: number;
}

const DISTRICT_NAME: Record<BuildingDistrict, string> = {
  thieves: 'Slums of Thieves',
  arcane: 'Arcane Sanctum',
  saloon: 'Frontier Saloon',
  grove: 'Grove of Wilds',
  void: 'Void Hollow',
};

/** Per-building roll weight. Common finds are the usual survey. */
export const BUILDING_RARITY_WEIGHT: Record<BuildingRarity, number> = {
  common: 8,
  uncommon: 3,
  rare: 1,
  legendary: 1,
};

export const BUILDINGS: readonly BuildingDef[] = [
  { emoji: '🏠', name: 'House', district: null, rarity: 'common', housing: 1 },
  { emoji: '🏡', name: 'Cottage', district: null, rarity: 'common', housing: 1 },
  { emoji: '🛖', name: 'Hut', district: 'thieves', rarity: 'common', housing: 2 },
  { emoji: '🏚️', name: 'Ruin', district: 'thieves', rarity: 'common', housing: 2 },
  { emoji: '⛺', name: 'Tent', district: 'grove', rarity: 'common', housing: 2 },
  { emoji: '🌉', name: 'Bridge', district: 'thieves', rarity: 'common', housing: 2 },
  { emoji: '🏕️', name: 'Camp', district: 'grove', rarity: 'common', housing: 2 },
  { emoji: '🏗️', name: 'Site', district: 'thieves', rarity: 'common', housing: 2 },

  { emoji: '🏘️', name: 'Neighborhood', district: null, rarity: 'uncommon', housing: 3 },
  { emoji: '🏣', name: 'Post', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '🏥', name: 'Hospital', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '🏦', name: 'Bank', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '🏨', name: 'Hotel', district: 'saloon', rarity: 'uncommon', housing: 3 },
  { emoji: '🏪', name: 'Shop', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '🏫', name: 'School', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '🏬', name: 'Department Store', district: 'saloon', rarity: 'uncommon', housing: 3 },
  { emoji: '⛪', name: 'Church', district: 'arcane', rarity: 'uncommon', housing: 2 },
  { emoji: '🕌', name: 'Mosque', district: 'arcane', rarity: 'uncommon', housing: 2 },
  { emoji: '🛕', name: 'Temple', district: 'arcane', rarity: 'uncommon', housing: 2 },
  { emoji: '🕍', name: 'Synagogue', district: 'arcane', rarity: 'uncommon', housing: 2 },
  { emoji: '⛲', name: 'Fountain', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '⛩️', name: 'Shrine', district: 'arcane', rarity: 'uncommon', housing: 2 },
  { emoji: '🗻', name: 'Peak', district: 'grove', rarity: 'uncommon', housing: 2 },
  { emoji: '🏔️', name: 'Mountain', district: 'grove', rarity: 'uncommon', housing: 2 },
  { emoji: '🗾', name: 'Countryside', district: 'grove', rarity: 'uncommon', housing: 2 },
  { emoji: '🎪', name: 'Circus', district: 'saloon', rarity: 'uncommon', housing: 2 },
  { emoji: '🏭', name: 'Factory', district: null, rarity: 'uncommon', housing: 3 },
  { emoji: '🗺️', name: 'Chart', district: null, rarity: 'uncommon', housing: 2 },

  { emoji: '🏢', name: 'Office', district: null, rarity: 'rare', housing: 3 },
  { emoji: '🏤', name: 'Post Office', district: 'saloon', rarity: 'rare', housing: 2 },
  { emoji: '🏯', name: 'Castle Keep', district: 'arcane', rarity: 'rare', housing: 2 },
  { emoji: '💒', name: 'Chapel', district: 'arcane', rarity: 'rare', housing: 2 },
  { emoji: '🗼', name: 'Tower', district: 'arcane', rarity: 'rare', housing: 2 },
  { emoji: '🗽', name: 'Monument', district: 'saloon', rarity: 'rare', housing: 2 },
  { emoji: '🏟️', name: 'Stadium', district: 'saloon', rarity: 'rare', housing: 3 },
  { emoji: '🏛️', name: 'Hall', district: 'saloon', rarity: 'rare', housing: 2 },
  { emoji: '🎡', name: 'Wheel', district: 'saloon', rarity: 'rare', housing: 2 },
  { emoji: '🎢', name: 'Coaster', district: 'saloon', rarity: 'rare', housing: 2 },

  { emoji: '🏰', name: 'Castle', district: null, rarity: 'legendary', housing: 4 },
  { emoji: '🌋', name: 'Volcano', district: 'void', rarity: 'legendary', housing: 2 },
];

const BY_EMOJI = new Map<string, BuildingDef>();
for (const building of BUILDINGS) BY_EMOJI.set(normalizeEmojiKey(building.emoji), building);

export function buildingOf(emoji: string): BuildingDef | undefined {
  return BY_EMOJI.get(normalizeEmojiKey(emoji));
}

export function isBuildingEmoji(emoji: string): boolean {
  return BY_EMOJI.has(normalizeEmojiKey(emoji));
}

export function buildingDistrictName(building: BuildingDef): string {
  return building.district ? DISTRICT_NAME[building.district] : 'Neutral';
}

export function structureRarity(itemId: string): BuildingRarity | undefined {
  if (!itemId.startsWith('structure:')) return undefined;
  return buildingOf(itemId.slice('structure:'.length))?.rarity;
}

export function structureItem(building: BuildingDef): Omit<EmojiItem, 'id' | 'consumed'> {
  const lots = building.housing === 1 ? '1 lot' : `${building.housing} lots`;
  return {
    emoji: building.emoji,
    name: building.name,
    itemId: `structure:${building.emoji}`,
    isStructure: true,
    description: `Survey to grant 1 EmojiCB token. ${buildingDistrictName(building)}. Counts as ${lots} toward citizens.`,
  };
}

export function structureSurvey(moodValue: number, moodCap: number, building: BuildingDef): { moodValue: number; log: string } {
  const mood = Math.min(moodCap, moodValue + STRUCTURE_SURVEY_MOOD);
  const gained = mood - moodValue;
  return {
    moodValue: mood,
    log: `${building.emoji} ${building.name} surveyed. +${gained} mood. EmojiCB gains a token.`,
  };
}

export function rollStructureBuilding(rng: () => number): BuildingDef {
  const weights = BUILDINGS.map(building => BUILDING_RARITY_WEIGHT[building.rarity]);
  let total = 0;
  for (const weight of weights) total += weight;
  let roll = rng() * total;
  for (let i = 0; i < BUILDINGS.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return BUILDINGS[i]!;
  }
  return BUILDINGS[BUILDINGS.length - 1]!;
}
