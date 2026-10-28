import {
  ONLINE_UNAVAILABLE,
  PLAYER_TOKEN_PATTERN,
  type SortDir,
  type SortKey,
} from './cityShareModel';
import { normalizeCity, type CityState } from './emojiCity';

export const PLAYER_TOKEN_KEY = 'emojirl_player_token';

export interface LedgerRow {
  id: string;
  username: string;
  cityName: string;
  structures: number;
  citizens: number;
  updatedAt: string;
}

export interface SharedCityView extends LedgerRow {
  grid: CityState;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function ensurePlayerToken(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
  const existing = storage.getItem(PLAYER_TOKEN_KEY);
  if (existing && PLAYER_TOKEN_PATTERN.test(existing)) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = bytesToBase64Url(bytes);
  storage.setItem(PLAYER_TOKEN_KEY, token);
  return token;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = await res.json() as unknown;
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export async function loadShareStatus(fetchImpl: FetchLike = fetch): Promise<{ online: boolean }> {
  try {
    const res = await fetchImpl('/api/share-status');
    const body = await readJson(res);
    if (!res.ok || body.online !== true) return { online: false };
    return { online: true };
  } catch {
    return { online: false };
  }
}

export async function publishMyCity(input: {
  username: string;
  cityName: string;
  city: CityState;
  token: string;
}, fetchImpl: FetchLike = fetch): Promise<
  | { online: false; error: typeof ONLINE_UNAVAILABLE }
  | { online: true; ok: false; error: string }
  | { online: true; ok: true; id: string; path: string }
> {
  try {
    const res = await fetchImpl('/api/cities', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({ username: input.username, cityName: input.cityName, city: input.city }),
    });
    const body = await readJson(res);
    if (res.status === 503 || body.online === false) return { online: false, error: ONLINE_UNAVAILABLE };
    const city = body.city && typeof body.city === 'object' ? body.city as { id?: unknown } : {};
    const path = typeof body.path === 'string' ? body.path : '';
    if (!res.ok || typeof city.id !== 'string' || !path) {
      return { online: true, ok: false, error: typeof body.error === 'string' ? body.error : 'Could not publish that city.' };
    }
    return { online: true, ok: true, id: city.id, path };
  } catch {
    return { online: false, error: ONLINE_UNAVAILABLE };
  }
}

export async function listSharedCities(query: {
  sort: SortKey;
  dir: SortDir;
  cursor?: string | null;
  limit?: number;
}, fetchImpl: FetchLike = fetch): Promise<
  | { online: false; error: typeof ONLINE_UNAVAILABLE }
  | { online: true; ok: false; error: string }
  | { online: true; ok: true; cities: LedgerRow[]; nextCursor: string | null }
> {
  const params = new URLSearchParams({ sort: query.sort, dir: query.dir });
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));
  try {
    const res = await fetchImpl(`/api/cities?${params.toString()}`);
    const body = await readJson(res);
    if (res.status === 503 || body.online === false) return { online: false, error: ONLINE_UNAVAILABLE };
    if (!res.ok || !Array.isArray(body.cities)) {
      return { online: true, ok: false, error: typeof body.error === 'string' ? body.error : 'Could not load cities.' };
    }
    return {
      online: true,
      ok: true,
      cities: body.cities as LedgerRow[],
      nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
    };
  } catch {
    return { online: false, error: ONLINE_UNAVAILABLE };
  }
}

export async function getSharedCity(id: string, fetchImpl: FetchLike = fetch): Promise<
  | { online: false; error: typeof ONLINE_UNAVAILABLE }
  | { online: true; ok: false; error: string; status: number }
  | { online: true; ok: true; city: SharedCityView }
> {
  try {
    const res = await fetchImpl(`/api/cities/${encodeURIComponent(id)}`);
    const body = await readJson(res);
    if (res.status === 503 || body.online === false) return { online: false, error: ONLINE_UNAVAILABLE };
    const city = body.city;
    if (!res.ok || !city || typeof city !== 'object') {
      return { online: true, ok: false, status: res.status, error: typeof body.error === 'string' ? body.error : 'No city with that id.' };
    }
    const row = city as SharedCityView;
    return { online: true, ok: true, city: { ...row, grid: normalizeCity(row.grid) } };
  } catch {
    return { online: false, error: ONLINE_UNAVAILABLE };
  }
}
