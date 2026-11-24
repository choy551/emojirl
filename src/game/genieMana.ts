import { GENIE_BOSS_MP, GENIE_ELITE_MP, GENIE_KILL_MP } from './prestigeConstants';

/** Wizard only. A Genie does not gain MP for waiting out of sight. */
export function manaAfterQuietWait(characterClass: string, mana: number, maxMana: number): number {
  if (characterClass !== '🧙') return mana;
  return Math.min(maxMana, mana + 1);
}

/** Stairs refill. Wizard fills to max. A Genie keeps whatever MP they have. */
export function manaOnDescend(characterClass: string, mana: number, maxMana: number): number {
  if (characterClass === '🧙') return maxMana;
  return mana;
}

/** Highest Transmute tier in one blast. Boss 8 beats elite 4 beats a normal kill 2. */
export function bestGenieKillMp(victims: { isBoss?: boolean; godBlessed?: boolean }[]): number {
  return victims.reduce((best, victim) => Math.max(best, genieKillMp(victim)), 0);
}

export function genieKillMp(victim?: { isBoss?: boolean; godBlessed?: boolean }): number {
  if (victim?.isBoss) return GENIE_BOSS_MP;
  if (victim?.godBlessed) return GENIE_ELITE_MP;
  return GENIE_KILL_MP;
}
