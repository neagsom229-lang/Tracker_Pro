// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { loadDotenv } from './test-app.mjs';

const env = { ...loadDotenv(), ...process.env };
const db = env.TEST_PGDATABASE ?? 'tracker_db_test';
if (!db.endsWith('_test')) throw new Error(`Refusing non-test DB: ${db}`);

const pool = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: db, user: env.PGUSER, password: env.PGPASSWORD });
const migration006 = readFileSync(new URL('../supabase/migrations/20261124000600_manual_aba_payments.sql', import.meta.url), 'utf8');
const migrationGuard = readFileSync(new URL('../supabase/migrations/20261125000100_guard_manual_payment_fields.sql', import.meta.url), 'utf8');
const migrationExpired = readFileSync(new URL('../supabase/migrations/20261125000300_manual_payments_expired_status.sql', import.meta.url), 'utf8');
const USER_A = '00000000-0000-0000-0000-00000000ca01';
const ADMIN = '00000000-0000-0000-0000-00000000cad1';
let isSuper = false;

function makeSupabaseMock(clientState) {
  const from = (table) => {
    const q = { table, op: 'select', filters: [], order: null, limitN: null, data: null, selectCols: '*' };
    const b = {
      select(cols='*') { q.selectCols = cols; if (q.op !== 'insert' && q.op !== 'update') q.op = 'select'; return b; },
      insert(data) { q.op = 'insert'; q.data = data; return b; },
      update(data) { q.op = 'update'; q.data = data; return b; },
      eq(col, val) { q.filters.push({ col, val }); return b; },
      in() { return b; },
      order(col, { ascending }={}) { q.order = { col, ascending }; return b; },
      limit(n) { q.limitN = n; return b; },
      maybeSingle() { q.single = 'maybe'; return b.exec(); },
      single() { q.single = 'one'; return b.exec(); },
      async exec() {
        const c = clientState.client;
        try {
          if (q.op === 'select') {
            let sql = `SELECT ${q.selectCols} FROM ${q.table}`;
            const params = [];
            if (q.filters.length) { sql += ' WHERE ' + q.filters.map((f,i)=>{ params.push(f.val); return `${f.col}=$${i+1}`; }).join(' AND '); }
            if (q.order) sql += ` ORDER BY ${q.order.col} ${q.order.ascending ? 'ASC':'DESC'}`;
            if (q.limitN) sql += ` LIMIT ${q.limitN}`;
            const { rows } = await c.query(sql, params);
            if (q.single === 'maybe') return { data: rows[0] ?? null, error: null };
            if (q.single === 'one') return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
            return { data: rows, error: null };
          }
          if (q.op === 'update') {
            const keys = Object.keys(q.data);
            const params = [];
            let sql = `UPDATE ${q.table} SET ${keys.map((k,i)=>{ params.push(q.data[k]); return `${k}=$${i+1}`; }).join(', ')}`;
            if (q.filters.length) { sql += ' WHERE ' + q.filters.map((f)=>{ params.push(f.val); return `${f.col}=$${params.length}`; }).join(' AND '); }
            const res = await c.query(sql, params);
            return { data: null, error: null, count: res.rowCount };
          }
        } catch (e) { return { data: null, error: { message: e.message, code: e.code } }; }
        return { data: null, error: { message: 'unsupported op' } };
      },
      then(res, rej) { return b.exec().then(res, rej); },
    };
    return b;
  };
  return {
    from,
    auth: {
      getUser: async () => ({ data: { user: { id: USER_A } } }),
      getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: USER_A } } } }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'https://signed' }, error: null }) }) },
  };
}

beforeAll(async () => {
  const c = await pool.connect();
  try {
    const { rows } = await c.query("SELECT usesuper FROM pg_user WHERE usename = current_user");
    isSuper = !!rows[0]?.usesuper;
    await c.query(`CREATE SCHEMA IF NOT EXISTS auth`);
    await c.query(`CREATE SCHEMA IF NOT EXISTS storage`);
    await c.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$`);
    await c.query(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$`);
    await c.query(`CREATE TABLE IF NOT EXISTS auth.users (id uuid primary key)`);
    await c.query(`CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean default false)`);
    await c.query(`CREATE TABLE IF NOT EXISTS storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now())`);
    await c.query(`CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql AS $$ BEGIN RETURN string_to_array(name, '/'); END; $$`);
    await c.query(`CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN RETURN split_part(name, '.', 2); END; $$`);
    await c.query(`CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN RETURN (string_to_array(name, '/'))[array_length(string_to_array(name, '/'),1)]; END; $$`);
    await c.query(`INSERT INTO auth.users (id) VALUES ($1),($2) ON CONFLICT DO NOTHING`, [USER_A, ADMIN]);
    await c.query(`INSERT INTO public.users (id, email, password_hash) VALUES ($1,'ca1@test.local','x'),($2,'cad1@test.local','x') ON CONFLICT (id) DO NOTHING`, [USER_A, ADMIN]);
    await c.query(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean not null default false`);
    await c.query(`INSERT INTO public.profiles (id) VALUES ($1),($2) ON CONFLICT (id) DO NOTHING`, [USER_A, ADMIN]);
    await c.query(`DROP TABLE IF EXISTS public.manual_payments CASCADE`);
    await c.query(`DROP POLICY IF EXISTS "Users can upload own payment proof" ON storage.objects`);
    await c.query(`DROP POLICY IF EXISTS "Users can view own payment proof" ON storage.objects`);
    await c.query(`DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects`);
    await c.query(`CREATE TABLE IF NOT EXISTS public.subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      stripe_customer_id text not null,
      stripe_subscription_id text not null unique,
      status text not null,
      plan_name text,
      current_period_end timestamptz,
      last_event_ts bigint not null default 0,
      created_at timestamptz not null default now()
    )`);
    // apply real migrations
    await c.query(migration006);
    await c.query(migrationGuard);
    await c.query(migrationExpired);
    if (isSuper) {
      await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$`);
      await c.query(`GRANT USAGE ON SCHEMA public TO authenticated`);
      await c.query(`GRANT SELECT, UPDATE, INSERT ON public.manual_payments TO authenticated`);
      await c.query(`GRANT SELECT ON public.profiles TO authenticated`);
    }
  } finally { await c.query('RESET ROLE').catch(() => {}); c.release(); }
});

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS public.manual_payments CASCADE');
  await pool.end();
});

