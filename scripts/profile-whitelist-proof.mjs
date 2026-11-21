// scripts/profile-whitelist-proof.mjs — confirms PUT /api/profile whitelists
// display_name and currency only: sending isPro/isAdmin in the body must not
// change anything, shown via the SELECT after. Cleans up the proof user.
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';

const BASE = 'http://localhost:4000';

function parseDotenv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = parseDotenv(readFileSync('.env', 'utf8'));

const email = `whitelist-${Date.now()}@example.com`;
const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'security-pass-1234', displayName: 'Original Name' }),
});
console.log('register:', reg.status);
const cookie = (reg.headers.getSetCookie?.() ?? [])[0].split(';')[0];

const put = await fetch(`${BASE}/api/profile`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ display_name: 'Whitelist Proof', currency: 'EUR', isPro: true, isAdmin: true }),
});
console.log('PUT /api/profile {display_name: "Whitelist Proof", currency: "EUR", isPro: true, isAdmin: true} →', put.status);

const pool = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
const { rows } = await pool.query(
  `SELECT p.display_name AS display_name, p.currency AS currency, u.is_pro AS is_pro, u.is_admin AS is_admin
     FROM profiles p JOIN users u ON u.id = p.id WHERE u.email = $1`,
  [email]
);
console.log('SELECT after →', JSON.stringify(rows[0]));
console.log('  (expect display_name="Whitelist Proof", currency="EUR", is_pro=false, is_admin=false)');

// cleanup
await pool.query('DELETE FROM users WHERE email = $1', [email]);
console.log('cleanup: deleted proof user');
await pool.end();
