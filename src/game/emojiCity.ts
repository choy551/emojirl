import { normalizeEmojiKey } from './discoveries';

/** One placement token per lifetime consume of that emoji. */
export const TOKENS_PER_CONSUME = 1;
/** Fixed lot grid. 8 columns fit a phone without pinching. */
export const CITY_COLS = 8;
export const CITY_ROWS = 8;
/** One wandering citizen per this many placed tiles. */
export const CITIZEN_TILES = 5;
/** Citizens attempt one step on this interval. */
export const CITY_TICK_MS = 1000;

export const CITY_SIZE = CITY_COLS * CITY_ROWS;

export interface CityCitizen {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

export interface CityState {
  tiles: (string | null)[];
  citizens: CityCitizen[];
  nextId: number;
}

export interface CityEdit {
  ok: boolean;
  city: CityState;
  reason?: string;
}

const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function emptyCity(): CityState {
  return { tiles: Array.from({ length: CITY_SIZE }, () => null), citizens: [], nextId: 1 };
}

export function normalizeCity(raw: unknown): CityState {
  const tiles = Array.from({ length: CITY_SIZE }, () => null as string | null);
  const blank = emptyCity();
  if (!raw || typeof raw !== 'object') return blank;
  const src = raw as Partial<CityState>;
  if (Array.isArray(src.tiles)) {
    for (let i = 0; i < CITY_SIZE && i < src.tiles.length; i++) {
      const cell = src.tiles[i];
      tiles[i] = typeof cell === 'string' && cell.length > 0 ? normalizeEmojiKey(cell) : null;
    }
  }
  const citizens: CityCitizen[] = [];
  if (Array.isArray(src.citizens)) {
    for (const entry of src.citizens) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Partial<CityCitizen>;
      if (typeof row.emoji !== 'string' || typeof row.x !== 'number' || typeof row.y !== 'number') continue;
      const x = Math.floor(row.x);
      const y = Math.floor(row.y);
      if (x < 0 || y < 0 || x >= CITY_COLS || y >= CITY_ROWS) continue;
      citizens.push({
        id: typeof row.id === 'string' && row.id ? row.id : `c-${citizens.length + 1}`,
        emoji: normalizeEmojiKey(row.emoji),
        x,
        y,
      });
    }
  }
  const nextId = typeof src.nextId === 'number' && src.nextId > 0 ? Math.floor(src.nextId) : citizens.length + 1;
  return { tiles, citizens, nextId };
}

export function tokensForEmoji(consumes: number): number {
  return Math.max(0, Math.floor(consumes || 0)) * TOKENS_PER_CONSUME;
}

export function placedCount(city: CityState): number {
  return city.tiles.reduce((n, cell) => n + (cell ? 1 : 0), 0);
}

export function placedOf(city: CityState, emoji: string): number {
  const key = normalizeEmojiKey(emoji);
  return city.tiles.reduce((n, cell) => n + (cell === key ? 1 : 0), 0);
}

/** Tokens still unspent. Placed copies are the spent tokens; removing a lot refunds one. */
export function availableTokens(consumes: number, placed: number): number {
  return Math.max(0, tokensForEmoji(consumes) - Math.max(0, Math.floor(placed || 0)));
}

export function totalAvailableTokens(consumes: Record<string, number>, city: CityState): number {
  const keys = new Set<string>([
    ...Object.keys(consumes),
    ...city.tiles.filter((cell): cell is string => !!cell),
  ]);
  let total = 0;
  for (const emoji of keys) total += availableTokens(consumes[emoji] ?? 0, placedOf(city, emoji));
  return total;
}

export function citizenCapacity(placed: number): number {
  return Math.floor(Math.max(0, Math.floor(placed || 0)) / CITIZEN_TILES);
}

export function paletteEmojis(consumes: Record<string, number>, city: CityState): string[] {
  const keys = new Set<string>();
  for (const [emoji, n] of Object.entries(consumes)) if (n > 0) keys.add(normalizeEmojiKey(emoji));
  for (const cell of city.tiles) if (cell) keys.add(cell);
  return [...keys].sort((a, b) => (consumes[b] ?? 0) - (consumes[a] ?? 0) || a.localeCompare(b));
}

