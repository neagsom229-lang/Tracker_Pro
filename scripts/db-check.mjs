import { Pool } from 'pg';
import { loadDotenv } from '../server/test-app.mjs';

const env = loadDotenv();
const p = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
const { rows } = await p.query("SELECT email, is_pro, created_at FROM users WHERE email LIKE 'smoke-%' ORDER BY created_at DESC LIMIT 3");
console.log(JSON.stringify(rows, null, 1));
await p.end();
