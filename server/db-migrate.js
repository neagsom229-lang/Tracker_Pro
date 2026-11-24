import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pool from './db.js';

// Migration runner. Applies server/migrations/*.sql in name order, records
// each applied migration in schema_migrations, and stops on the first error.
await pool.query(
  'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, ran_at TIMESTAMPTZ NOT NULL DEFAULT now())'
);

const { rows: appliedRows } = await pool.query(
  'SELECT name FROM schema_migrations ORDER BY name'
);
const applied = new Set(appliedRows.map((r) => r.name));

const dir = join(process.cwd(), 'server', 'migrations');
const files = readdirSync(dir).filter((f) => /\.sql$/.test(f)).sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log('skip (already applied):', file);
    continue;
  }
  const sql = readFileSync(join(dir, file), 'utf8');
  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    await pool.query('COMMIT');
    console.log('applied:', file);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('FAILED:', file, '-', err.message);
    process.exit(1);
  }
}

console.log('migrations: all up to date.');
await pool.end();
