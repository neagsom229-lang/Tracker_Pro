import { Pool, types } from 'pg';

// NUMERIC (oid 1700) — parse as JS number, not string, so the API returns
// money as JSON numbers without the app converting on every read.
types.setTypeParser(1700, (value) => Number(value));
// DATE (oid 1082) — keep the raw 'YYYY-MM-DD' string shape (pg's default is
// a Date object; the app expects Supabase's string semantics).
types.setTypeParser(1082, (value) => value);

// Local Postgres pool — target: tracker_db on localhost:5432.
//
// Credentials come only from the environment (loaded from .env via
// `node --env-file=.env`); any missing PG* variable aborts with a clear
// message instead of connecting with a silently empty password.
const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable ${name}. Set it in .env (see .env.example).`);
  }
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  connectionTimeoutMillis: 5000,
});

export default pool;
