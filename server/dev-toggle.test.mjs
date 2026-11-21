// server/dev-toggle.test.mjs — PUT /api/profile/is_pro is mounted only when
// NODE_ENV=development AND ENABLE_DEV_PRO_TOGGLE=true; a test of both states.
// Uses real Express app on a random port against tracker_db_test.
import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { Pool } from 'pg';
import { loadDotenv } from './test-app.mjs';

const env = loadDotenv();
const children = [];

function spawnServer({ port, nodeEnv, toggle }) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...env,
      PGDATABASE: 'tracker_db_test',
      PORT: String(port),
      NODE_ENV: nodeEnv,
      ENABLE_DEV_PRO_TOGGLE: toggle ? 'true' : '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return child;
}

async function waitForHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server on :${port} did not become healthy`);
}

async function register(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test-password-1234' }),
  });
  return { status: res.status, email, setCookie: (res.headers.getSetCookie?.() ?? [])[0] ?? '' };
}

async function putIsPro(port, setCookie) {
  const res = await fetch(`http://127.0.0.1:${port}/api/profile/is_pro`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: setCookie.split(';')[0] },
    body: JSON.stringify({ enabled: true }),
  });
  return { status: res.status };
}

async function userIsPro(email) {
  const pool = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: 'tracker_db_test', user: env.PGUSER, password: env.PGPASSWORD });
  const { rows } = await pool.query('SELECT is_pro FROM users WHERE lower(email) = lower($1)', [email]);
  await pool.end();
  return rows[0]?.is_pro;
}

afterAll(() => {
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
    }
  }
});

describe('PUT /api/profile/is_pro dev toggle', () => {
  it 'dev toggle PUT is_pro', async () => {
    const email = `devtoggleA-${Date.now()}@example.com`;
    spawnServer({ port: 4681, nodeEnv: 'development', toggle: true });
    await waitForHealth(4681);
    const reg = await register(4681, email);
    expect(reg.status).toBe(200);
    const put = await putIsPro(4681, reg.setCookie);
    expect(put.status).toBe(200);
    expect(await userIsPro(email)).toBe(true);
  });

  it 'state B: NODE_ENV=development, toggle flag off → PUT → 404, users.is_pro unchanged', async () => {
    const email = `devtoggleB-${Date.now()}@example.com`;
    spawnServer({ port: 4682, nodeEnv: 'development', toggle: false });
    await waitForHealth(4682);
    const reg = await register(4682, email);
    expect(reg.status).toBe(200);
    const put = await putIsPro(4682, reg.setCookie);
    expect(put.status).toBe(404);
  });

  it 'state C: NODE_ENV=production + toggle on → PUT → 404', async () => {
    const email = `devtoggleC-${Date.now()}@example.com`;
    spawnServer({ port: 4683, nodeEnv: 'production', toggle: true });
    await waitForHealth(4683);
    const reg = await register(4683, email);
    expect(reg.status).toBe(200);
    const put = await putIsPro(4683, reg.setCookie);
    expect(put.status).toBe(404);
  });

  it 'state D: NODE_ENV=production + toggle off → PUT → 404', async () => {
    const email = `devtoggleD-${Date.now()}@example.com`;
    spawnServer({ port: 4684, nodeEnv: 'production', toggle: false });
    await waitForHealth(4684);
    const reg = await register(4684, email);
    expect(reg.status).toBe(200);
    const put = await putIsPro(4684, reg.setCookie);
    expect(put.status).toBe(404);
  });
});