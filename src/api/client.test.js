// @vitest-environment node
import '../../server/setup-database-guard.js'; // first: refuse a non-*_test PGDATABASE before connecting
import { describe, it, expect, afterAll, vi } from 'vitest';
import { startTestApp } from '../../server/test-app.mjs';

const { server, base, jar } = await startTestApp();

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

afterAll(async () => {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: 'tracker_db_test', user: process.env.PGUSER, password: process.env.PGPASSWORD });
    await pool.query('DELETE FROM users');
    await pool.end();
  } catch { /* cleanup errors suppressed — teardown must not mask test results */ }
  jar.clear();
  await new Promise((r) => server.close(r));
});

describe('api client (local backend, real HTTP against a test server)', () => {
  it('auth ok 409', async () => {
    const res = await api.auth.register({ email: 'clienttest1@example.com', password: 'test-password-1234', displayName: 'Client Test' });
    expect(res.ok).toBe(true);
    expect(res.email).toBe('clienttest1@example.com');
    expect(typeof res.id).toBe('string');
    await expect(api.auth.register({ email: 'clienttest1@example.com', password: 'test-password-1234' })).rejects.toMatchObject({ status: 409 });
  });

  it('auth.login → {ok:true, id}; auth.me() → the user (session in the jar)', async () => {
    const logged = await api.auth.login({ email: 'clienttest1@example.com', password: 'test-password-1234' });
    expect(logged.ok).toBe(true);
    expect(jar.get('tracker_session')).toBeTruthy();
    const me = await api.auth.me();
    expect(me.email).toBe('clienttest1@example.com');
    expect(typeof me.id).toBe('string');
  });

  it('transactions: add → get → update → delete', async () => {
    const row = await api.transactions.add({ description: 'Client Tx', amount: -7.5, category: 'food', date: '2026-01-15' });
    expect(row.description).toBe('Client Tx');
    expect(row.amount).toBe(-7.5);
    const list = await api.transactions.get();
    expect(list.some((t) => t.id === row.id)).toBe(true);
    const upd = await api.transactions.update(row.id, { description: 'Client Tx v2' });
    expect(upd.description).toBe('Client Tx v2');
    await api.transactions.remove(row.id);
    const after = await api.transactions.get();
    expect(after.some((t) => t.id === row.id)).toBe(false);
  });

  it('budgets: get/upsert/remove', async () => {
    expect(await api.budgets.get()).toEqual({});
    await api.budgets.upsert('food', 100);
    expect(await api.budgets.get()).toEqual({ food: 100 });
    await api.budgets.remove('food');
    expect(await api.budgets.get()).toEqual({});
  });

  it('profile: get (isPro false) + setProToggle (dev toggle)', async () => {
    const profile = await api.profile.get();
    expect(profile.isPro).toBe(false);
    const toggle = await api.profile.setProToggle(true);
    expect(toggle.ok).toBe(true);
    const profile2 = await api.profile.get();
    expect(profile2.isPro).toBe(true);
  });

  it('phase-1: notifications/assets/netWorth/parseCorrections empty', async () => {
    expect(await api.notifications.get()).toEqual([]);
    expect(await api.assets.get()).toEqual([]);
    expect(await api.netWorth.get()).toEqual([]);
    expect(await api.parseCorrections.get()).toEqual({});
  });
});
