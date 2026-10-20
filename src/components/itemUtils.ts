import { EmojiItem } from '../game/types';
import { COWBOY, FENCER, GENIE, HITMAN, NINJA, RANGER, ROYAL_GUARD, WIZARD } from '../game/prestigeConstants';
import { getClassDef } from '../game/classes';

export const EQUIP_STAT_LABELS: Record<string, string> = {
  attack: 'ATK', defense: 'DEF', speed: 'SPD', evasion: 'EVA', luck: 'LCK', hp: 'HP', vitality: 'VIT',
};

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

function handAllows(slot: string, kind: string, playerClass: string): boolean {
  if (slot !== 'mainHand' && slot !== 'offHand') return true;
  if (playerClass === WIZARD || playerClass === GENIE) return kind === 'staff';
  if (playerClass === NINJA || playerClass === FENCER) return kind === 'blade';
  if (playerClass === RANGER) {
    if (slot === 'mainHand') return kind === 'bow' || kind === 'gun';
    return true;
  }
  if (playerClass === ROYAL_GUARD) return kind === 'bow' || kind === 'gun' || kind === 'blade';
  if (playerClass === COWBOY || playerClass === HITMAN) return kind === 'gun';
  return true;
}

export function canEquipItem(item: EmojiItem, playerClass: string): boolean {
  if (item.gunTier === 'musket') return playerClass === ROYAL_GUARD || playerClass === HITMAN;
  if (item.specialAmmoKind) return playerClass === RANGER || playerClass === ROYAL_GUARD;
  if (!item.weaponKind) return true;
  return (item.equipSlots ?? []).some(slot => handAllows(slot, item.weaponKind!, playerClass));
}

export function equipRestrictionReason(item: EmojiItem, playerClass: string): string {
  const cls = getClassDef(playerClass).name;
  if (item.gunTier === 'musket') return `${cls} cannot equip muskets. Only the Royal Guard and the Levitating Hitman carry them.`;
  if (item.specialAmmoKind) return `${cls} cannot use special arrows — Ranger and Royal Guard only.`;
  if (playerClass === COWBOY && item.weaponKind && item.weaponKind !== 'gun') return `Only real Cowboys fight with their fists!`;
  const kindLabels: Record<string, string> = { staff: 'staves/wands', blade: 'blades', bow: 'bows', gun: 'guns' };
  const classWeapons: Record<string, string> = {
    [WIZARD]: 'staves/wands',
    [GENIE]: 'staves/wands',
    [NINJA]: 'blades',
    [FENCER]: 'blades',
    [RANGER]: 'bows or guns (main) / blades (off)',
    [ROYAL_GUARD]: 'bows, guns (including muskets), and blades',
    [COWBOY]: 'guns',
    [HITMAN]: 'guns, including muskets',
  };
  const kind = kindLabels[item.weaponKind ?? ''] ?? item.weaponKind ?? 'this weapon';
  const allowed = classWeapons[playerClass] ?? 'compatible weapons';
  return `${cls} cannot equip ${kind}. ${cls} weapons: ${allowed}.`;
}
