import pool from './db.js';

// Dumps the public-schema objects from information_schema — used to prove
// the live tracker_db has the expected tables, columns, FKs and indexes.
const out = [];

const tables = (
  await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  )
).rows.map((t) => t.table_name);

out.push('TABLES: ' + (tables.join(', ') || '(none)'));

for (const table of tables) {
  const cols = (
    await pool.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    )
  ).rows;
  out.push(`\nTABLE ${table}:`);
  for (const c of cols) out.push(`  ${c.column_name}: ${c.data_type} (${c.is_nullable})`);

  const fks = (
    await pool.query(
      `SELECT tc.table_name AS table_name, kcu.column_name,
               ccu.table_name AS foreign_table, rc.delete_rule AS on_delete
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name = $1`,
      [table]
    )
  ).rows;
  for (const f of fks) out.push(`  FK: ${f.table_name}.${f.column_name} -> ${f.foreign_table} ON DELETE ${f.on_delete}`);
}

const checks = (
  await pool.query(
    `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace ORDER BY table_name, conname`
  )
).rows;
out.push('\nCHECK CONSTRAINTS:');
for (const c of checks) out.push(`  ${c.table_name}: ${c.conname} — ${c.def}`);

const udIdx = (
  await pool.query(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef ~* 'user_id' AND indexdef ~* 'date'
      ORDER BY tablename`
  )
).rows;
out.push('\n(user_id, date) INDEXES:');
for (const i of udIdx) out.push(`  ${i.tablename}: ${i.indexname} :: ${i.indexdef}`);

// Case-insensitive email uniqueness (lower(email) unique index)
const emailIdx = (
  await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_email_lower_idx'`
  )
).rows;
out.push('\nEMAIL UNIQUENESS:');
for (const i of emailIdx) out.push(`  ${i.indexdef}`);
if (emailIdx.length === 0) out.push('  (MISSING — users_email_lower_idx not found!)');

// RLS status (expected: none — user_id scoping is enforced by Express)
const rls = (
  await pool.query(
    `SELECT relname FROM pg_class WHERE relrowsecurity = true AND relnamespace = 'public'::regnamespace`
  )
).rows.map((r) => r.relname);
out.push('\nRLS-ENABLED TABLES: ' + (rls.length ? rls.join(', ') : '(none)'));

const userCount = (await pool.query('SELECT count(*)::int AS c FROM users')).rows[0].c;
out.push(`USERS COUNT: ${userCount}`);

console.log(out.join('\n'));
await pool.end();
