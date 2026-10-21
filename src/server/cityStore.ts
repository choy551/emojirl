import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import {
  decodeCursor,
  encodeCursor,
  pageSharedCities,
  rateWindow,
  type ListQuery,
  type SharedCityRecord,
  type SortKey,
} from '../game/cityShareModel.ts';
import type { CityState } from '../game/emojiCity.ts';
import { applyCityShareSchema, schemaOnce } from './cityShareSchema.ts';

export interface CityStore {
  ping(): Promise<boolean>;
  findByTokenHash(hash: string): Promise<SharedCityRecord | null>;
  findById(id: string): Promise<SharedCityRecord | null>;
  insert(row: SharedCityRecord): Promise<void>;
  update(row: SharedCityRecord): Promise<void>;
  list(query: ListQuery): Promise<{ rows: SharedCityRecord[]; nextCursor: string | null }>;
  /** Increments the current window and reports whether the new total is still allowed. */
  hitRate(subject: string, limit: number, nowMs: number): Promise<{ allowed: boolean; hits: number }>;
}

export function hashPlayerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newPublicId(): string {
  return randomBytes(9).toString('base64url');
}

/**
 * Pooled Neon URL. Server-only: never read this from `import.meta.env` or a `VITE_` name.
 * `DATABASE_URL_UNPOOLED` is ignored on purpose; the serverless driver uses the pooler.
 */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.DATABASE_URL || env.POSTGRES_URL || '').trim();
  if (!raw || !/^postgres(ql)?:\/\//i.test(raw)) return null;
  return raw;
}

/** Whitelisted ORDER BY fragments. Never built from request text. */
const SORT_SQL: Record<SortKey, { column: string; cast: 'text' | 'integer' | 'timestamptz'; asc: string; desc: string }> = {
  player: { column: 'username', cast: 'text', asc: 'username ASC, id ASC', desc: 'username DESC, id DESC' },
  city: { column: 'city_name', cast: 'text', asc: 'city_name ASC, id ASC', desc: 'city_name DESC, id DESC' },
  structures: { column: 'structures', cast: 'integer', asc: 'structures ASC, id ASC', desc: 'structures DESC, id DESC' },
  citizens: { column: 'citizens', cast: 'integer', asc: 'citizens ASC, id ASC', desc: 'citizens DESC, id DESC' },
  updated: { column: 'updated_at', cast: 'timestamptz', asc: 'updated_at ASC, id ASC', desc: 'updated_at DESC, id DESC' },
};

const COLUMNS = 'id, token_hash, username, city_name, grid, structures, citizens, updated_at';

export function listQueryText(sort: SortKey, dir: 'asc' | 'desc', hasCursor: boolean): string {
  const spec = SORT_SQL[sort];
  const cmp = dir === 'asc' ? '>' : '<';
  const where = hasCursor ? `WHERE (${spec.column}, id) ${cmp} ($1::${spec.cast}, $2::text)` : '';
  const limit = hasCursor ? '$3' : '$1';
  return `SELECT ${COLUMNS} FROM shared_cities ${where} ORDER BY ${spec[dir]} LIMIT ${limit}`.replace(/\s+/g, ' ').trim();
}

export function memoryCityStore(): CityStore {
  const rows: SharedCityRecord[] = [];
  const hits = new Map<string, number>();
  return {
    async ping() { return true; },
    async findByTokenHash(hash) { return rows.find(row => row.tokenHash === hash) ?? null; },
    async findById(id) { return rows.find(row => row.id === id) ?? null; },
    async insert(row) {
      if (rows.some(existing => existing.id === row.id || existing.tokenHash === row.tokenHash)) {
        throw new Error('conflict');
      }
      rows.push({ ...row, grid: structuredClone(row.grid) });
    },
    async update(row) {
      const index = rows.findIndex(existing => existing.tokenHash === row.tokenHash);
      if (index < 0) throw new Error('missing');
      rows[index] = { ...row, grid: structuredClone(row.grid) };
    },
    async list(query) { return pageSharedCities(rows, query); },
    async hitRate(subject, limit, nowMs) {
      const key = `${subject}:${rateWindow(nowMs)}`;
      const next = (hits.get(key) ?? 0) + 1;
      hits.set(key, next);
      return { allowed: next <= limit, hits: next };
    },
  };
}

