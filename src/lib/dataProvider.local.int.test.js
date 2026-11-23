// Local-branch tests of dataProvider — against the real Express app and real
// HTTP (startTestApp on tracker_db_test); nothing is mocked.
// @vitest-environment node
import '../../server/setup-database-guard.js'; // first: refuse a non-*_test PGDATABASE before connecting
import { describe, it, expect, afterAll, vi } from 'vitest';
import { startTestApp } from '../../server/test-app.mjs';

const { server, base, register, jar } = await startTestApp();

vi.stubEnv('VITE_API_BASE', `${base}/api`);
vi.stubEnv('VITE_DATA_BACKEND', 'local');

const { api } = await import('../api/client');
const { dataProvider } = await import('../lib/dataProvider');

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

describe('dataProvider — local mode', () => {
  it('getTransactions empty added', async () => {
    const reg = await register('dp-tx@example.com');
    const id = reg.body.id;
    expect(await dataProvider.getTransactions(id)).toEqual([]);
    const row = await api.transactions.add({ description: 'DP Tx', amount: -3.21, category: 'food', date: '2026-01-15' });
    const list = await dataProvider.getTransactions(id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ description: 'DP Tx', amount: -3.21, category: 'food', date: '2026-01-15' });
    await api.transactions.remove(row.id);
  });

  it('updateTransaction + deleteTransaction via dataProvider', async () => {
    const reg = await register('dp-tx2@example.com');
    const id = reg.body.id;
    const row = await api.transactions.add({ description: 'DP Tx2', amount: -1, category: 'food', date: '2026-01-16' });
    const updated = await dataProvider.updateTransaction(row.id, { description: 'DP Tx2 v2' });
    expect(updated.description).toBe('DP Tx2 v2');
    expect(await dataProvider.deleteTransaction(row.id)).toBe(row.id);
    expect(await dataProvider.getTransactions(id)).toEqual([]);
  });

  it('getBudgets/setBudget/removeBudget via dataProvider', async () => {
    const reg = await register('dp-budgets@example.com');
    const id = reg.body.id;
    expect(await dataProvider.getBudgets(id)).toEqual({});
    await dataProvider.setBudget(id, 'food', 200);
    expect(await dataProvider.getBudgets(id)).toEqual({ food: 200 });
    await dataProvider.removeBudget(id, 'food');
    expect(await dataProvider.getBudgets(id)).toEqual({});
  });

  it('getProfile returns the account-level profile', async () => {
    await register('dp-profile@example.com', 'test-password-1234', 'DP Person');
    const profile = await dataProvider.getProfile('dp-profile@example.com');
    expect(profile).toMatchObject({ displayName: 'DP Person', isAdmin: false });
    expect(profile.email).toBe('dp-profile@example.com');
  });

  it('setCurrency updates the profile currency', async () => {
    const reg = await register('dp-currency@example.com');
    const id = reg.body.id;
    await dataProvider.setCurrency(id, 'JPY');
    expect((await dataProvider.getProfile(id)).currency).toBe('JPY');
  });
});
