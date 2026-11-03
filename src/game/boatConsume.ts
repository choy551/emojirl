/** Shown when a flying vessel spends a boat that would have warned a swimmer. */
export const FLYING_BOAT_LOG = 'Who needs a boat? You float on, unbothered.';

export type BoatConsumeGate =
  | { action: 'drown-warn' }
  | { action: 'last-boat-warn' }
  | { action: 'consume'; log?: string };

/**
 * Grounded sailors confirm the last boat, and confirm again before spending
 * one while standing on water (that confirm drowns them). A vessel tagged
 * +flying already crosses water, so both prompts are skipped and the spend
 * never kills them.
 */
export function boatConsumeGate(opts: {
  flies: boolean;
  overWater: boolean;
  boatCount: number;
  confirmed: boolean;
}): BoatConsumeGate {
  const wouldWarn = opts.overWater || opts.boatCount <= 1;
  if (opts.flies) {
    return wouldWarn ? { action: 'consume', log: FLYING_BOAT_LOG } : { action: 'consume' };
  }
  if (opts.overWater) return { action: 'drown-warn' };
  if (!opts.confirmed && opts.boatCount <= 1) return { action: 'last-boat-warn' };
  return { action: 'consume' };
}
