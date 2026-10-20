/** Official last floor. Preset arena, not procedural. */
export const FINALE_FLOOR = 27;

/**
 * Last boss-rush wave. Wave 1 is a single boss; from wave 2 the count doubles
 * each wave (bosses and echoes together). Wave 5 = 8 bosses + 8 echoes.
 * Raise this to extend the rush.
 */
export const BOSSRUSH_MAX_WAVE = 5;

/** Turns after a wave is cleared before the next one steps into the ring. */
export const BOSSRUSH_GRACE_TURNS = 5;
