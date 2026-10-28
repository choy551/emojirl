import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyCity, normalizeCity, TRAIN_EMOJI, type CityState } from '../game/emojiCity';
import {
  ONLINE_UNAVAILABLE,
  PUBLISH_LIMIT,
  encodeCursor,
  mergeLedgerPages,
  pageSharedCities,
  parseSort,
  structureCount,
  validatePublish,
  type SharedCityRecord,
} from '../game/cityShareModel';
import { ensurePlayerToken, getSharedCity, listSharedCities, loadShareStatus, publishMyCity, PLAYER_TOKEN_KEY } from '../game/cityShareClient';
import { handleCityShare, memoryDeps } from './cityShareHttp';
import { databaseUrl, hashPlayerToken, listQueryText } from './cityStore';
import { applyCityShareSchema, CITY_SHARE_SQL, cityShareStatements, schemaOnce } from './cityShareSchema';

const TOKEN = 'a'.repeat(43);

function spannedCity(): CityState {
  const city = emptyCity();
  for (let x = 0; x < city.cols; x++) city.tiles[x] = TRAIN_EMOJI[x % TRAIN_EMOJI.length]!;
  return city;
}

function record(partial: Partial<SharedCityRecord> & Pick<SharedCityRecord, 'id' | 'username'>): SharedCityRecord {
  return {
    tokenHash: partial.tokenHash ?? partial.id,
    cityName: partial.cityName ?? 'Emoji City',
    structures: partial.structures ?? 0,
    citizens: partial.citizens ?? 0,
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
    grid: partial.grid ?? emptyCity(),
    ...partial,
  };
}

function post(body: unknown, token = TOKEN) {
  return new Request('http://local/api/cities', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe('city share validation', () => {
  it('counts structures, requires a spanning train line, and rejects oversized or dirty payloads', () => {
    const city = spannedCity();
    city.tiles[city.cols] = '🏠';
    city.citizens = [{ id: 'c-1', emoji: '🧟', x: 0, y: 1 }];
    expect(structureCount(city)).toBe(1);
    const decorOnly = spannedCity();
    decorOnly.decor = decorOnly.tiles.map(cell => !!cell);
    expect(structureCount(decorOnly)).toBe(0);

    const ok = validatePublish({ token: TOKEN, username: 'BraveOtter1000', cityName: '  Dockside  ', city });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.cityName).toBe('Dockside');
      expect(ok.value.structures).toBe(1);
      expect(ok.value.citizens).toBe(1);
    }

    expect(validatePublish({ token: TOKEN, username: 'nope', cityName: 'Dockside', city }).ok).toBe(false);
    expect(validatePublish({ token: TOKEN, username: 'BraveOtter1000', cityName: 'City 🚆', city }).ok).toBe(false);
    expect(validatePublish({ token: 'short', username: 'BraveOtter1000', cityName: 'Dockside', city }).ok).toBe(false);
    const gapped = spannedCity();
    gapped.tiles[3] = null;
    expect(validatePublish({ token: TOKEN, username: 'BraveOtter1000', cityName: 'Dockside', city: gapped }).ok).toBe(false);
    const huge = spannedCity();
    huge.tiles = huge.tiles.concat(huge.tiles);
    expect(validatePublish({ token: TOKEN, username: 'BraveOtter1000', cityName: 'Dockside', city: huge }).ok).toBe(false);
    expect(parseSort('structures;drop table')).toBe('updated');
  });
});

