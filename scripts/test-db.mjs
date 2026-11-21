// scripts/test-db.mjs — resets the separate tracker_db_test database and
// applies server/migrations/*.sql to it. The dev DB (tracker_db) is never
// touched — the database name must end with "_test".
import { Pool } from 'pg';
import { execFileSync } from 'node:child_process';
import { loadDotenv } from '../server/test-app.mjs';

// REFUSE unless the target database name ends with "_test" — this script
// drops the whole schema, so pointing it at the dev DB would wipe it.
const db = process.env.TEST_PGDATABASE ?? 'tracker_db_test';
if (!db.endsWith('_test')) {
  console.error(`[test-db] REFUSED: refusing to reset "${db}" — the database must end with "_test" (set TEST_PGDATABASE to a _test name).`);
  process.exit(1);
}

const env = loadDotenv();

// The user created tracker_db_test themselves — connect as the normal role.
const pool = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: db, user: env.PGUSER, password: env.PGPASSWORD });
await pool.query('DROP SCHEMA public CASCADE');
await pool.query('CREATE SCHEMA public');
await pool.end();

execFileSync('node', ['server/db-migrate.js'], {
  cwd: process.cwd(),
  env: { ...env, PGDATABASE: db },
  stdio: 'inherit',
});
console.log(`[test-db] ${db} ready (schema reset, migrations applied).`);
