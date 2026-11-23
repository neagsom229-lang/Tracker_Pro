// scripts/proofs/security-proofs.mjs — security proofs for the local API after the
// requireAuth/optionalAuth refactor (dev stack, :4000):
//   1. User B cannot GET/PUT/DELETE user A's transaction id (404 each) and
//      cannot DELETE user A's budget (404). (SQL: A's rows still exist, B has none.)
//   2. register + login 20× with mixed-case email → all 200.
//   3. The server refuses to start with a missing or short JWT_SECRET (exit 1).
import './dev-db-guard.mjs';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { loadDotenv } from '../../server/test-app.mjs';

const env = loadDotenv();
const BASE = 'http://localhost:4000';
const pool = new Pool({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
});

async function registerUser(email) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'security-pass-1234', displayName: email.split('@')[0] }),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, body: await res.json(), cookie };
}

console.log('--- 1. user B cannot touch user A’s rows ---');
const a = await registerUser(`SEC-ISO-${Date.now()}@EXAMPLE.COM`);
const b = await registerUser(`SEC-ISO2-${Date.now()}@EXAMPLE.COM`);
const add = await fetch(`${BASE}/api/transactions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: a.cookie },
  body: JSON.stringify({ description: 'A Tx', amount: -10.5, category: 'food', date: '2026-01-15' }),
});
const txId = (await add.json()).id;
await fetch(`${BASE}/api/budgets`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: a.cookie },
  body: JSON.stringify({ category: 'food', monthly_limit: 100 }),
});

const bGet = await fetch(`${BASE}/api/transactions/${txId}`, { headers: { Cookie: b.cookie } });
const bPut = await fetch(`${BASE}/api/transactions/${txId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Cookie: b.cookie },
  body: JSON.stringify({ description: 'Hacked' }),
});
const bDel = await fetch(`${BASE}/api/transactions/${txId}`, { method: 'DELETE', headers: { Cookie: b.cookie } });
const bList = await fetch(`${BASE}/api/transactions`, { headers: { Cookie: b.cookie } });
const bBudgets = await fetch(`${BASE}/api/budgets`, { headers: { Cookie: b.cookie } });
const bBudgetDel = await fetch(`${BASE}/api/budgets/food`, { method: 'DELETE', headers: { Cookie: b.cookie } });

const bListJson = await bList.json();
const bBudgetsJson = await bBudgets.json();
console.log('user B → GET    /api/transactions/{A.id}:', bGet.status);
console.log('user B → PUT    /api/transactions/{A.id}:', bPut.status);
console.log('user B → DELETE /api/transactions/{A.id}:', bDel.status);
console.log('user B → list contains A’s tx?', bListJson.some((t) => t.id === txId));
console.log('user B → DELETE /api/budgets/food:', bBudgetDel.status);
console.log('user B → GET    /api/budgets:', JSON.stringify(bBudgetsJson));

const { rows: aTx } = await pool.query('SELECT id FROM transactions WHERE id = $1', [txId]);
const { rows: aBudget } = await pool.query('SELECT category FROM budgets WHERE user_id = $1 AND category = $2', [a.body.id, 'food']);
const { rows: bTx } = await pool.query('SELECT id FROM transactions WHERE user_id = $1', [b.body.id]);
const { rows: bBudget } = await pool.query('SELECT category FROM budgets WHERE user_id = $1', [b.body.id]);
console.log('SQL: A’s transaction still exists:', aTx.length === 1);
console.log('SQL: A’s budget still exists:', aBudget.length === 1);
console.log('SQL: B has no transactions:', bTx.length === 0);
console.log('SQL: B has no budgets:', bBudget.length === 0);

console.log('--- 2. mixed-case register+login ×20 ---');
let loopOk = true;
for (let i = 1; i <= 20; i++) {
  const email = `LOOP${i}-${Date.now()}@EXAMPLE.COM`;
  const reg = await registerUser(email);
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.toLowerCase(), password: 'security-pass-1234' }),
  });
  if (reg.status !== 200 || login.status !== 200) {
    console.log(`  iteration ${i}: register=${reg.status} login=${login.status}`);
    loopOk = false;
  }
}
console.log('mixed-case register+login:', loopOk ? 'all 20 → 200' : 'SOME FAILED');

console.log('--- 3. JWT refusal (missing / short JWT_SECRET) ---');
function spawnWithEnv(overrides) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...env, ...overrides },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });
  const exit = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return { exit, stderr: () => stderr };
}
async function expectRefusal(overrides) {
  const child = spawnWithEnv(overrides);
  const code = await Promise.race([child.exit, new Promise((r) => setTimeout(() => r('timeout'), 15000))]);
  const refused = code === 1 && child.stderr().includes('JWT_SECRET is missing or too short');
  console.log(`JWT_SECRET=${JSON.stringify(overrides.JWT_SECRET)} → exit=${code}, refused=${refused}`);
  return refused;
}
const ok1 = await expectRefusal({ JWT_SECRET: '' });
const ok2 = await expectRefusal({ JWT_SECRET: 'short' });
console.log('JWT refusal:', ok1 && ok2 ? 'PASS' : 'FAIL');

await pool.end();