describe('city share http', () => {
  it('publishes and updates one city per token without returning the secret', async () => {
    const deps = memoryDeps(() => Date.parse('2026-04-01T00:00:00.000Z'));
    const first = await handleCityShare(post({ username: 'BraveOtter1000', cityName: 'Dockside', city: spannedCity() }), deps);
    expect(first.status).toBe(201);
    const created = await first.json() as { path: string; city: { id: string; structures: number } };
    expect(created.path).toBe(`/visit/${created.city.id}`);
    expect(JSON.stringify(created)).not.toContain(TOKEN);
    expect(JSON.stringify(created)).not.toContain('tokenHash');

    const house = spannedCity();
    house.tiles[house.cols] = '🏠';
    const second = await handleCityShare(post({ username: 'BraveOtter1000', cityName: 'North Yard', city: house }), deps);
    expect(second.status).toBe(200);
    const updated = await second.json() as { city: { id: string; cityName: string; structures: number } };
    expect(updated.city.id).toBe(created.city.id);
    expect(updated.city).toMatchObject({ cityName: 'North Yard', structures: 1 });

    const fetched = await handleCityShare(new Request(`http://local/api/cities/${created.city.id}`), deps);
    const body = await fetched.json() as { city: { grid: { tiles: (string | null)[] }; tokenHash?: string } };
    const sharedGrid = normalizeCity(body.city.grid);
    expect(sharedGrid.tiles[sharedGrid.tiles.length > 8 ? 8 : 0]).toBe('🏠');
    expect(body.city.tokenHash).toBeUndefined();
    expect(sharedGrid.blockedTypes).toContain('🟧');
    expect(sharedGrid.blockedTypes).toContain('🟦');

    const old = spannedCity();
    const { blockedTypes, passOverride, ...legacy } = old;
    void blockedTypes;
    void passOverride;
    await deps.store.insert({
      id: 'legacycity01',
      tokenHash: 'legacy-token',
      username: 'BraveOtter1000',
      cityName: 'Old Yard',
      structures: 0,
      citizens: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
      grid: legacy as CityState,
    });
    const visited = await handleCityShare(new Request('http://local/api/cities/legacycity01'), deps);
    const oldBody = await visited.json() as { city: { grid: { blockedTypes: string[]; passOverride: (boolean | null)[]; tiles: (string | null)[] } } };
    const oldGrid = normalizeCity(oldBody.city.grid);
    expect(oldGrid.blockedTypes).toContain('🟧');
    expect(oldGrid.blockedTypes).toContain('🟦');
    expect(oldGrid.passOverride.every(flag => flag === null)).toBe(true);
    expect(oldGrid.tiles).toEqual(old.tiles);
    expect(await (await handleCityShare(new Request('http://local/api/cities/nope'), deps)).status).toBe(404);

    const empty = await handleCityShare(new Request('http://local/api/cities', { method: 'POST', body: '' }), deps);
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: 'City payload must be JSON.' });
    const blank = await handleCityShare(new Request('http://local/api/cities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }), deps);
    expect(blank.status).toBe(401);
    expect(await blank.json()).toMatchObject({ error: 'Missing player token.' });
    const garbage = await handleCityShare(new Request('http://local/api/cities', { method: 'POST', body: '{' }), deps);
    expect(garbage.status).toBe(400);
  });

  it('rate limits publishes per token and pages the ledger with a cursor', async () => {
    let now = Date.parse('2026-05-01T00:00:00.000Z');
    const deps = memoryDeps(() => now);
    for (let i = 0; i < PUBLISH_LIMIT; i++) {
      const res = await handleCityShare(post({ username: 'BraveOtter1000', cityName: 'Dockside', city: spannedCity() }), deps);
      expect(res.status).toBe(i === 0 ? 201 : 200);
    }
    const blocked = await handleCityShare(post({ username: 'BraveOtter1000', cityName: 'Dockside', city: spannedCity() }), deps);
    expect(blocked.status).toBe(429);
    now += 61_000;
    const again = await handleCityShare(post({ username: 'BraveOtter1000', cityName: 'Later', city: spannedCity() }), deps);
    expect(again.status).toBe(200);

    const rows: SharedCityRecord[] = Array.from({ length: 25 }, (_, index) => record({
      id: `p${String(index).padStart(11, '0')}`,
      username: index % 2 === 0 ? 'BraveOtter1000' : 'CalmPanda1001',
      cityName: `City ${String.fromCharCode(90 - (index % 5))}`,
      structures: index,
      citizens: 24 - index,
      updatedAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 1000).toISOString(),
    }));
    for (const row of rows) await deps.store.insert(row);
    const page = pageSharedCities(rows, { sort: 'structures', dir: 'desc', cursor: null, limit: 20 });
    expect(page.rows).toHaveLength(20);
    expect(page.rows[0]?.structures).toBe(24);
    expect(page.rows[19]?.structures).toBe(5);
    expect(page.nextCursor).toBeTruthy();
    const rest = pageSharedCities(rows, { sort: 'structures', dir: 'desc', cursor: page.nextCursor, limit: 20 });
    expect(rest.rows.map(row => row.structures)).toEqual([4, 3, 2, 1, 0]);
    expect(rest.nextCursor).toBeNull();
    const players = pageSharedCities(rows, { sort: 'player', dir: 'asc', cursor: null, limit: 30 });
    expect(players.rows[0]?.username).toBe('BraveOtter1000');
    expect(players.rows.at(-1)?.username).toBe('CalmPanda1001');
    const otherSort = pageSharedCities(rows, { sort: 'citizens', dir: 'asc', cursor: page.nextCursor, limit: 20 });
    expect(otherSort.rows[0]?.citizens).toBe(0);
    expect(mergeLedgerPages(page.rows, rest.rows)).toHaveLength(25);

    const listed = await handleCityShare(new Request('http://local/api/cities?sort=updated&dir=asc&limit=2'), deps);
    const listedBody = await listed.json() as { cities: { id: string }[]; nextCursor: string | null };
    expect(listedBody.cities).toHaveLength(2);
    const listedNext = await handleCityShare(new Request(`http://local/api/cities?sort=updated&dir=asc&limit=2&cursor=${listedBody.nextCursor}`), deps);
    const nextBody = await listedNext.json() as { cities: { id: string }[] };
    expect(nextBody.cities[0]?.id).not.toBe(listedBody.cities[0]?.id);
  });

  it('reports online features unavailable when the database url is unset', async () => {
    const deps = { store: null, now: () => 0, newId: () => 'c00000000001' };
    for (const request of [
      new Request('http://local/api/share-status'),
      new Request('http://local/api/cities'),
      new Request('http://local/api/cities/c00000000001'),
      post({ username: 'BraveOtter1000', cityName: 'Dockside', city: spannedCity() }),
    ]) {
      const res = await handleCityShare(request, deps);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ online: false, error: ONLINE_UNAVAILABLE });
    }
    expect(databaseUrl({ DATABASE_URL: '', POSTGRES_URL: 'postgres://example/db' })).toBe('postgres://example/db');
    expect(databaseUrl({ DATABASE_URL: 'https://example', POSTGRES_URL: 'postgres://example/db' })).toBeNull();
    expect(hashPlayerToken(TOKEN)).toHaveLength(64);
    expect(hashPlayerToken(TOKEN)).not.toBe(TOKEN);
  });
});

