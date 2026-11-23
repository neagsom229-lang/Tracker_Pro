// scripts/proofs/dbg6.js — "register then immediately login, mixed case, 20x loop".
import './dev-db-guard.mjs';

async function request(method, path, body) {
  const res = await fetch(`http://localhost:4000${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

const N = 20;
const results = [];
for (let i = 0; i < N; i++) {
  const local = `loop${i}@example.com`;
  const reg = await request('POST', '/api/auth/register', { email: local, password: 'loop-pass-12345', displayName: 'Loop User' });
  if (!reg.data?.ok) { results.push({ i, register: reg.status, login: null, registerError: reg.data?.error || reg.data?.message }); continue; }
  const mixed = local.split('@')[0].toUpperCase() + '@' + local.split('@')[1];
  const log = await request('POST', '/api/auth/login', { email: mixed, password: 'loop-pass-12345' });
  results.push({ i, register: reg.status, login: log.status, loginOk: !!log.data?.ok });
}
const loginsOk = results.filter((r) => r.login === 200).length;
const loginsNon200 = results.filter((r) => r.login !== 200 && r.login !== null);
console.log(JSON.stringify({ runs: N, login200: loginsOk, loginOther: loginsNon200.length, results }, null, 2));