type Sql = ReturnType<typeof neon>;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function asRows(result: unknown): Record<string, unknown>[] {
  return Array.isArray(result) ? result as Record<string, unknown>[] : [];
}

function mapRow(row: Record<string, unknown>): SharedCityRecord {
  const grid = typeof row.grid === 'string' ? JSON.parse(row.grid) as CityState : row.grid as CityState;
  return {
    id: String(row.id),
    tokenHash: String(row.token_hash),
    username: String(row.username),
    cityName: String(row.city_name),
    grid,
    structures: Number(row.structures),
    citizens: Number(row.citizens),
    updatedAt: asIso(row.updated_at),
  };
}

export function neonCityStore(connectionString: string): CityStore {
  const sql: Sql = neon(connectionString);
  const ensure = schemaOnce(() => applyCityShareSchema(statement => sql.query(statement)));
  return {
    async ping() {
      await ensure();
      const rows = asRows(await sql`SELECT 1 AS ok`);
      return rows.length === 1;
    },
    async findByTokenHash(hash) {
      await ensure();
      const rows = asRows(await sql`SELECT id, token_hash, username, city_name, grid, structures, citizens, updated_at FROM shared_cities WHERE token_hash = ${hash} LIMIT 1`);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async findById(id) {
      await ensure();
      const rows = asRows(await sql`SELECT id, token_hash, username, city_name, grid, structures, citizens, updated_at FROM shared_cities WHERE id = ${id} LIMIT 1`);
      const row = rows[0];
      return row ? mapRow(row) : null;
    },
    async insert(row) {
      await ensure();
      await sql`INSERT INTO shared_cities (id, token_hash, username, city_name, grid, structures, citizens, updated_at)
        VALUES (${row.id}, ${row.tokenHash}, ${row.username}, ${row.cityName}, ${JSON.stringify(row.grid)}::jsonb, ${row.structures}, ${row.citizens}, ${row.updatedAt}::timestamptz)`;
    },
    async update(row) {
      await ensure();
      await sql`UPDATE shared_cities
        SET username = ${row.username}, city_name = ${row.cityName}, grid = ${JSON.stringify(row.grid)}::jsonb,
            structures = ${row.structures}, citizens = ${row.citizens}, updated_at = ${row.updatedAt}::timestamptz
        WHERE token_hash = ${row.tokenHash}`;
    },
    async list(query) {
      await ensure();
      const cursor = query.cursor ? decodeListCursor(query) : null;
      const text = listQueryText(query.sort, query.dir, !!cursor);
      const params = cursor ? [cursor.value, cursor.id, query.limit + 1] : [query.limit + 1];
      const fetched = asRows(await sql.query(text, params));
      const mapped = fetched.map(mapRow);
      const page = mapped.slice(0, query.limit);
      const last = page[page.length - 1];
      const nextCursor = mapped.length > query.limit && last
        ? encodeListCursor(query, last)
        : null;
      return { rows: page, nextCursor };
    },
    async hitRate(subject, limit, nowMs) {
      await ensure();
      const window = rateWindow(nowMs);
      await sql`DELETE FROM share_rate_buckets WHERE window_start < ${window - 2}`;
      const rows = asRows(await sql`INSERT INTO share_rate_buckets (subject, window_start, hits)
        VALUES (${subject}, ${window}, 1)
        ON CONFLICT (subject, window_start)
        DO UPDATE SET hits = share_rate_buckets.hits + 1
        RETURNING hits`);
      const hits = Number(rows[0]?.hits ?? limit + 1);
      return { allowed: hits <= limit, hits };
    },
  };
}

function decodeListCursor(query: ListQuery): { value: string | number; id: string } | null {
  const decoded = decodeCursor(query.cursor);
  if (!decoded || decoded.sort !== query.sort || decoded.dir !== query.dir) return null;
  return { value: decoded.value, id: decoded.id };
}

function encodeListCursor(query: ListQuery, row: SharedCityRecord): string {
  const value = query.sort === 'player' ? row.username
    : query.sort === 'city' ? row.cityName
      : query.sort === 'structures' ? row.structures
        : query.sort === 'citizens' ? row.citizens
          : row.updatedAt;
  return encodeCursor({ sort: query.sort, dir: query.dir, value, id: row.id });
}
