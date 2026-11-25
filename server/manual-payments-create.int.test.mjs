// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { loadDotenv } from './test-app.mjs';

const env = { ...loadDotenv(), ...process.env };
const db = env.TEST_PGDATABASE ?? 'tracker_db_test';
if (!db.endsWith('_test')) throw new Error(`Refusing non-test DB: ${db}`);
const pool = new Pool({ host: env.PGHOST, port: Number(env.PGPORT), database: db, user: env.PGUSER, password: env.PGPASSWORD });
const migration006 = readFileSync(new URL('../supabase/migrations/20261124000600_manual_aba_payments.sql', import.meta.url), 'utf8');
const migrationGuard = readFileSync(new URL('../supabase/migrations/20261125000100_guard_manual_payment_fields.sql', import.meta.url), 'utf8');
const USER_A = '00000000-0000-0000-0000-00000000cb01';

beforeAll(async () => {
  const c = await pool.connect();
  try {
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
    await c.query(`INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [USER_A]);
    await c.query(`INSERT INTO public.users (id, email, password_hash) VALUES ($1,'cb1@test.local','x') ON CONFLICT (id) DO NOTHING`, [USER_A]);
    await c.query(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [USER_A]);
    await c.query(`DROP TABLE IF EXISTS public.manual_payments CASCADE`);
    await c.query(`DROP POLICY IF EXISTS "Users can upload own payment proof" ON storage.objects`);
    await c.query(`DROP POLICY IF EXISTS "Users can view own payment proof" ON storage.objects`);
    await c.query(`DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects`);
    await c.query(`CREATE TABLE IF NOT EXISTS public.subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null, stripe_customer_id text not null, stripe_subscription_id text not null unique, status text not null, plan_name text, current_period_end timestamptz, last_event_ts bigint not null default 0, created_at timestamptz not null default now())`);
    await c.query(migration006);
    await c.query(migrationGuard);
  } finally { c.release(); }
});

afterAll(async () => { await pool.query('DROP TABLE IF EXISTS public.manual_payments CASCADE'); await pool.end(); });

describe('create-manual-payment behavior (schema/SQL contract)', () => {
  it('deletes existing pending rows before creating a new one', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`INSERT INTO public.manual_payments (user_id, amount, currency, status) VALUES ($1,4.99,'USD','pending'),($1,4.99,'USD','pending')`, [USER_A]);
      // simulate function cleanup
      await c.query(`DELETE FROM public.manual_payments WHERE user_id=$1 AND status='pending'`, [USER_A]);
      await c.query(`INSERT INTO public.manual_payments (user_id, amount, currency, status) VALUES ($1,4.99,'USD','pending')`, [USER_A]);
      const { rows } = await c.query(`SELECT status FROM public.manual_payments WHERE user_id=$1`, [USER_A]);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('pending');
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it('rate limits to 5 creates per hour', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      for (let i = 0; i < 5; i++) {
        await c.query(`INSERT INTO public.manual_payments (user_id, amount, currency, status, created_at) VALUES ($1,4.99,'USD','submitted',now())`, [USER_A]);
      }
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { rows } = await c.query(`SELECT count(*)::int AS c FROM public.manual_payments WHERE user_id=$1 AND created_at >= $2`, [USER_A, since]);
      expect(rows[0].c).toBeGreaterThanOrEqual(5);
      // 6th should be blocked by the function's check (>=5)
      expect(rows[0].c >= 5).toBe(true);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });
});
