/** Offline identity for a later city-sharing update. Nothing here leaves the device. */

export const CITY_NAME_DEFAULT = 'Emoji City';
/** Visible name length after trim. */
export const CITY_NAME_MAX = 24;

const CITY_NAME_CHARS = /^[\p{L}\p{M}\p{N} '’\-.!?&]+$/u;

/**
 * Trim, collapse spaces, and accept a short readable name.
 * An empty field becomes the default. Emoji, controls, and other symbols are rejected.
 */
export function normalizeCityName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  if (/[\u0000-\u001F\u007F]/.test(raw)) {
    return { ok: false, reason: 'Use letters, numbers, spaces, and simple punctuation.' };
  }
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) return { ok: true, name: CITY_NAME_DEFAULT };
  if (name.length > CITY_NAME_MAX) {
    return { ok: false, reason: `Keep the name to ${CITY_NAME_MAX} characters.` };
  }
  if (!CITY_NAME_CHARS.test(name) || !/^[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, reason: 'Use letters, numbers, spaces, and simple punctuation.' };
  }
  return { ok: true, name };
}

/** Reddit-style visitor names: Adjective, Noun, then four digits. */
export const ANONYMOUS_ADJECTIVES = [
  'Brave', 'Calm', 'Daring', 'Eager', 'Gentle', 'Happy', 'Jolly', 'Kind',
  'Lucky', 'Merry', 'Nimble', 'Proud', 'Quiet', 'Rapid', 'Sunny', 'Witty',
] as const;

export const ANONYMOUS_NOUNS = [
  'Otter', 'Panda', 'Falcon', 'Maple', 'Comet', 'Badger', 'Heron', 'Pebble',
  'Clover', 'Moose', 'Robin', 'Quartz', 'Gecko', 'Newt', 'Sparrow', 'Walrus',
] as const;

const ANONYMOUS_NAME = /^[A-Z][a-z]+[A-Z][a-z]+[0-9]{4}$/;

export function isAnonymousName(raw: unknown): raw is string {
  return typeof raw === 'string' && ANONYMOUS_NAME.test(raw);
}

function roll(rng: () => number, count: number): number {
  const raw = rng();
  const unit = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999) : 0;
  return Math.floor(unit * count);
}

/** Adjective + Noun + 1000–9999. `rng` is injectable so tests stay stable. */
export function generateAnonymousName(rng: () => number = Math.random): string {
  const adjective = ANONYMOUS_ADJECTIVES[roll(rng, ANONYMOUS_ADJECTIVES.length)]!;
  const noun = ANONYMOUS_NOUNS[roll(rng, ANONYMOUS_NOUNS.length)]!;
  const number = 1000 + roll(rng, 9000);
  return `${adjective}${noun}${number}`;
}
