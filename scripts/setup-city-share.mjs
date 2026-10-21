/**
 * Optional manual apply of db/city_share.sql.
 * The API already runs these CREATE TABLE/INDEX IF NOT EXISTS statements
 * on its first request, so this command is not required after deploy.
 *
 *   pnpm city:setup
 *
 * Reads DATABASE_URL, then POSTGRES_URL, from the environment or .env.local.
 * The connection string is never printed. DATABASE_URL_UNPOOLED is not used.
 */
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key) || process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
if (!url || !/^postgres(ql)?:\/\//i.test(url)) {
  console.error('Set DATABASE_URL (the pooled Neon string) to apply db/city_share.sql by hand.');
  console.error('Deployed API routes create the same tables on first use, so this command is optional.');
  process.exit(1);
}

const text = readFileSync(new URL('../db/city_share.sql', import.meta.url), 'utf8');
const statements = text
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.trim())
  .filter(Boolean);

const sql = neon(url);
for (const statement of statements) {
  await sql.query(statement);
}
console.log(`Applied ${statements.length} statements. Shared city tables are ready.`);
