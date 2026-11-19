import type { EquipBonus } from './types';
import { GEAR_ATK_PERCENT, GEAR_DEF_PERCENT } from './softCap';

export type GearStatKey = 'attack' | 'defense' | 'speed' | 'evasion' | 'luck';
export type GearLabelStyle = 'compact' | 'badge';

const ORDER: GearStatKey[] = ['attack', 'defense', 'luck', 'evasion', 'speed'];

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** One gear point, in the words combat uses. */
export function formatGearPoint(key: GearStatKey, points: number, style: GearLabelStyle = 'badge'): string {
  const n = Math.trunc(points);
  if (key === 'attack') {
    const pct = n * GEAR_ATK_PERCENT;
    return style === 'compact' ? `${signed(pct)}%ATK` : `${signed(pct)}% ATK`;
  }
  if (key === 'defense') {
    const pct = n * GEAR_DEF_PERCENT;
    return style === 'compact' ? `${signed(pct)}%DR` : `${signed(pct)}% DR`;
  }
  if (key === 'luck') {
    return style === 'compact' ? `${signed(n)}%crit` : `${signed(n)}% crit dmg`;
  }
  if (key === 'evasion') {
    return style === 'compact' ? `${signed(n)}%dodge` : `${signed(n)}% dodge`;
  }
  return style === 'compact' ? `${signed(n)}SPD` : `${signed(n)} SPD`;
}

export function gearLabelParts(bonus: EquipBonus | undefined, style: GearLabelStyle = 'badge'): string[] {
  if (!bonus) return [];
  const parts: string[] = [];
  for (const key of ORDER) {
    const points = bonus[key];
    if (!points) continue;
    parts.push(formatGearPoint(key, points, style));
  }
  return parts;
}

/** Equip list and other tight rows. "+6%ATK +3%DR". */
export function formatGearCompact(bonus: EquipBonus | undefined): string {
  return gearLabelParts(bonus, 'compact').join(' ');
}

/** Popinfo badges and sentences. "+6% ATK, +3% DR". */
export function formatGearBadgeList(bonus: EquipBonus | undefined): string[] {
  return gearLabelParts(bonus, 'badge');
}

export function formatGearProse(bonus: EquipBonus | undefined): string {
  return formatGearBadgeList(bonus).join(', ');
}

/**
 * Swap leftover flat stat words in a catalog sentence for the shared labels.
 * Flavor around the numbers stays. "+3 ATK, +1 SPD" becomes "+6% ATK, +1 SPD".
 */
export function displayItemDescription(item: { description: string; isEquipment?: boolean; equipBonus?: EquipBonus }): string {
  if (!item.isEquipment) return item.description;
  return rewriteGearDescription(item.description, item.equipBonus);
}

export function rewriteGearDescription(description: string, bonus: EquipBonus | undefined): string {
  if (!bonus) return description;
  let text = description;
  const swap = (key: GearStatKey, pattern: RegExp) => {
    const points = bonus[key];
    if (!points) return;
    text = text.replace(pattern, formatGearPoint(key, points, 'badge'));
  };
  swap('attack', /[+＋](\d+)\s*ATK/g);
  swap('defense', /[+＋](\d+)\s*DEF/g);
  swap('luck', /[+＋](\d+)\s*LCK/g);
  swap('evasion', /[+＋](\d+)\s*EVA/g);
  swap('speed', /[+＋−-](\d+)\s*SPD/g);
  return text;
}
