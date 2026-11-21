// @vitest-environment node
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { startTestApp } from './test-app.mjs';

const { app, server } = await startTestApp();

// Clean up any leftover test users after all test files finish.
// We do this per-file because vitest runs test files sequentially.
afterAll(async () => {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT), database: 'tracker_db_test', user: process.env.PGUSER, password: process.env.PGPASSWORD });
    await pool.query('DELETE FROM users');
    await pool.end();
  } catch {}
  await new Promise((r) => server.close(r));
});

function cookieOf(res) {
  return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
}

async function register(email, password = 'test-password-1234', displayName) {
  return request(app).post('/api/auth/register').send({ email, password, displayName });
}

describe('local API (supertest, tracker_db_test)', () => {
  it('GET /api/auth/me unauthenticated → 200 {ok:false,user:null}', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: false, user: null });
  });

  it('register: 200 (sets the session cookie); duplicate → 409', async () => {
    const email = `apitest1-${Date.now()}@example.com`;
    const res = await register(email, 'test-password-1234', 'Api Test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(cookieOf(res)).toContain('tracker_session=');
    const dup = await register(email);
    expect(dup.status).toBe(409);
  });

  it('register with mixed-case email → stored lowercase', async () => {
    const res = await register(`APITEST2-${Date.now()}@EXAMPLE.COM`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(res.body.email.toLowerCase());
  });

  it('login: 200; wrong password → 401', async () => {
    const email = `apitest3-${Date.now()}@example.com`;
    await register(email);
    const ok = await request(app).post('/api/auth/login').send({ email, password: 'test-password-1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    const bad = await request(app).post('/api/auth/login').send({ email, password: 'nope' });
    expect(bad.status).toBe(401);
  });

  it('transactions: add, list, update, delete (authed)', async () => {
    const email = `apitest-tx-${Date.now()}@example.com`;
    const reg = await register(email);
    const cookie = cookieOf(reg);
    const add = await request(app).post('/api/transactions').set('Cookie', cookie).send({ description: 'Api Tx', amount: -12.34, category: 'food', date: '2026-01-15' });
    expect(add.status).toBe(200);
    const txId = add.body.id;
    const list = await request(app).get('/api/transactions').set('Cookie', cookie);
    expect(list.body.some((t) => t.id === txId)).toBe(true);
    const upd = await request(app).put(`/api/transactions/${txId}`).set('Cookie', cookie).send({ description: 'Api Tx v2' });
    expect(upd.status).toBe(200);
    expect(upd.body.description).toBe('Api Tx v2');
    const del = await request(app).delete(`/api/transactions/${txId}`).set('Cookie', cookie);
    expect(del.status).toBe(200);
  });

  it 'isolation user B tx 404', async () => {
    const a = await register(`apitest-isoA-${Date.now()}@example.com`);
    const b = await register(`apitest-isoB-${Date.now()}@example.com`);
    const add = await request(app).post('/api/transactions').set('Cookie', cookieOf(a)).send({ description: 'A Tx', amount: -5, category: 'food', date: '2026-01-15' });
    expect(add.status).toBe(200);
    const txId = add.body.id;
    expect((await request(app).get(`/api/transactions/${txId}`).set('Cookie', cookieOf(b))).status).toBe(404);
    expect((await request(app).put(`/api/transactions/${txId}`).set('Cookie', cookieOf(b)).send({ description: 'Hacked' })).status).toBe(404);
    expect((await request(app).delete(`/api/transactions/${txId}`).set('Cookie', cookieOf(b))).status).toBe(404);
  }

  it 'isolation: user B cannot DELETE user A\'s budget (404); B\'s list is empty', async () => {
    const a = await register(`apitest-isoA2-${Date.now()}@example.com`);
    const b = await register(`apitest-isoB2-${Date.now()}@example.com`);
    const up = await request(app).post('/api/budgets').set('Cookie', cookieOf(a)).send({ category: 'food', monthly_limit: 100 });
    expect(up.status).toBe(200);
    expect((await request(app).delete('/api/budgets/food').set('Cookie', cookieOf(b))).status).toBe(404);
    const listB = await request(app).get('/api/budgets').set('Cookie', cookieOf(b));
    expect(listB.body.food).toBeUndefined();
  }

  it 'budgets: upsert, list, delete', async () => {
    const reg = await register(`apitest-budgets-${Date.now()}@example.com`);
    const cookie = cookieOf(reg);
    const up = await request(app).post('/api/budgets').set('Cookie', cookie).send({ category: 'food', monthly_limit: 100 });
    expect(up.status).toBe(200);
    const list = await request(app).get('/api/budgets').set('Cookie', cookie);
    expect(list.body.food).toBe(100);
    const del = await request(app).delete('/api/budgets/food').set('Cookie', cookie);
    expect(del.status).toBe(200);
  }

  it 'recurring: add, list, delete', async () => {
    const reg = await register(`apitest-recurring-${Date.now()}@example.com`);
    const cookie = cookieOf(reg);
    const add = await request(app).post('/api/recurring').set('Cookie', cookie).send({ description: 'Api Recurring', amount: -5, category: 'subscriptions', frequency: 'monthly', nextRunDate: '2026-12-01' });
    expect(add.status).toBe(200);
    const list = await request(app).get('/api/recurring').set('Cookie', cookie);
    expect(list.body.some((r) => r.id === add.body.id)).toBe(true);
  }

  it 'limiter scope: hammering GET /api/auth/me is not limited by the strict login limiter (general limiter 300)', async () => {
    const statuses = [];
    for (let i = 0; i < 30; i++) statuses.push((await request(app).get('/api/auth/me')).status);
    expect(statuses.every((s) => s === 200)).toBe(true);
  }

  it 'limiter scope: 16 bad logins → the 16th → 429', async () => {
    const statuses = [];
    for (let i = 0; i < 16; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: `bad-${Date.now()}-${i}@example.com`, password: 'nope' });
      statuses.push(res.status);
    }
    expect(statuses[15]).toBe(429);
  }

  it 'phase-1 surfaces: notifications/goals/debts/assets/net_worth_history → [], parse_corrections → {}', async () => {
    const reg = await register(`apitest-empty-${Date.now()}@example.com`);
    const cookie = cookieOf(reg);
    for (const path of ['/api/notifications', '/api/goals', '/api/debts', '/api/assets', '/api/net_worth_history']) {
      const res = await request(app).get(path).set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    }
    const corrections = await request(app).get('/api/parse_corrections').set('Cookie', cookie);
    expect(corrections.status).toBe(200);
    expect(corrections.body).toEqual({});
  });
});