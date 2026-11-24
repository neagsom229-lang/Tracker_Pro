// scripts/db-reset.mjs — drop the public schema, migrate, seed.
//   npm run db:reset       → dev database (PGDATABASE, must not end in _test)
//   npm run db:reset:test  → test database (TEST_PGDATABASE, must end in _test)
// Refuses unless PGHOST is local and NODE_ENV is not production.
import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const isTest = process.argv.includes('--test');

function readDotenv() {
  const env = {};
  if (!existsSync('.env')) return env; // CI supplies the variables directly
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const fileEnv = readDotenv();
const env = { ...fileEnv, ...process.env };
const host = (env.PGHOST || '').toLowerCase();
const nodeEnv = env.NODE_ENV;
const db = isTest
  ? env.TEST_PGDATABASE ?? 'tracker_db_test'
  : env.PGDATABASE;

if (nodeEnv === 'production') {
  console.error(`[db:reset] REFUSED: NODE_ENV=production — reset is a dev-only operation`);
  process.exit(1);
}
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`[db:reset] REFUSED: PGHOST=${env.PGHOST ?? '(unset)'} — only localhost is allowed`);
  process.exit(1);
}
if (!db) {
  console.error(`[db:reset] REFUSED: no database configured (${isTest ? 'TEST_PGDATABASE' : 'PGDATABASE'})`);
  process.exit(1);
}
if (isTest && !db.endsWith('_test')) {
  console.error(`[db:reset] REFUSED: test database "${db}" must end with "_test"`);
  process.exit(1);
}
if (!isTest && db.endsWith('_test')) {
  console.error(`[db:reset] REFUSED: dev reset targets "${db}", which ends with "_test" — use db:reset:test`);
  process.exit(1);
}

const pool = new Pool({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  database: db,
  user: env.PGUSER,
  password: env.PGPASSWORD,
});
await pool.query('DROP SCHEMA public CASCADE');
await pool.query('CREATE SCHEMA public');
await pool.end();
console.log(`[db:reset] ${db}: schema dropped and recreated`);

const childEnv = { ...env, PGDATABASE: db };
execFileSync(process.execPath, ['server/db-migrate.js'], { env: childEnv, stdio: 'inherit' });
execFileSync(process.execPath, ['server/db-seed.js'], { env: childEnv, stdio: 'inherit' });
console.log(`[db:reset] ${db}: migrated and seeded`);
