import { EmojiItem } from './types';

/** Per-emoji caps for the stackable-passive collapse mechanic. */
export const STACKABLE_BAG_CAPS: Record<string, number> = {
  '🍀': 3,   // bonusLoot: 55% + 3×15% = 100%, capped to 95% in practice
  '💊': 4,   // regeneration: 5-turn interval shrinks to 1-turn minimum after 4 copies
  '🛡️': 9,  // shieldWall: no natural gameplay cap
  '🍄': 9,   // healOnKill: no natural gameplay cap
  '💎': 9,   // thorns: no natural gameplay cap
  '❤️': 5,   // vampiricStrike: +1 HP per hit per copy
  '🦋': 5,   // dodgeHeal: +1 HP per dodge per copy
  '🗡️': 4,   // ninjaCombo: 25% base + ~15% per copy (capped reasonably)
  '🌊': 5,   // combatRegen: +1 HP per turn per copy (in combat)
};

export function isStackableBagPassive(item: EmojiItem): boolean {
  const p = item.bagPassive;
  return !!p && !!(p.shieldWall || p.healOnKill || p.bonusLoot || p.thorns || p.regeneration ||
    p.vampiricStrike || p.dodgeHeal || p.ninjaCombo || p.combatRegen);
}

/** Returns true if an item is actively contributing a bag passive right now. */
export function hasBagPassive(item: EmojiItem): boolean {
  return !item.consumed && !item.isEquipment && !!item.bagPassive && !item.activeKind && item.healAmount == null && item.ammoAmount == null;
}

export function getStackableBonusLabel(item: EmojiItem): string | null {
  const p = item.bagPassive;
  if (!p) return null;
  // Labels reflect actual in-game formulas from computeBagPassives / combat logic:
  // shieldWall: 25% block chance + −1 incoming dmg per copy in bag
  if (p.shieldWall)   return '25% block, −1 dmg per ×';
  // healOnKill: +1 HP per kill per copy (acc.healOnKill += sc)
  if (p.healOnKill)   return '+1 HP per kill per ×';
  // bonusLoot: base 55% + 15% per copy (Math.min(95, 0.55 + 0.15 * stacks))
  if (p.bonusLoot)    return '+15% drop chance per ×';
  // thorns: reflect N dmg per hit where N = total copies (acc.thorns += sc)
  if (p.thorns)       return '+1 reflect dmg per ×';
  // regeneration: +1 HP every (6 − copies) turns, min 1-turn interval
  if (p.regeneration) return '+1 HP / 5 turns';
  if (p.vampiricStrike) return '+1 HP per hit per ×';
  if (p.dodgeHeal)      return '+1 HP on dodge per ×';
  if (p.ninjaCombo)     return 'Ninja only: +15% combo chance per × (base 25%)';
  if (p.combatRegen)    return '+1 HP per turn in combat per ×';
  return null;
}

export function getStackableCumulativeLabel(item: EmojiItem): string | null {
  const p = item.bagPassive;
  if (!p) return null;
  const n = item.stackCount ?? 1;
  if (p.shieldWall)   return `${n * 25}% block chance, −${n} incoming dmg`;
  if (p.healOnKill)   return `+${n} HP per kill`;
  if (p.bonusLoot)    return `${Math.min(95, Math.round((0.55 + 0.15 * n) * 100))}% item drop chance`;
  if (p.thorns)       return `+${n} reflect dmg per hit`;
  if (p.regeneration) return `+1 HP every ${Math.max(1, 6 - n)} turns`;
  if (p.vampiricStrike) return `+${n} HP per hit`;
  if (p.dodgeHeal)      return `+${n} HP on dodge`;
  if (p.ninjaCombo)     return `Ninja only: ${25 + (n-1)*15}% chance of bonus melee strike`;
  if (p.combatRegen)    return `+${n} HP per turn in combat`;
  return null;
}

export function getPassiveTooltipSuffix(item: EmojiItem): string {
  if (!hasBagPassive(item)) return '';
  const p = item.bagPassive!;
  const cumulative = getStackableCumulativeLabel(item);
  if (cumulative) {
    const n = item.stackCount ?? 1;
    return ` · Passive ×${n}: ${cumulative}`;
  }
  const statParts: string[] = [];
  if (p.attackBonus)              statParts.push(`+${p.attackBonus} ATK`);
  if (p.defenseBonus)             statParts.push(`+${p.defenseBonus} DEF`);
  if (p.speedBonus)               statParts.push(`+${p.speedBonus} SPD`);
  if (p.evasionBonus)             statParts.push(`+${p.evasionBonus} EVA`);
  if (p.luckBonus)                statParts.push(`+${p.luckBonus} LCK`);
  if (p.losBonus && p.losBonus > 0) statParts.push(`+${p.losBonus} vision`);
  if (p.losBonus && p.losBonus < 0) statParts.push(`${p.losBonus} vision`);
  const base = ` · Passive: ${p.description}`;
  return statParts.length > 0 ? `${base} [${statParts.join(', ')}]` : base;
}
