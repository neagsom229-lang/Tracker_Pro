import pool from './db.js';

// Minimal live check against tracker_db. Prints the server version, the
// current database, and the table list from information_schema — enough to
// prove the app is pointed at a real PostgreSQL server.
const { rows: ver } = await pool.query(
  'SELECT version() AS version, current_database() AS database'
);
const { rows: tables } = await pool.query(
  "SELECT table_schema || '.' || table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
);

console.log('server version  :', ver[0]?.version ?? '(none)');
console.log('current database:', ver[0]?.database ?? '(none)');
console.log('public tables   :', tables.map((t) => t.name).join(', ') || '(none)');

await pool.end();
