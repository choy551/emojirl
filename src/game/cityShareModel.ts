import { isBuildingEmoji } from './cityBuildings';
import { isAnonymousName, normalizeCityName } from './cityIdentity';
import {
  CITY_COLS,
  CITY_DIM_MAX,
  CITY_ROWS,
  emptyCity,
  isDecorLot,
  normalizeCity,
  trainLineSpansCity,
  type CityState,
} from './emojiCity';

/** Shown on Share and the ledger when no database is configured or it cannot be reached. */
export const ONLINE_UNAVAILABLE = 'online features unavailable';

export const SHARE_BODY_MAX = 64 * 1024;
export const GRID_JSON_MAX = 48 * 1024;
export const PLAYER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,80}$/;
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{8,22}$/;
export const LIST_PAGE_DEFAULT = 20;
export const LIST_PAGE_MAX = 50;
export const RATE_WINDOW_SEC = 60;
/** City publishes per player token per minute. */
export const PUBLISH_LIMIT = 8;
/** Ledger and city reads per IP per minute. */
export const READ_LIMIT = 60;

export const SORT_KEYS = ['player', 'city', 'structures', 'citizens', 'updated'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export interface SharedCity {
  id: string;
  username: string;
  cityName: string;
  structures: number;
  citizens: number;
  updatedAt: string;
  grid: CityState;
}

export interface SharedCityRecord extends SharedCity {
  tokenHash: string;
}

export interface ListQuery {
  sort: SortKey;
  dir: SortDir;
  cursor: string | null;
  limit: number;
}

interface CursorPayload {
  sort: SortKey;
  dir: SortDir;
  value: string | number;
  id: string;
}

export interface PublishValue {
  token: string;
  username: string;
  cityName: string;
  city: CityState;
  structures: number;
  citizens: number;
}

/** Placed structures. Free decor and plain emoji do not count. */
export function structureCount(city: CityState): number {
  let count = 0;
  for (let i = 0; i < city.tiles.length; i++) {
    const cell = city.tiles[i];
    if (!cell || isDecorLot(city, i)) continue;
    if (isBuildingEmoji(cell)) count++;
  }
  return count;
}

export function parseSort(raw: string | null): SortKey {
  return (SORT_KEYS as readonly string[]).includes(raw ?? '') ? raw as SortKey : 'updated';
}

export function parseDir(raw: string | null): SortDir {
  return raw === 'asc' ? 'asc' : 'desc';
}

export function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return LIST_PAGE_DEFAULT;
  return Math.min(LIST_PAGE_MAX, Math.floor(n));
}

export function rateWindow(nowMs: number): number {
  return Math.floor(nowMs / 1000 / RATE_WINDOW_SEC);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 500) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function encodeCursor(payload: CursorPayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeCursor(raw: string | null): CursorPayload | null {
  if (!raw) return null;
  const bytes = base64UrlToBytes(raw);
  if (!bytes) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CursorPayload>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!(SORT_KEYS as readonly string[]).includes(parsed.sort ?? '')) return null;
    if (parsed.dir !== 'asc' && parsed.dir !== 'desc') return null;
    if (typeof parsed.id !== 'string' || !PUBLIC_ID_PATTERN.test(parsed.id)) return null;
    if (typeof parsed.value !== 'string' && typeof parsed.value !== 'number') return null;
    return { sort: parsed.sort as SortKey, dir: parsed.dir, value: parsed.value, id: parsed.id };
  } catch {
    return null;
  }
}

function sortValue(row: SharedCity, sort: SortKey): string | number {
  switch (sort) {
    case 'player': return row.username;
    case 'city': return row.cityName;
    case 'structures': return row.structures;
    case 'citizens': return row.citizens;
    case 'updated': return row.updatedAt;
  }
}

function compareCities(a: SharedCity, b: SharedCity, sort: SortKey, dir: SortDir): number {
  const av = sortValue(a, sort);
  const bv = sortValue(b, sort);
  let order = 0;
  if (typeof av === 'number' && typeof bv === 'number') order = av - bv;
  else {
    const as = String(av);
    const bs = String(bv);
    order = as < bs ? -1 : as > bs ? 1 : 0;
  }
  if (order === 0) order = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return dir === 'desc' ? -order : order;
}

