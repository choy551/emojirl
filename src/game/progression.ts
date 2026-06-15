import { Player } from './types';

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
  const levels = Math.floor((floor - 16) / 5) + 1;
  return { atk: levels, def: levels };
}
