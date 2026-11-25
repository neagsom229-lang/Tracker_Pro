// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { loadDotenv } from './test-app.mjs';

const env = { ...loadDotenv(), ...process.env };
const db = env.TEST_PGDATABASE ?? 'tracker_db_test';
if (!db.endsWith('_test')) throw new Error(`Refusing to run against non-test DB: ${db}`);

const pool = new Pool({
  host: env.PGHOST, port: Number(env.PGPORT), database: db,
  user: env.PGUSER, password: env.PGPASSWORD,
});

const migrationSql = readFileSync(new URL('../supabase/migrations/20261125000100_guard_manual_payment_fields.sql', import.meta.url), 'utf8');
const USER_A = '00000000-0000-0000-0000-0000000000a1';
const USER_B = '00000000-0000-0000-0000-0000000000b2';
const ADMIN = '00000000-0000-0000-0000-0000000000ad';

async function withTx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await fn(c);
    await c.query('ROLLBACK');
    return result;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function asUser(c, userId, role = 'authenticated') {
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [userId, role]);
}

beforeAll(async () => {
  const c = await pool.connect();
  try {
    await c.query(`CREATE SCHEMA IF NOT EXISTS auth`);
    await c.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$`);
    await c.query(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$`);
    await c.query(`CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key)`);
    await c.query(`INSERT INTO auth.users (id) VALUES ($1),($2),($3) ON CONFLICT DO NOTHING`, [USER_A, USER_B, ADMIN]);
    await c.query(`INSERT INTO public.users (id, email, password_hash) VALUES ($1,'a@test.local','x'),($2,'b@test.local','x'),($3,'admin@test.local','x') ON CONFLICT (id) DO NOTHING`, [USER_A, USER_B, ADMIN]);
    await c.query(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean not null default false`);
    await c.query(`INSERT INTO public.profiles (id) VALUES ($1),($2),($3) ON CONFLICT (id) DO NOTHING`, [USER_A, USER_B, ADMIN]);
    await c.query(`UPDATE public.profiles SET is_admin = CASE id WHEN $3::uuid THEN true ELSE false END WHERE id IN ($1,$2,$3)`, [USER_A, USER_B, ADMIN]);
    await c.query(`DROP TABLE IF EXISTS public.manual_payments CASCADE`);
    await c.query(`
      CREATE TABLE public.manual_payments (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users (id) on delete cascade,
        amount numeric(10,2) not null,
        currency text not null default 'USD',
        khqr_md5 text,
        status text not null default 'pending' check (status in ('pending','submitted','approved','rejected')),
        claimed_transaction_ref text,
        screenshot_path text,
        submitted_at timestamptz,
        reviewed_at timestamptz,
        reviewed_by uuid references auth.users (id),
        created_at timestamptz not null default now()
      )`);
    await c.query(`ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY`);
    await c.query(`ALTER TABLE public.manual_payments FORCE ROW LEVEL SECURITY`);
    await c.query(`CREATE POLICY "Users can view own manual payments" ON public.manual_payments FOR SELECT USING (auth.uid() = user_id)`);
    await c.query(`CREATE POLICY "Admins can view all manual payments" ON public.manual_payments FOR SELECT USING (exists (select 1 from public.profiles where id = auth.uid() and is_admin))`);
    await c.query(`CREATE POLICY "Users can submit proof on own pending payment" ON public.manual_payments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`);
    // Apply the real guard migration
    await c.query(migrationSql);
  } finally {
    await c.query("SET session_replication_role = 'origin'").catch(() => {});
    c.release();
  }
});

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS public.manual_payments CASCADE');
  await pool.end();
});

async function seedPayment(c, overrides = {}) {
  await c.query(`ALTER TABLE public.manual_payments DISABLE ROW LEVEL SECURITY`);
  const row = {
    user_id: USER_A, amount: 4.99, currency: 'USD', status: 'pending',
    khqr_md5: 'md5hash', claimed_transaction_ref: null, screenshot_path: null,
    submitted_at: null, reviewed_by: null, reviewed_at: null, ...overrides,
  };
  const { rows } = await c.query(
    `INSERT INTO public.manual_payments (user_id,amount,currency,status,khqr_md5,claimed_transaction_ref,screenshot_path,submitted_at,reviewed_by,reviewed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [row.user_id,row.amount,row.currency,row.status,row.khqr_md5,row.claimed_transaction_ref,row.screenshot_path,row.submitted_at,row.reviewed_by,row.reviewed_at],
  );
  await c.query(`ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY`);
  await c.query(`ALTER TABLE public.manual_payments FORCE ROW LEVEL SECURITY`);
  return rows[0];
}

async function readPayment(c, id) {
  await c.query(`ALTER TABLE public.manual_payments DISABLE ROW LEVEL SECURITY`);
  const { rows } = await c.query(`SELECT * FROM public.manual_payments WHERE id=$1`, [id]);
  await c.query(`ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY`);
  await c.query(`ALTER TABLE public.manual_payments FORCE ROW LEVEL SECURITY`);
  return rows[0];
}

describe('manual_payments guard trigger', () => {
  it('prevents self-approve', async () => {
    await withTx(async (c) => {
      const p = await seedPayment(c);
      await asUser(c, USER_A);
      await c.query(`UPDATE public.manual_payments SET status='approved' WHERE id=$1`, [p.id]);
      const after = await readPayment(c, p.id);
      expect(after.status).toBe('pending');
    });
  });

  it('reverts amount/currency tamper by owner', async () => {
    await withTx(async (c) => {
      const p = await seedPayment(c);
      await asUser(c, USER_A);
      await c.query(`UPDATE public.manual_payments SET amount=0.01, currency='KHR', reviewed_by=$2 WHERE id=$1`, [p.id, USER_A]);
      const after = await readPayment(c, p.id);
      expect(Number(after.amount)).toBe(4.99);
      expect(after.currency).toBe('USD');
      expect(after.reviewed_by).toBeNull();
    });
  });

  it('blocks edits after submit', async () => {
    await withTx(async (c) => {
      const p = await seedPayment(c, { status: 'submitted', submitted_at: new Date().toISOString(), claimed_transaction_ref: 'REF1' });
      await asUser(c, USER_A);
      await c.query(`UPDATE public.manual_payments SET claimed_transaction_ref='HACK', amount=0.01, status='approved' WHERE id=$1`, [p.id]);
      const after = await readPayment(c, p.id);
      expect(after.status).toBe('submitted');
      expect(Number(after.amount)).toBe(4.99);
      expect(after.claimed_transaction_ref).toBe('REF1');
    });
  });

  it("prevents updating another user's row", async () => {
    await withTx(async (c) => {
      const p = await seedPayment(c, { user_id: USER_A });
      await asUser(c, USER_B);
      await c.query(`UPDATE public.manual_payments SET status='submitted', claimed_transaction_ref='X' WHERE id=$1`, [p.id]);
      const after = await readPayment(c, p.id);
      expect(after.status).toBe('pending');
      expect(after.claimed_transaction_ref).toBeNull();
    });
  });
});