function cursorGhost(cursor: CursorPayload): SharedCityRecord {
  const ghost: SharedCityRecord = {
    id: cursor.id,
    tokenHash: '',
    username: '',
    cityName: '',
    structures: 0,
    citizens: 0,
    updatedAt: '1970-01-01T00:00:00.000Z',
    grid: emptyCity(),
  };
  if (cursor.sort === 'player' && typeof cursor.value === 'string') ghost.username = cursor.value;
  if (cursor.sort === 'city' && typeof cursor.value === 'string') ghost.cityName = cursor.value;
  if (cursor.sort === 'structures' && typeof cursor.value === 'number') ghost.structures = cursor.value;
  if (cursor.sort === 'citizens' && typeof cursor.value === 'number') ghost.citizens = cursor.value;
  if (cursor.sort === 'updated' && typeof cursor.value === 'string') ghost.updatedAt = cursor.value;
  return ghost;
}

/** Keyset page. A cursor from another sort is ignored. `id` breaks ties. */
export function pageSharedCities(rows: readonly SharedCityRecord[], query: ListQuery): { rows: SharedCityRecord[]; nextCursor: string | null } {
  const decoded = decodeCursor(query.cursor);
  const cursor = decoded && decoded.sort === query.sort && decoded.dir === query.dir ? decoded : null;
  const sorted = [...rows].sort((a, b) => compareCities(a, b, query.sort, query.dir));
  const ghost = cursor ? cursorGhost(cursor) : null;
  const filtered = ghost ? sorted.filter(row => compareCities(ghost, row, query.sort, query.dir) < 0) : sorted;
  const page = filtered.slice(0, query.limit);
  const last = page[page.length - 1];
  const nextCursor = filtered.length > query.limit && last
    ? encodeCursor({ sort: query.sort, dir: query.dir, value: sortValue(last, query.sort), id: last.id })
    : null;
  return { rows: page, nextCursor };
}

export function mergeLedgerPages<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(prev.map(row => row.id));
  return [...prev, ...next.filter(row => !seen.has(row.id))];
}

export function validatePublish(input: {
  token: string;
  username: unknown;
  cityName: unknown;
  city: unknown;
}): { ok: true; value: PublishValue } | { ok: false; error: string } {
  if (!PLAYER_TOKEN_PATTERN.test(input.token)) return { ok: false, error: 'Missing player token.' };
  if (!isAnonymousName(input.username)) return { ok: false, error: 'That visitor name cannot be published.' };
  if (typeof input.cityName !== 'string') return { ok: false, error: 'Give the city a name.' };
  const named = normalizeCityName(input.cityName);
  if (!named.ok) return { ok: false, error: named.reason };
  const city = input.city;
  if (!city || typeof city !== 'object') return { ok: false, error: 'The city grid is missing.' };
  const raw = city as Partial<CityState>;
  const cols = typeof raw.cols === 'number' ? Math.floor(raw.cols) : NaN;
  const rows = typeof raw.rows === 'number' ? Math.floor(raw.rows) : NaN;
  if (cols < CITY_COLS || rows < CITY_ROWS || cols > CITY_DIM_MAX || rows > CITY_DIM_MAX) {
    return { ok: false, error: 'That city grid is the wrong size.' };
  }
  if (!Array.isArray(raw.tiles) || raw.tiles.length !== cols * rows) {
    return { ok: false, error: 'That city grid is the wrong size.' };
  }
  if (JSON.stringify(raw.tiles).length > GRID_JSON_MAX) return { ok: false, error: 'City payload is too large.' };
  for (const cell of raw.tiles) {
    if (cell === null) continue;
    if (typeof cell !== 'string' || cell.length === 0 || cell.length > 32) {
      return { ok: false, error: 'A city tile is not a valid emoji.' };
    }
  }
  if (raw.decor !== undefined) {
    if (!Array.isArray(raw.decor) || raw.decor.length !== raw.tiles.length || raw.decor.some(flag => typeof flag !== 'boolean')) {
      return { ok: false, error: 'That city grid is the wrong size.' };
    }
  }
  if (raw.citizens !== undefined && (!Array.isArray(raw.citizens) || raw.citizens.length > 400)) {
    return { ok: false, error: 'That city has too many citizens.' };
  }
  const normalized = normalizeCity(raw);
  if (normalized.cols !== cols || normalized.rows !== rows) return { ok: false, error: 'That city grid is the wrong size.' };
  if (JSON.stringify(normalized).length > GRID_JSON_MAX) return { ok: false, error: 'City payload is too large.' };
  if (!trainLineSpansCity(normalized)) {
    return { ok: false, error: 'A train line has to span the city before it can be shared.' };
  }
  return {
    ok: true,
    value: {
      token: input.token,
      username: input.username,
      cityName: named.name,
      city: normalized,
      structures: structureCount(normalized),
      citizens: normalized.citizens.length,
    },
  };
}
