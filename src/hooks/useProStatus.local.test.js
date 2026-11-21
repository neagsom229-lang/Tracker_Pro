// Local-branch tests of useProStatus — against the real Express app and real
// HTTP (startTestApp on tracker_db_test); nothing is mocked. Free user:
// no subscription; users.is_pro = true: active with provider "local".
// @vitest-environment jsdom
/* global vi, afterAll, describe, it, expect */
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { startTestApp } from '../../server/test-app.mjs';

const { server, base, register, jar } = await startTestApp();

// Jar-wrapped fetch so that api.* calls (which use credentials: 'include')
// go through the cookie jar, exactly as the real browser does.
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

vi.stubEnv('VITE_API_BASE', `${base}/api`);
vi.stubEnv('VITE_DATA_BACKEND', 'local');

const { api } = await import('../api/client');
const { useProStatus } = await import('./useProStatus');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted = [];
async function mount() {
  const probe = {};
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  function Probe() {
    Object.assign(probe, useProStatus());
    return null;
  }
  await act(async () => {
    root.render(React.createElement(Probe));
    await new Promise((r) => setTimeout(r, 30));
  });
  mounted.push({ root, container });
  return probe;
}

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

afterEach(async () => {
  for (const view of mounted) {
    await act(async () => {
      view.root.unmount();
    });
    view.container.remove();
  }
  mounted.length = 0;
  jar.clear();
});

afterAll(async () => {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: 'tracker_db_test', user: process.env.PGUSER, password: process.env.PGPASSWORD });
    await pool.query('DELETE FROM users');
    await pool.end();
  } catch { /* cleanup errors suppressed — teardown must not mask test results */ }
});

describe('useProStatus — local mode', () => {
  it 'free user isPro false', async () => {
    await register('pro-free@example.com');
    const probe = await mount();
    expect(await waitFor(() => probe.isPro === false)).toBe(true);
    expect(probe.subscription).toBe(null);
  }

  it 'users.is_pro = true: subscription active, payment_provider "local"', async () => {
    const { id } = await register('pro-user@example.com');
    // Flip the real flag in the DB — the hook reads it via the real API.
    const { Pool } = await import('pg');
    const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
    await pool.query('UPDATE users SET is_pro = true WHERE id = $1', [id]);
    await pool.end();
    const probe = await mount();
    await act(async () => { await probe.refresh(); });
    expect(await waitFor(() => probe.isPro === true)).toBe(true);
    expect(probe.subscription?.status).toBe('active');
    expect(probe.subscription?.payment_provider).toBe('local');
    expect(probe.isPendingReview).toBe(false);
  }
});