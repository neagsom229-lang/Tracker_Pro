import { Pool } from 'pg';
import { loadDotenv } from '../server/test-app.mjs';

const env = loadDotenv();
const p = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
const { rows } = await p.query('SELECT current_user, rolsuper AS usesuper, rolcreatedb FROM pg_roles WHERE rolname = current_user');
console.log('role:', JSON.stringify(rows));
await p.end();
