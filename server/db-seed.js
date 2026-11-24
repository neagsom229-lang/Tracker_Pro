import bcrypt from 'bcryptjs';
import pool from './db.js';

// Seed guard: refuse to run in production, and refuse when PGHOST is not
// explicitly local (defense against pointing the seed at a real server).
const host = (process.env.PGHOST || '').toLowerCase();
if (process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(host)) {
  console.error(
    `db:seed refused: NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}, PGHOST=${process.env.PGHOST ?? '(unset)'} — seeding is a dev-only operation against localhost`
  );
  process.exit(1);
}

// Seeds a clearly-marked demo user with a couple of sample rows so the app
// is demonstrable immediately. Deletable any time.
const SEED_EMAIL = 'demo@example.com';
const SEED_NAME = 'Demo User (test)';

const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [SEED_EMAIL]);
if (existing.rows.length > 0) {
  console.log('seed: demo user already exists (id=' + existing.rows[0].id + ') — nothing to do');
} else {
  // Hashed with bcrypt — the hash value is never printed.
  const hash = await bcrypt.hash('demo-password', 10);
  const ins = await pool.query(
    'INSERT INTO users (email, password_hash, is_admin, is_pro) VALUES ($1, $2, $3, $4) RETURNING id',
    [SEED_EMAIL, hash, false, false]
  );
  const uid = ins.rows[0].id;
  await pool.query(
    "INSERT INTO profiles (id, display_name, currency) VALUES ($1, $2, 'USD')",
    [uid, SEED_NAME]
  );
  await pool.query(
    'INSERT INTO transactions (user_id, description, amount, category, date) VALUES ($1, $2, $3, $4, now()::date)',
    [uid, 'Salary', 2500.0, 'salary']
  );
  await pool.query(
    'INSERT INTO transactions (user_id, description, amount, category, date) VALUES ($1, $2, $3, $4, now()::date)',
    [uid, 'Coffee', -4.5, 'food']
  );
  console.log('seed: created demo user ' + SEED_EMAIL + ' (id=' + uid + ') + 2 sample transactions');
}

await pool.end();
