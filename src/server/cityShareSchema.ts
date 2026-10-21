/**
 * Idempotent shared-city schema. The API runs this on first use.
 * `db/city_share.sql` is the same text; a test keeps the two copies aligned.
 * This module is server-only. Do not import it from client code.
 */
export const CITY_SHARE_SQL = `-- EmojiCB shared cities. Anonymous players, no accounts.
-- The API runs these statements on first use. pnpm city:setup applies the same file.
-- Connection string is server-only (DATABASE_URL). Never prefix it with VITE_.

CREATE TABLE IF NOT EXISTS shared_cities (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  city_name TEXT NOT NULL,
  grid JSONB NOT NULL,
  structures INTEGER NOT NULL CHECK (structures >= 0),
  citizens INTEGER NOT NULL CHECK (citizens >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shared_cities_player_idx ON shared_cities (username, id);
CREATE INDEX IF NOT EXISTS shared_cities_city_idx ON shared_cities (city_name, id);
CREATE INDEX IF NOT EXISTS shared_cities_structures_idx ON shared_cities (structures, id);
CREATE INDEX IF NOT EXISTS shared_cities_citizens_idx ON shared_cities (citizens, id);
CREATE INDEX IF NOT EXISTS shared_cities_updated_idx ON shared_cities (updated_at, id);

CREATE TABLE IF NOT EXISTS share_rate_buckets (
  subject TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  hits INTEGER NOT NULL CHECK (hits >= 0),
  PRIMARY KEY (subject, window_start)
);
`;

export function cityShareStatements(sql = CITY_SHARE_SQL): string[] {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

export async function applyCityShareSchema(query: (statement: string) => Promise<unknown>): Promise<void> {
  for (const statement of cityShareStatements()) await query(statement);
}

/** Run schema setup once per warm server. A failure is not cached, so the next request retries. */
export function schemaOnce(run: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | null = null;
  return () => {
    if (!pending) {
      pending = run().then(() => undefined, (err: unknown) => {
        pending = null;
        throw err;
      });
    }
    return pending;
  };
}
