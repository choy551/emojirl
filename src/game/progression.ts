import { Enemy, Player } from './types';

export function moodMax(characterClass: string): number {
  return characterClass === '🤠' ? Infinity : 100;
}

export function xpThresholdForLevel(level: number): number {
  return (level - 1) * (level - 1) * 5;
}

export function levelFromXP(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 5));
}

export function hpBonusForLevel(level: number): number {
  return Math.floor(Math.pow(level - 1, 1.3) * 3);
}

export function mpBonusForLevel(level: number): number {
  return Math.floor((level - 1) / 3);
}

export function computeNinjaEvasion(player: Player): number {
  const hpPct = player.stats.hp / player.stats.maxHp;
  const base = hpPct < 0.4 ? 45 : 20;
  const levelBonus = Math.min(35, (player.stats.level - 1) * 0.8);
  const itemBonus = player.stats.evasion ?? 0;
  return Math.min(75, base + levelBonus + itemBonus);
}

export function getDungeonPressure(floor: number): { atk: number; def: number } {
  if (floor <= 15) return { atk: 0, def: 0 };
  const depth = floor - 15;
  return { atk: depth * 3, def: depth * 2 };
}

export const COMPANION_BOUNTY_OOC_TURNS = 20;

/** Player XP share of a companion kill (0.50 … 0.10) from kills since last refresh. */
export function companionBountyShare(tally: number): number {
  const pct = Math.max(10, 50 - Math.floor(Math.max(0, tally) / 5) * 10);
  return pct / 100;
}

export function companionBountyPercent(tally: number): number {
  return Math.round(companionBountyShare(tally) * 100);
}

export function companionKillXp(isBoss: boolean): number {
  return isBoss ? 25 : 5;
}

export function seedCompanionProgress<T extends { xp?: number; level?: number }>(e: T): T {
  return { ...e, xp: e.xp ?? 0, level: e.level ?? 1 };
}

export function applyCompanionLevelUp(e: Enemy, oldLevel: number, newLevel: number): Enemy {
  if (newLevel <= oldLevel) return { ...e, level: oldLevel };
  const hpInc = hpBonusForLevel(newLevel) - hpBonusForLevel(oldLevel);
  const atkInc = newLevel - oldLevel;
  return {
    ...e,
    level: newLevel,
    maxHp: e.maxHp + hpInc,
    hp: e.hp + hpInc,
    attack: e.attack + atkInc,
  };
}

export function tickCompanionBountyOoc(
  tally: number,
  ooc: number,
  inCombat: boolean,
  companionKillThisTurn: boolean,
): { tally: number; ooc: number; refreshed: boolean } {
  if (companionKillThisTurn || inCombat) return { tally, ooc: 0, refreshed: false };
  const nextOoc = ooc + 1;
  if (nextOoc >= COMPANION_BOUNTY_OOC_TURNS && tally > 0) {
    return { tally: 0, ooc: 0, refreshed: true };
  }
  return { tally, ooc: nextOoc, refreshed: false };
}

export function autoRestNeedsBountyWait(tally: number): boolean {
  return companionBountyShare(tally) < 0.5;
}
