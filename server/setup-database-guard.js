import { Pool } from 'pg';

export default async function () {
  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    database: process.env.TEST_PGDATABASE ?? 'tracker_db_test',
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const { rows } = await pool.query('SELECT current_database()');
  const dbName = rows[0].current_database;
  if (!dbName.endsWith('_test')) {
    console.error(`[setup-database-guard] FATAL: current database is "${dbName}" — must end with "_test".`);
    process.exit(1);
  }
  await pool.end();
};