// scripts/show-set-cookie.mjs — logs in and shows the Set-Cookie header(s)
// from the login response (the httpOnly session cookie the browser relies on).
const BASE = 'http://localhost:4000';
const email = `setcookie-${Date.now()}@example.com`;
const password = 'show-cookie-pass-1234';

const reg = await fetch(`${BASE}/api/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, displayName: 'Set-Cookie Proof' }),
});
const regCookies = reg.headers.getSetCookie?.() ?? [];
console.log('register:', reg.status, `(${regCookies.length} Set-Cookie header${regCookies.length === 1 ? '' : 's'})`);

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
console.log(`login: ${login.status}`);
for (const c of login.headers.getSetCookie?.() ?? []) {
  console.log('Set-Cookie:', c);
}
