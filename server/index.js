import { app } from './app.js';
import pool from './db.js';

// The auth routes mint and verify these tokens — a missing or trivially
// guessable secret is a security hole, and a bad value is a footgun we
// want to fail fast on.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[server] JWT_SECRET is missing or too short — it must be at least 32 characters (see .env.example).');
  process.exit(1);
}

// Warm-up: prove the pool is connected before serving.
const { rows: warmup } = await pool.query('SELECT 1 AS ok');
if (!warmup || warmup[0].ok !== 1) throw new Error('SELECT 1 warm-up failed');

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () =>
  console.log(`[server] listening on :${PORT} (backend=local, db=${process.env.PGDATABASE})`)
);