describe('city share sql and client', () => {
  it('builds whitelisted order clauses and keeps the player token in local storage', async () => {
    const sorts = ['player', 'city', 'structures', 'citizens', 'updated'] as const;
    for (const sort of sorts) {
      for (const dir of ['asc', 'desc'] as const) {
        const text = listQueryText(sort, dir, true);
        expect(text.startsWith('SELECT')).toBe(true);
        expect(text).toContain(dir.toUpperCase());
        expect(text).not.toContain(';');
        expect(listQueryText(sort, dir, false)).toContain('LIMIT $1');
      }
    }
    expect(listQueryText('structures', 'desc', true)).toContain('ORDER BY structures DESC, id DESC');
    expect(listQueryText('player', 'asc', true)).toContain('username ASC');
    expect(encodeCursor({ sort: 'structures', dir: 'desc', value: 3, id: 'c00000000001' })).toMatch(/^[A-Za-z0-9_-]+$/);

    const saved = new Map<string, string>();
    const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
    const token = ensurePlayerToken(storage);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(ensurePlayerToken(storage)).toBe(token);
    expect(saved.get(PLAYER_TOKEN_KEY)).toBe(token);

    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/share-status') return Response.json({ online: false }, { status: 503 });
      if (url.startsWith('/api/cities?')) return Response.json({ online: true, cities: [{ id: 'c00000000001', username: 'BraveOtter1000', cityName: 'Dockside', structures: 0, citizens: 0, updatedAt: '2026-01-01T00:00:00.000Z' }], nextCursor: 'next' });
      if (url.startsWith('/api/cities/')) return Response.json({ error: 'No city with that id.' }, { status: 404 });
      return Response.json({ online: true, path: '/visit/c00000000001', city: { id: 'c00000000001' } }, { status: 201 });
    };
    expect(await loadShareStatus(fetchImpl)).toEqual({ online: false });
    const published = await publishMyCity({ username: 'BraveOtter1000', cityName: 'Dockside', city: spannedCity(), token }, fetchImpl);
    expect(published).toEqual({ online: true, ok: true, id: 'c00000000001', path: '/visit/c00000000001' });
    const auth = calls.find(call => call.url === '/api/cities')?.init?.headers as Record<string, string>;
    expect(auth.authorization).toBe(`Bearer ${token}`);
    const publishedBody = String(calls.find(call => call.url === '/api/cities')?.init?.body);
    expect(publishedBody).not.toContain(token);
    expect(publishedBody).toContain('"compact":1');
    expect((await listSharedCities({ sort: 'city', dir: 'asc' }, fetchImpl)).online).toBe(true);
    expect(await getSharedCity('missing', fetchImpl)).toMatchObject({ online: true, ok: false, status: 404 });
    expect(await loadShareStatus(async () => { throw new Error('down'); })).toEqual({ online: false });

    const schema = readFileSync(new URL('../../db/city_share.sql', import.meta.url), 'utf8');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS shared_cities');
    expect(schema).toContain('token_hash');
    expect(schema).toContain('share_rate_buckets');
    const setup = readFileSync(new URL('../../scripts/setup-city-share.mjs', import.meta.url), 'utf8');
    expect(setup).toContain('@neondatabase/serverless');
    expect(setup).toContain('DATABASE_URL');
    expect(setup).toContain('POSTGRES_URL');
    const api = readFileSync(new URL('../../api/cities.ts', import.meta.url), 'utf8');
    expect(api).toContain('export function GET');
    expect(api).toContain('export function POST');
    expect(api).toContain('./cityShareBundle.js');
    expect(api).not.toContain('.ts');
    const bundleScript = readFileSync(new URL('../../scripts/bundle-city-api.mjs', import.meta.url), 'utf8');
    expect(bundleScript).toContain('api/cityShareBundle.js');
    expect(bundleScript).toContain('src/server/cityShareHttp.ts');
    const ledger = readFileSync(new URL('../pages/ledger.tsx', import.meta.url), 'utf8');
    expect(ledger).toContain('Player');
    expect(ledger).toContain('Structures');
    expect(ledger).toContain('Citizens');
    expect(ledger).toContain('Updated');
    expect(ledger).toContain('sort-${column.key}-asc');
    expect(ledger).toContain('sort-${column.key}-desc');
    expect(ledger).toContain('whitespace-nowrap px-3 py-2 align-middle');
    expect(ledger).toContain('inline-flex items-center gap-1 whitespace-nowrap');
    expect(ledger).toContain('ledger-more');
    expect(ledger).toContain('ONLINE_UNAVAILABLE');
    const visit = readFileSync(new URL('../pages/visitCity.tsx', import.meta.url), 'utf8');
    expect(visit).toContain("const TILE_MAX = '2.75rem'");
    expect(visit).toContain("const TILE_MIN = '2rem'");
    expect(visit).toContain('minmax(${TILE_MIN}, ${TILE_MAX})');
    expect(visit).toContain('w-fit min-w-min max-w-full');
    expect(visit).toContain('data-testid="visit-grid-scroll"');
    const gridAt = visit.indexOf('data-testid="visit-grid-scroll"');
    const mapAt = visit.indexOf('data-testid="visit-map"');
    expect(mapAt).toBeGreaterThan(visit.indexOf('max-w-lg'));
    expect(visit.slice(mapAt, gridAt + 180)).not.toContain('max-w-lg');
    expect(visit.slice(mapAt, gridAt + 180)).toContain('overflow-x-auto');
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('path="/ledger"');
    expect(app).toContain('path="/visit/:id"');
    const store = readFileSync(new URL('./cityStore.ts', import.meta.url), 'utf8');
    expect(store).toContain('@neondatabase/serverless');
    expect(store).toContain('applyCityShareSchema');
  });

  it('creates the schema idempotently and keeps the connection string off the client', async () => {
    const file = readFileSync(new URL('../../db/city_share.sql', import.meta.url), 'utf8');
    expect(file).toBe(CITY_SHARE_SQL);
    const statements = cityShareStatements();
    expect(statements).toHaveLength(7);
    expect(statements.every(statement => statement.startsWith('CREATE TABLE IF NOT EXISTS ') || statement.startsWith('CREATE INDEX IF NOT EXISTS '))).toBe(true);

    const ran: string[] = [];
    let runs = 0;
    const ensure = schemaOnce(async () => {
      runs += 1;
      await applyCityShareSchema(async statement => { ran.push(statement); });
    });
    await Promise.all([ensure(), ensure()]);
    await ensure();
    expect(runs).toBe(1);
    expect(ran).toEqual(statements);

    let failures = 0;
    const retry = schemaOnce(async () => {
      failures += 1;
      if (failures === 1) throw new Error('schema failed');
    });
    await expect(retry()).rejects.toThrow('schema failed');
    await retry();
    expect(failures).toBe(2);

    expect(databaseUrl({
      DATABASE_URL: 'postgres://pooled/db',
      DATABASE_URL_UNPOOLED: 'postgres://direct/db',
    })).toBe('postgres://pooled/db');
    expect(databaseUrl({
      DATABASE_URL: '',
      POSTGRES_URL: '',
      DATABASE_POSTGRES_URL: 'postgres://prefixed/db',
    })).toBe('postgres://prefixed/db');

    const clientFiles = ['src/pages', 'src/game', 'src/components', 'src/hooks'].flatMap(dir => listSources(dir));
    clientFiles.push('src/App.tsx', 'src/main.tsx');
    for (const filePath of clientFiles) {
      const text = readFileSync(new URL(`../../${filePath}`, import.meta.url), 'utf8');
      expect(text, filePath).not.toContain('DATABASE_URL');
      expect(text, filePath).not.toContain('VITE_DATABASE');
      expect(text, filePath).not.toContain('cityShareSchema');
      expect(text, filePath).not.toContain('cityStore');
    }
    const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    expect(vite).not.toContain('DATABASE_URL');
    expect(vite).not.toContain('VITE_DATABASE');
  });
});

function listSources(dir: string): string[] {
  const root = new URL(`../../${dir}`, import.meta.url);
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listSources(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
