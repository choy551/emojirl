/** HP restored by one wait/rest turn before campfire, wave, and the low-HP multiplier. */
export const WAIT_HEAL = 1;
/** Extra HP on that turn while adjacent to a campfire or restaurant. Multiplied with the rest package. */
export const CAMPFIRE_REST_BONUS = 2;
/** At or under this fraction of max HP, rest heals triple. */
export const REST_CRITICAL_RATIO = 0.25;
/** At or under this fraction of max HP, rest heals double. Above it, rest is normal. */
export const REST_HALVES_RATIO = 0.5;
export const REST_CRITICAL_MULT = 3;
export const REST_HALVES_MULT = 2;

/**
 * Rest and auto-rest share this. Combat regen (🌊 during enemy turns) does not.
 * Ratio is current HP over the heal cap, checked at the start of the turn.
 */
export function restHealMultiplier(hp: number, maxHp: number): number {
  const pool = Math.max(1, maxHp);
  const ratio = Math.max(0, hp) / pool;
  if (ratio <= REST_CRITICAL_RATIO) return REST_CRITICAL_MULT;
  if (ratio <= REST_HALVES_RATIO) return REST_HALVES_MULT;
  return 1;
}

export function restHealAmount(opts: {
  hp: number;
  maxHp: number;
  waveRegen?: number;
  campfire?: boolean;
}): number {
  const base = WAIT_HEAL + Math.max(0, Math.floor(opts.waveRegen ?? 0)) + (opts.campfire ? CAMPFIRE_REST_BONUS : 0);
  return base * restHealMultiplier(opts.hp, opts.maxHp);
}

/** Turns of uninterrupted rest to reach maxHp. Each turn uses HP at the start of that turn. */
export function turnsToFullRest(
  hp: number,
  maxHp: number,
  extras?: { waveRegen?: number; campfire?: boolean },
): number {
  const pool = Math.max(0, Math.floor(maxHp));
  let current = Math.max(0, Math.floor(hp));
  let turns = 0;
  while (current < pool && turns < pool + 5) {
    current = Math.min(pool, current + restHealAmount({ hp: current, maxHp: pool, ...extras }));
    turns += 1;
  }
  return turns;
}
