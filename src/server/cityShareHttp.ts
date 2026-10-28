import {
  ONLINE_UNAVAILABLE,
  PUBLIC_ID_PATTERN,
  PUBLISH_LIMIT,
  READ_LIMIT,
  SHARE_BODY_MAX,
  parseDir,
  parseLimit,
  parseSort,
  validatePublish,
  type SharedCityRecord,
} from '../game/cityShareModel.ts';
import { normalizeCity, type CityState } from '../game/emojiCity.ts';
import { compactCity } from '../game/neighborhoods.ts';
import { databaseUrl, hashPlayerToken, memoryCityStore, neonCityStore, newPublicId, type CityStore } from './cityStore.ts';

export { ONLINE_UNAVAILABLE };

export interface CityShareDeps {
  store: CityStore | null;
  now: () => number;
  newId: () => string;
}

let cached: { url: string; store: CityStore } | null = null;

export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): CityStore | null {
  const url = databaseUrl(env);
  if (!url) return null;
  if (!cached || cached.url !== url) cached = { url, store: neonCityStore(url) };
  return cached.store;
}

function defaultDeps(): CityShareDeps {
  return { store: storeFromEnv(), now: () => Date.now(), newId: newPublicId };
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function unavailable(): Response {
  return json({ online: false, error: ONLINE_UNAVAILABLE }, 503);
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  if (forwarded && forwarded.length <= 80) return forwarded;
  return 'local';
}

function bearer(request: Request): string | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]{43,80})$/.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}

function publicCity(row: SharedCityRecord, withGrid: boolean) {
  const base = {
    id: row.id,
    username: row.username,
    cityName: row.cityName,
    structures: row.structures,
    citizens: row.citizens,
    updatedAt: row.updatedAt,
  };
  return withGrid ? { ...base, grid: compactCity(normalizeCity(row.grid)) as unknown as CityState } : base;
}

async function allowRead(store: CityStore, request: Request, now: number): Promise<Response | null> {
  const rate = await store.hitRate(`read:${clientIp(request)}`, READ_LIMIT, now);
  if (rate.allowed) return null;
  return json({ error: 'Too many requests. Try again in a minute.' }, 429);
}

export async function handleCityShare(request: Request, deps: CityShareDeps = defaultDeps()): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] !== 'api') return json({ error: 'Not found.' }, 404);
    if (parts[1] === 'share-status' && parts.length === 2 && request.method === 'GET') {
      if (!deps.store) return unavailable();
      const ok = await deps.store.ping();
      return ok ? json({ online: true }) : unavailable();
    }
    if (parts[1] === 'cities' && parts.length === 2) {
      if (request.method === 'GET') return listCities(request, url, deps);
      if (request.method === 'POST') return publishCity(request, deps);
      return json({ error: 'Method not allowed.' }, 405);
    }
    if (parts[1] === 'cities' && parts.length === 3) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
      return getCity(request, decodeURIComponent(parts[2] ?? ''), deps);
    }
    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    console.error('city share failed', err instanceof Error ? err.name : 'error');
    return unavailable();
  }
}

async function listCities(request: Request, url: URL, deps: CityShareDeps): Promise<Response> {
  if (!deps.store) return unavailable();
  const blocked = await allowRead(deps.store, request, deps.now());
  if (blocked) return blocked;
  const cursor = url.searchParams.get('cursor');
  const page = await deps.store.list({
    sort: parseSort(url.searchParams.get('sort')),
    dir: parseDir(url.searchParams.get('dir')),
    cursor: cursor && cursor.length <= 500 ? cursor : null,
    limit: parseLimit(url.searchParams.get('limit')),
  });
  return json({
    online: true,
    cities: page.rows.map(row => publicCity(row, false)),
    nextCursor: page.nextCursor,
  });
}

async function getCity(request: Request, id: string, deps: CityShareDeps): Promise<Response> {
  if (!deps.store) return unavailable();
  if (!PUBLIC_ID_PATTERN.test(id)) return json({ error: 'No city with that id.' }, 404);
  const blocked = await allowRead(deps.store, request, deps.now());
  if (blocked) return blocked;
  const row = await deps.store.findById(id);
  if (!row) return json({ error: 'No city with that id.' }, 404);
  return json({ online: true, city: publicCity(row, true) });
}

async function publishCity(request: Request, deps: CityShareDeps): Promise<Response> {
  if (!deps.store) return unavailable();
  const claimed = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(claimed) && claimed > SHARE_BODY_MAX) return json({ error: 'City payload is too large.' }, 413);
  const text = await request.text();
  if (text.length > SHARE_BODY_MAX) return json({ error: 'City payload is too large.' }, 413);
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { return json({ error: 'City payload must be JSON.' }, 400); }
  const token = bearer(request);
  if (!token) return json({ error: 'Missing player token.' }, 401);
  const body = parsed && typeof parsed === 'object' ? parsed as { username?: unknown; cityName?: unknown; city?: unknown } : {};
  const validated = validatePublish({ token, username: body.username, cityName: body.cityName, city: body.city });
  if (!validated.ok) return json({ error: validated.error }, 400);
  const tokenHash = hashPlayerToken(token);
  const rate = await deps.store.hitRate(`post:${tokenHash}`, PUBLISH_LIMIT, deps.now());
  if (!rate.allowed) return json({ error: 'Too many city updates. Try again in a minute.' }, 429);
  const updatedAt = new Date(deps.now()).toISOString();
  const existing = await deps.store.findByTokenHash(tokenHash);
  if (existing) {
    const next: SharedCityRecord = {
      ...existing,
      username: validated.value.username,
      cityName: validated.value.cityName,
      grid: compactCity(validated.value.city) as unknown as CityState,
      structures: validated.value.structures,
      citizens: validated.value.citizens,
      updatedAt,
    };
    await deps.store.update(next);
    return json({ online: true, city: publicCity(next, false), path: `/visit/${next.id}` });
  }
  let id = deps.newId();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await deps.store.findById(id)) {
      id = deps.newId();
      continue;
    }
    const created: SharedCityRecord = {
      id,
      tokenHash,
      username: validated.value.username,
      cityName: validated.value.cityName,
      grid: compactCity(validated.value.city) as unknown as CityState,
      structures: validated.value.structures,
      citizens: validated.value.citizens,
      updatedAt,
    };
    try {
      await deps.store.insert(created);
      return json({ online: true, city: publicCity(created, false), path: `/visit/${created.id}` }, 201);
    } catch (err) {
      const raced = await deps.store.findByTokenHash(tokenHash);
      if (!raced) throw err;
      raced.username = validated.value.username;
      raced.cityName = validated.value.cityName;
      raced.grid = compactCity(validated.value.city) as unknown as CityState;
      raced.structures = validated.value.structures;
      raced.citizens = validated.value.citizens;
      raced.updatedAt = updatedAt;
      await deps.store.update(raced);
      return json({ online: true, city: publicCity(raced, false), path: `/visit/${raced.id}` });
    }
  }
  return json({ error: 'Could not publish that city.' }, 500);
}

/** Test helper so a suite can build deps around a memory store. */
export function memoryDeps(now = () => Date.now()): CityShareDeps & { store: CityStore } {
  let n = 0;
  return {
    store: memoryCityStore(),
    now,
    newId: () => `c${String(++n).padStart(11, '0')}`,
  };
}
