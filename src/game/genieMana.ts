import { GENIE_BOSS_MP, GENIE_ELITE_MP, GENIE_KILL_MP } from './prestigeConstants';

/** Wizard only. A Genie does not gain MP for waiting out of sight. */
export function manaAfterQuietWait(characterClass: string, mana: number, maxMana: number): number {
  if (characterClass !== '🧙') return mana;
  return Math.min(maxMana, mana + 1);
}

/**
 * Stairs refill. Wizard fills to max. Genie rises to 50% and never loses MP.
 * Every other class is unchanged.
 */
export function manaOnDescend(characterClass: string, mana: number, maxMana: number): number {
  if (characterClass === '🧙') return maxMana;
  if (characterClass === '🧞‍♀️') return Math.max(mana, Math.ceil(maxMana * 0.5));
  return mana;
}

export function genieKillMp(victim?: { isBoss?: boolean; godBlessed?: boolean }): number {
  if (victim?.isBoss) return GENIE_BOSS_MP;
  if (victim?.godBlessed) return GENIE_ELITE_MP;
  return GENIE_KILL_MP;
}
