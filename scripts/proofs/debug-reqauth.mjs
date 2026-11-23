// scripts/proofs/debug-reqauth.mjs — auth/request debugging against the dev stack.
import './dev-db-guard.mjs';

const BASE = 'http://localhost:4000';
const email = `secdbg-${Date.now()}@example.com`;

const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'security-pass-1234', displayName: 'Sec Dbg' }) });
const setCookies = reg.headers.getSetCookie?.() ?? [];
console.log('register:', reg.status, 'setCookies:', setCookies.length);
const text = await reg.text();
console.log('register body:', text.slice(0, 200));
const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');

const add = await fetch(`${BASE}/api/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ description: 'A Tx', amount: -10.5, category: 'food', date: '2026-01-15' }) });
console.log('add:', add.status, await add.text().then((t) => t.slice(0, 200)));