/** Lifetime kill counts weight who shows up. A roll of 0 picks the first mob with kills. */
export function pickWeightedCitizen(kills: Record<string, number>, rng: () => number): string | null {
  const entries = Object.entries(kills).filter(([, n]) => Math.floor(n) > 0);
  const total = entries.reduce((sum, [, n]) => sum + Math.floor(n), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [emoji, n] of entries) {
    roll -= Math.floor(n);
    if (roll < 0) return normalizeEmojiKey(emoji);
  }
  return normalizeEmojiKey(entries[entries.length - 1][0]);
}

function cellIndex(x: number, y: number): number {
  return y * CITY_COLS + x;
}

/** Keep citizens up to capacity. Newcomers are weighted by lifetime kills and stand on open lots. */
export function syncCitizens(city: CityState, kills: Record<string, number>, rng: () => number = Math.random): CityState {
  const cap = citizenCapacity(placedCount(city));
  const citizens = city.citizens.slice(0, cap);
  const occupied = new Set(citizens.map(c => cellIndex(c.x, c.y)));
  let nextId = city.nextId;
  while (citizens.length < cap) {
    const emoji = pickWeightedCitizen(kills, rng);
    if (!emoji) break;
    const open: number[] = [];
    for (let i = 0; i < CITY_SIZE; i++) if (!occupied.has(i)) open.push(i);
    if (open.length === 0) break;
    const index = open[Math.min(open.length - 1, Math.floor(rng() * open.length))]!;
    occupied.add(index);
    citizens.push({
      id: `c-${nextId}`,
      emoji,
      x: index % CITY_COLS,
      y: Math.floor(index / CITY_COLS),
    });
    nextId += 1;
  }
  return { ...city, citizens, nextId };
}

export function placeAt(
  city: CityState,
  index: number,
  emoji: string,
  consumes: Record<string, number>,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): CityEdit {
  if (!Number.isInteger(index) || index < 0 || index >= CITY_SIZE) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (city.tiles[index]) return { ok: false, city, reason: 'That lot is already built.' };
  const key = normalizeEmojiKey(emoji);
  if (availableTokens(consumes[key] ?? 0, placedOf(city, key)) <= 0) {
    return { ok: false, city, reason: 'No tokens for that emoji.' };
  }
  const tiles = city.tiles.slice();
  tiles[index] = key;
  return { ok: true, city: syncCitizens({ ...city, tiles }, kills, rng) };
}

export function removeAt(
  city: CityState,
  index: number,
  kills: Record<string, number>,
  rng: () => number = Math.random,
): CityEdit {
  if (!Number.isInteger(index) || index < 0 || index >= CITY_SIZE) {
    return { ok: false, city, reason: 'That lot is outside the city.' };
  }
  if (!city.tiles[index]) return { ok: false, city, reason: 'That lot is empty.' };
  const tiles = city.tiles.slice();
  tiles[index] = null;
  return { ok: true, city: syncCitizens({ ...city, tiles }, kills, rng) };
}

/** One orthogonal step per citizen. They stay put at the map edge or on another citizen. */
export function tickCitizens(city: CityState, rng: () => number = Math.random): CityState {
  const occupied = new Set(city.citizens.map(c => cellIndex(c.x, c.y)));
  const citizens = city.citizens.map(citizen => {
    const step = STEPS[Math.min(STEPS.length - 1, Math.floor(rng() * STEPS.length))]!;
    const x = citizen.x + step.x;
    const y = citizen.y + step.y;
    if (x < 0 || y < 0 || x >= CITY_COLS || y >= CITY_ROWS) return citizen;
    const next = cellIndex(x, y);
    const here = cellIndex(citizen.x, citizen.y);
    if (occupied.has(next)) return citizen;
    occupied.delete(here);
    occupied.add(next);
    return { ...citizen, x, y };
  });
  return { ...city, citizens };
}

export function emojiCityRulesBlurb(): string {
  return `EmojiCB is a city on the home screen, kept in the meta save so it survives runs. Each emoji you use from the hotbar, eat, drink, or buy-and-use grants ${TOKENS_PER_CONSUME} placement token for that emoji. Spell Echo does not spend the emoji, so it grants no token. The grid is ${CITY_COLS}×${CITY_ROWS}. Pick an emoji and tap an empty lot to build. Tap a built lot to clear it and refund the token. One citizen arrives per ${CITIZEN_TILES} placed tiles, chosen from lifetime enemy kills — a mob you have slain more often is more likely. No kills means empty streets. Citizens take one step about every ${CITY_TICK_MS / 1000} second. Shrinking the city sends the newest citizens away.`;
}
