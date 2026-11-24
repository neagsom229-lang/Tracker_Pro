// server/test-app.mjs — boots the real Express app (server/app.js) on an
// ephemeral port against tracker_db_test, for API tests. Credentials come
// only from .env (parsed here); the DB name is overridden to tracker_db_test.
// A fetch wrapper keeps a session-cookie jar so the real client (src/api)
// can authenticate against the test server.
import { existsSync, readFileSync } from 'node:fs';

// .env is a local convenience only. CI (and any environment that exports the
// variables directly) has no .env file; missing is fine.
export function loadDotenv(path = '.env') {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export async function startTestApp() {
  const env = loadDotenv();
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  // Tests run against the separate tracker_db_test (never the dev DB).
  process.env.PGDATABASE = process.env.TEST_PGDATABASE ?? 'tracker_db_test';
  // The dev-toggle gate is on for tests that need it.
  process.env.NODE_ENV = 'development';
  process.env.ENABLE_DEV_PRO_TOGGLE = 'true';

  // No fallback: the signing secret must be supplied by the environment
  // (.env locally, CI secrets/vars in Actions).
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set in the environment and be at least 32 characters long');
  }

  const { app } = await import('./app.js');
  const server = await new Promise((resolve) => {
    const s = app.listen(0);
    s.on('listening', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Cookie jar + fetch wrapper: the real client sends `credentials: 'include'`
  // requests; Node's fetch has no jar, so this one replays stored cookies and
  // harvests Set-Cookie headers. Tests the real client against the real app.
  const jar = new Map();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    if (jar.size) {
      headers.set('cookie', [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
    }
    const res = await realFetch(url, { ...init, headers });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(';');
      const [k, v] = pair.split('=');
      if (k && v) jar.set(k, v);
    }
    return res;
  };

  const register = async (email, password = 'test-password-1234', displayName) => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });
    return { status: res.status, body: await res.json() };
  };
  const login = async (email, password) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { status: res.status, body: await res.json() };
  };

  return { app, server, base, jar, register, login };
}