async function asUser(c, userId) {
  await c.query('RESET ROLE');
  if (isSuper) await c.query('SET LOCAL ROLE authenticated');
  if (!isSuper) { await c.query('ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY'); await c.query('ALTER TABLE public.manual_payments FORCE ROW LEVEL SECURITY'); }
  await c.query(`SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)`, [userId]);
}
async function asPrivileged(c) {
  await c.query('RESET ROLE');
  await c.query(`SELECT set_config('request.jwt.claim.role','service_role',true), set_config('request.jwt.claim.sub','',true)`);
  if (!isSuper) await c.query('ALTER TABLE public.manual_payments DISABLE ROW LEVEL SECURITY');
}

describe('manual payment client/schema contract', () => {
  it('submitPaymentProof updates the new-schema columns', async () => {
    const c = await pool.connect();
    const state = { client: c };
    try {
      await c.query('BEGIN');
      await asPrivileged(c);
      const { rows } = await c.query(`INSERT INTO public.manual_payments (user_id, amount, currency, status) VALUES ($1,4.99,'USD','pending') RETURNING id`, [USER_A]);
      await asUser(c, USER_A);
      vi.resetModules();
      vi.doMock('../src/lib/supabaseClient.js', () => ({ supabase: makeSupabaseMock(state) }));
      const { submitPaymentProof } = await import('../src/lib/manualPayment.js');
      await submitPaymentProof(rows[0].id, { transactionRef: 'REF-123', screenshotFile: null });
      await asPrivileged(c);
      const after = (await c.query(`SELECT status, claimed_transaction_ref, amount, currency FROM public.manual_payments WHERE id=$1`, [rows[0].id])).rows[0];
      expect(after.status).toBe('submitted');
      expect(after.claimed_transaction_ref).toBe('REF-123');
      expect(Number(after.amount)).toBe(4.99);
      expect(after.currency).toBe('USD');
      await c.query('ROLLBACK');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); vi.doUnmock('../src/lib/supabaseClient.js'); }
  });

  it('getSubmittedPayments reads the new-schema columns', async () => {
    const c = await pool.connect();
    const state = { client: c };
    try {
      await c.query('BEGIN');
      await asPrivileged(c);
      await c.query(`INSERT INTO public.manual_payments (user_id, amount, currency, status, claimed_transaction_ref, submitted_at) VALUES ($1,4.99,'USD','submitted','REFX',now())`, [USER_A]);
      await asPrivileged(c);
      await c.query(`UPDATE public.profiles SET is_admin=true WHERE id=$1`, [ADMIN]);
      await asUser(c, ADMIN); // admin can read all submitted
      vi.resetModules();
      vi.doMock('../src/lib/supabaseClient.js', () => ({ supabase: makeSupabaseMock(state) }));
      const { getSubmittedPayments } = await import('../src/lib/manualPayment.js');
      const rows = await getSubmittedPayments();
      expect(rows.length).toBeGreaterThan(0);
      expect(Number(rows[0].amount)).toBe(4.99);
      expect(rows[0].currency).toBe('USD');
      expect(rows[0].claimedTransactionRef).toBe('REFX');
      await c.query('ROLLBACK');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); vi.doUnmock('../src/lib/supabaseClient.js'); }
  });

  it('useProStatus pending payment select shape matches new schema', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await asPrivileged(c);
      await c.query(`INSERT INTO public.manual_payments (user_id, amount, currency, status, claimed_transaction_ref) VALUES ($1,4.99,'USD','pending','REFP')`, [USER_A]);
      await asUser(c, USER_A);
      const { rows } = await c.query(`SELECT id, amount, currency, status, claimed_transaction_ref, created_at FROM public.manual_payments WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1`, [USER_A]);
      expect(Number(rows[0].amount)).toBe(4.99);
      expect(rows[0].currency).toBe('USD');
      expect(rows[0].status).toBe('pending');
      expect(rows[0].claimed_transaction_ref).toBe('REFP');
      await c.query('ROLLBACK');
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  });
});
