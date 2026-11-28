#!/usr/bin/env node
// Assert migration 20261125000400 in two shapes:
//   (a) a remote-shaped hybrid manual_payments (old columns/policies/triggers)
//   (b) a fresh DB built from all checked-in migrations (must be a no-op)
// and exercise the post-migration guards as a *restricted* role, using a
// SUPERUSER login with SET LOCAL ROLE authenticated.
//
// Everything happens in a throwaway LOCAL database that is dropped at the
// end. A non-local host is refused so this can never touch the real project.

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

function readDotenv() {
  const env = {};
  if (!existsSync('.env')) return env;
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = { ...readDotenv(), ...process.env };
const connStr = env.SUPABASE_DB_URL || env.DATABASE_URL || '';
const host = connStr ? new URL(connStr).hostname : (env.PGHOST || '');
if (!['localhost', '127.0.0.1', '::1'].includes(String(host).toLowerCase())) {
  console.error(`[reconcile-assert] REFUSED: host=${host || '(unset)'} — local only, remote project must not be touched`);
  process.exit(1);
}

function configFor(user, database) {
  if (connStr) {
    const url = new URL(connStr);
    if (user) url.username = user;
    if (database) url.pathname = `/${database}`;
    // Use PGPASSWORD env var rather than the password embedded in SUPABASE_DB_URL,
    // so the script works with any PostgreSQL configuration (CI supabase local stack,
    // Docker containers, etc.).
    return {
      host: url.hostname,
      port: Number(url.port) || Number(env.PGPORT || 5432),
      database: (url.pathname || '').slice(1) || 'postgres',
      user: url.username || user || env.PGUSER,
            // Prefer an explicit PGPASSWORD; otherwise use the password in the URL.
      password: env.PGPASSWORD ?? decodeURIComponent(url.password),
    };
  }
  return {
    host: env.PGHOST,
    port: Number(env.PGPORT || 5432),
    database: database || 'postgres',
    user: user || env.PGUSER,
    password: env.PGPASSWORD,
  };
}

function makePool(config) {
  const pool = new pg.Pool(config);
  // A backend terminated during teardown can otherwise emit an unhandled
  // 'error' event and mask the real assertion failure.
  pool.on('error', () => {});
  return pool;
}

async function superuserPool() {
  const candidates = [...new Set([connStr ? new URL(connStr).username : env.PGUSER, 'postgres'])].filter(Boolean);
  const tried = [];
  for (const user of candidates) {
    const pool = makePool(configFor(user));
    try {
      const { rows } = await pool.query(
        'select current_user, (select rolsuper from pg_roles where rolname = current_user) as super'
      );
      if (rows[0]?.super) return { pool, user };
      tried.push(`${user}: not superuser`);
    } catch (err) {
      tried.push(`${user}: ${err.message.split('\n')[0]}`);
    }
    await pool.end().catch(() => {});
  }
  throw new Error(`No local SUPERUSER login available (${tried.join('; ')})`);
}

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
const allFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const reconcileFile = allFiles.find((f) => f.includes('20261125000400'));
assert.ok(reconcileFile, '20261125000400 reconciliation migration is missing');
const recentFiles = allFiles.filter((f) => /^20261125/.test(f));
const sqlFor = (file) => readFileSync(join(migrationsDir, file), 'utf8');
const reconcileSql = sqlFor(reconcileFile);

const U1 = '00000000-0000-0000-0000-0000000000a1';
const U2 = '00000000-0000-0000-0000-0000000000a2';

const dbName = `tracker_reconcile_${process.pid}_${Date.now()}`;
const NONPG_ROLE = `reconcile_super_${process.pid}`;
const NONPG_PASSWORD = 'reconcile_test_password';
let admin;
let testPool;
let nonPgPool;
let activePool;

function configForRole(role, database, password) {
  const cfg = configFor(role, database);
  if (cfg.connectionString) {
    const url = new URL(cfg.connectionString);
    url.password = password;
    return { connectionString: url.toString() };
  }
  return { ...cfg, password };
}

async function q(sql, params) {
  return (await activePool.query(sql, params)).rows;
}

async function resetPublic() {
  await q('drop schema if exists public cascade; create schema public');
  await q('grant usage on schema public to authenticated, anon');
  // Storage objects live outside public; their policies would otherwise
  // collide when a scenario re-applies migration 00600.
  await q(`drop policy if exists "Users can upload own payment proof" on storage.objects`);
  await q(`drop policy if exists "Users can view own payment proof" on storage.objects`);
  await q(`drop policy if exists "Admins can view all payment proofs" on storage.objects`);
}

async function setupStubs() {
  await q(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create or replace function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $fn$;
    -- Real Supabase returns NULL outside a PostgREST request (SQL editor /
    -- migration). Do NOT default to 'authenticated' here: migration backfills
    -- are trusted SQL and the guard triggers must bypass them, exactly as
    -- they do on the remote project.
    create or replace function auth.role() returns text language sql stable as $fn$
      select nullif(current_setting('request.jwt.claim.role', true), '')
    $fn$;
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key, name text, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text, name text
    );
    create or replace function storage.foldername(name text) returns text[] language sql immutable as $fn$
      select string_to_array(name, '/')
    $fn$;
  `);
  await q(`
    do $do$ begin
      if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
      end if;
    end $do$;
  `);
}

async function seedUsers() {
  await q(`insert into auth.users (id, email) values ($1,'a@test.local'),($2,'b@test.local') on conflict do nothing`, [U1, U2]);
}

// The already-deployed remote shape: hybrid manual_payments, old INSERT
// policy, old status guard, and the dangerous auto-approve INSERT trigger.
async function createRemoteShaped() {
  await q(`
    create table public.profiles (
      id uuid primary key references auth.users(id), email text,
      is_admin boolean not null default false, currency text not null default 'USD'
    );
    create table public.subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id),
      stripe_customer_id text,
      stripe_subscription_id text unique,
      status text, plan_name text, source text default 'stripe',
      current_period_end timestamptz, last_event_ts bigint default 0,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table public.manual_payments (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      amount numeric(10,2),
      amount_usd numeric(10,2),
      claimed_transaction_ref text,
      reference text,
      plan text,
      currency text not null default 'USD',
      khqr_md5 text,
      screenshot_path text,
      submitted_at timestamptz,
      reviewed_at timestamptz,
      reviewed_by uuid references auth.users(id),
      status text not null default 'pending'
        check (status in ('pending','submitted','approved','rejected','expired')),
      created_at timestamptz not null default now()
    );
    alter table public.manual_payments enable row level security;
    create policy "Users can view own manual payments" on public.manual_payments
      for select using (auth.uid() = user_id);
    create policy "Users can insert own manual payments" on public.manual_payments
      for insert with check (auth.uid() = user_id);
    create policy "Users can submit proof on own pending payment" on public.manual_payments
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

    create or replace function public.guard_manual_payment_status()
    returns trigger language plpgsql security definer as $fn$
    begin
      if new.status in ('approved','rejected') and auth.role() <> 'service_role' then
        new.status := old.status;
      end if;
      return new;
    end $fn$;
    create trigger guard_manual_payment_status before update on public.manual_payments
      for each row execute function public.guard_manual_payment_status();

    create or replace function public.auto_approve_admin_payments()
    returns trigger language plpgsql security definer as $fn$
    begin
      if exists (select 1 from public.profiles where id = new.user_id and is_admin) then
        new.status := 'approved';
        insert into public.subscriptions (user_id, status, plan_name)
        values (new.user_id, 'active', 'Auto approved');
      end if;
      return new;
    end $fn$;
    create trigger trg_auto_approve_admin_payments before insert on public.manual_payments
      for each row execute function public.auto_approve_admin_payments();
  `);
  await q(`insert into public.profiles (id, is_admin) values ($1,false),($2,true)`, [U1, U2]);
}

async function apply(files) {
  for (const file of files) await q(sqlFor(file));
}

async function snapshot() {
  const parts = [
    await q(`select table_name, column_name, data_type, is_nullable
             from information_schema.columns
             where table_schema='public'
               and table_name in ('manual_payments','ai_usage','profiles','subscriptions')
             order by 1,2`),
    await q(`select tablename, policyname, cmd, qual, with_check from pg_policies
             where schemaname='public' and tablename in ('manual_payments','ai_usage','subscriptions','profiles')
             order by 1,2,3`),
    await q(`select event_object_table, trigger_name, action_timing, event_manipulation
             from information_schema.triggers where trigger_schema='public' order by 1,2,3,4`),
    await q(`select p.oid::regprocedure as sig, p.prosecdef, p.proconfig::text, pg_get_functiondef(p.oid) as def
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' order by 1`),
    await q(`select (select count(*) from public.manual_payments) as mp,
                    (select count(*) from public.ai_usage) as ai,
                    (select count(*) from public.subscriptions) as subs`),
    await q(`select id, file_size_limit, allowed_mime_types from storage.buckets where id='payment-proofs'`),
  ];
  return JSON.stringify(parts);
}

function columnNames(rows) {
  return rows.map((r) => r.column_name);
}

async function assertCommonShape() {
  const cols = await q(`select column_name, is_nullable from information_schema.columns
                        where table_schema='public' and table_name='manual_payments'`);
  const names = columnNames(cols);
  assert.ok(!names.includes('plan') && !names.includes('amount_usd') && !names.includes('reference'),
    `old manual_payments columns survived: ${names.join(',')}`);
  assert.equal(cols.find((c) => c.column_name === 'amount')?.is_nullable, 'NO', 'amount must be NOT NULL');

  const aiCols = columnNames(await q(`select column_name from information_schema.columns
                                      where table_schema='public' and table_name='ai_usage'`));
  for (const name of ['user_id', 'usage_date', 'count']) assert.ok(aiCols.includes(name), `ai_usage.${name} missing`);

  const rls = await q(`select relrowsecurity, relforcerowsecurity from pg_class
                       where oid='public.ai_usage'::regclass`);
  assert.equal(rls[0].relrowsecurity, true, 'ai_usage RLS must be enabled');

  const policies = await q(`select policyname, cmd from pg_policies
                            where schemaname='public' and tablename='ai_usage'`);
  assert.deepEqual(policies, [{ policyname: 'Users can view own AI usage', cmd: 'SELECT' }],
    'ai_usage must be SELECT-only for users (legacy ai_usage_select_own must be gone)');

  const index = await q(`select indexname from pg_indexes
                         where schemaname='public' and tablename='ai_usage'
                           and indexname='ai_usage_user_date_key'`);
  assert.equal(index.length, 1, 'ai_usage unique index ai_usage_user_date_key missing');

  const fn = await q(`
    select p.prosecdef, p.proconfig::text,
           (select count(*) from aclexplode(p.proacl) g
             where g.grantee = 0 and g.privilege_type = 'EXECUTE')::int as public_exec,
           (select count(*) from aclexplode(p.proacl) g
             where g.grantee in (select oid from pg_roles where rolname in ('anon','authenticated'))
               and g.privilege_type = 'EXECUTE')::int as user_exec,
           (select count(*) from aclexplode(p.proacl) g
             where g.grantee = (select oid from pg_roles where rolname='service_role')
               and g.privilege_type = 'EXECUTE')::int as service_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='increment_ai_usage'
  `);
  assert.equal(fn.length, 1, 'increment_ai_usage missing');
  assert.equal(fn[0].prosecdef, true, 'increment_ai_usage must be SECURITY DEFINER');
  assert.match(fn[0].proconfig || '', /search_path=public/, 'increment_ai_usage needs pinned search_path');
  assert.equal(fn[0].public_exec, 0, 'increment_ai_usage must not be executable by PUBLIC');
  assert.equal(fn[0].user_exec, 0, 'increment_ai_usage must not be executable by anon/authenticated');
  if ((await q(`select 1 from pg_roles where rolname='service_role'`)).length) {
    assert.equal(fn[0].service_exec, 1, 'increment_ai_usage must be executable by service_role');
  }

  const guardFn = await q(`select p.prosecdef, p.proconfig::text from pg_proc p
                           where p.oid='public.guard_is_admin_column()'::regprocedure`);
  assert.equal(guardFn[0].prosecdef, true);
  assert.match(guardFn[0].proconfig || '', /search_path=public/);
  const guardTrigger = await q(`select trigger_name from information_schema.triggers
                                where trigger_schema='public' and event_object_table='profiles'
                                  and trigger_name='guard_is_admin'`);
  assert.equal(guardTrigger.length, 1, 'guard_is_admin trigger missing');

  const leftovers = await q(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                             where n.nspname='public' and proname in ('auto_approve_admin_payments','guard_manual_payment_status')`);
  assert.deepEqual(leftovers, [], 'old payment trigger functions survived');
  const oldTriggers = await q(`select trigger_name from information_schema.triggers
                               where trigger_schema='public' and trigger_name in
                                 ('trg_auto_approve_admin_payments','guard_manual_payment_status')`);
  assert.deepEqual(oldTriggers, [], 'old payment triggers survived');

  const insertPolicies = await q(`select policyname from pg_policies
                                  where schemaname='public' and tablename='manual_payments' and cmd='INSERT'`);
  assert.deepEqual(insertPolicies, [], 'client INSERT policy survived');

  const bucket = await q(`select file_size_limit, allowed_mime_types from storage.buckets where id='payment-proofs'`);
  if (bucket.length) {
    assert.equal(String(bucket[0].file_size_limit), '5242880');
    assert.deepEqual(bucket[0].allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp']);
  }
}

// Run as a restricted role from a superuser login, exactly as required.
async function asUser(userId, fn) {
  const c = await activePool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(
      `select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)`,
      [userId]
    );
    const result = await fn(c);
    await c.query('ROLLBACK'); // never persist test writes
    return result;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

async function expectDenied(promiseFactory) {
  let error;
  try {
    await promiseFactory();
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'expected the restricted role to be denied');
  assert.equal(error.code, '42501', `expected insufficient_privilege/RLS denial, got ${error.code}: ${error.message}`);
}

async function freshDbScenario() {
  await resetPublic();
  await setupStubs();
  await seedUsers();
  await apply(allFiles); // includes 00400

  const before = await snapshot();
  await q(reconcileSql); // idempotency: applying again must change nothing
  const after = await snapshot();
  assert.equal(after, before, '00400 is not idempotent on a fresh DB');

  await assertCommonShape();
  console.log('  ✓ fresh DB: all migrations apply, 00400 is a no-op');
}

async function remoteShapedScenario(label = 'postgres login') {
  await resetPublic();
  await setupStubs();
  await seedUsers();
  await createRemoteShaped();
  await q(`insert into public.manual_payments (user_id, amount_usd, reference, status)
           values ($1, 4.99, 'REF-OLD', 'pending')`, [U1]);

  await apply(recentFiles); // 00100 ... 00500
  const rows = await q(
    `select id, amount, claimed_transaction_ref from public.manual_payments where user_id=$1`, [U1]
  );
  assert.equal(rows.length, 1, 'pending row was deleted during migration (a failed backfill must raise, not delete)');
  const [{ id, amount, claimed_transaction_ref }] = rows;
  assert.equal(Number(amount), 4.99, 'amount_usd was not backfilled into amount');
  assert.equal(claimed_transaction_ref, 'REF-OLD', 'reference was not backfilled');
  await assertCommonShape();
  console.log(`  ✓ remote-shaped (${label}): pending row survives with amount 4.99, legacy schema removed`);

  // (b) restricted-role checks
  await q(`grant select, insert, update on public.manual_payments to authenticated`);
  await q(`grant select on public.profiles, public.subscriptions to authenticated`);
  await q(`grant update on public.profiles to authenticated`);

  await expectDenied(() => asUser(U1, (c) => c.query(
    `insert into public.manual_payments (user_id, status, amount) values ($1,'approved',1)`, [U1]
  )));
  console.log('  ✓ forged INSERT with status=approved denied');

  const afterTamper = await asUser(U1, async (c) => {
    await c.query(`update public.manual_payments set amount=0.01, currency='KHR' where id=$1`, [id]);
    return (await c.query(`select amount, currency from public.manual_payments where id=$1`, [id])).rows[0];
  });
  assert.equal(Number(afterTamper.amount), 4.99, 'amount tamper was not reverted');
  assert.equal(afterTamper.currency, 'USD', 'currency tamper was not reverted');
  console.log('  ✓ amount/currency tamper reverted for normal user');

  const subsBefore = (await q(`select count(*)::int as n from public.subscriptions`))[0].n;
  await expectDenied(() => asUser(U2, (c) => c.query(
    `insert into public.manual_payments (user_id, status, amount) values ($1,'approved',4.99)`, [U2]
  )));
  // Even a privileged INSERT (service-role equivalent) no longer auto-approves.
  const [{ status }] = await q(
    `insert into public.manual_payments (user_id, status, amount)
     values ($1,'pending',4.99) returning status`, [U2]
  );
  const subsAfter = (await q(`select count(*)::int as n from public.subscriptions`))[0].n;
  assert.equal(status, 'pending', 'admin INSERT was auto-approved');
  assert.equal(subsAfter, subsBefore, 'admin INSERT created a subscription');
  console.log('  ✓ admin INSERT not auto-approved, no subscription created');

  const adminFlag = await asUser(U1, async (c) => {
    await c.query(`update public.profiles set is_admin=true where id=$1`, [U1]);
    return (await c.query(`select is_admin from public.profiles where id=$1`, [U1])).rows[0].is_admin;
  });
  assert.equal(adminFlag, false, 'user could self-grant is_admin');
  console.log('  ✓ self-admin guard still active');
}

async function badRowScenario() {
  await resetPublic();
  await setupStubs();
  await seedUsers();
  await createRemoteShaped();
  await q(`insert into public.manual_payments (user_id, amount_usd, reference, status)
           values ($1, null, 'REF-BAD', 'approved')`, [U1]);
  await apply(recentFiles.filter((f) => !/20261125000400|20261125000500/.test(f))); // 00100 ... 00300

  let error;
  try {
    await q(reconcileSql);
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'migration must fail on a non-pending row with NULL amount');
  assert.match(error.message, /refusing to guess/, 'unexpected error message');
  console.log('  ✓ non-pending NULL-amount row aborts migration instead of guessing');
}

async function dedupeScenario() {
  await resetPublic();
  await setupStubs();
  await seedUsers();
  await apply(allFiles);

  // Reproduce the old remote table: no PK/unique index, two rows per day.
  await q(`alter table public.ai_usage drop constraint ai_usage_pkey`);
  await q(`drop index if exists public.ai_usage_user_date_key`);
  await q(`insert into public.ai_usage (user_id, usage_date, count)
           values ($1,'2026-11-25',2),($1,'2026-11-25',3)`, [U1]);

  const fixFile = allFiles.find((f) => f.includes('20261125000500'));
  assert.ok(fixFile, '20261125000500 follow-up migration is missing');
  await q(reconcileSql);
  await q(sqlFor(fixFile));

  const rows = await q(`select count from public.ai_usage where user_id=$1 and usage_date='2026-11-25'`, [U1]);
  assert.equal(rows.length, 1, 'duplicate ai_usage rows were not merged');
  assert.equal(rows[0].count, 5, 'duplicate ai_usage counts were not summed');
  await assertCommonShape();
  console.log('  ✓ ai_usage duplicates summed and unique index enforced');
}

async function failedBackfillScenario() {
  await resetPublic();
  await setupStubs();
  await seedUsers();
  await createRemoteShaped();
  await q(`insert into public.manual_payments (user_id, amount_usd, reference, status)
           values ($1, 4.99, 'REF-OLD', 'pending')`, [U1]);

  // Simulate an applying role the guard does not trust, even though the
  // migration sets the JWT claim: the old DELETE would silently drop this
  // pending row; the fixed version must keep it and abort instead.
  await q(`create or replace function auth.role() returns text language sql stable as $fn$
           select 'authenticated'::text
         $fn$`);
  await apply(recentFiles.filter((f) => !/20261125000400|20261125000500/.test(f)));

  let error;
  try {
    await q(reconcileSql);
  } catch (err) {
    error = err;
  }
  assert.ok(error, 'a failed backfill must abort the migration');
  assert.match(error.message, /refusing to guess/, 'unexpected error message');

  const rows = await q(`select amount, amount_usd from public.manual_payments`);
  assert.equal(rows.length, 1, 'pending row was deleted after a failed backfill');
  assert.equal(rows[0].amount, null);
  assert.equal(Number(rows[0].amount_usd), 4.99, 'the source amount should still be there for manual review');
  console.log('  ✓ failed backfill raises and keeps the pending row intact');
}

async function cleanup() {
  if (nonPgPool) {
    await nonPgPool.end().catch(() => {});
    nonPgPool = null;
  }
  if (testPool) {
    await testPool.end().catch(() => {});
    testPool = null;
  }
  if (admin) {
    await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname=$1`, [dbName]).catch(() => {});
    await admin.query(`drop database if exists ${dbName}`).catch(() => {});
    await admin.query(`drop role if exists ${NONPG_ROLE}`).catch(() => {});
    await admin.end().catch(() => {});
    admin = null;
  }
}

async function main() {
  const { pool, user } = await superuserPool();
  admin = pool;
  console.log(`[reconcile-assert] local superuser: ${user}`);
  await admin.query(`create database ${dbName}`);
  testPool = makePool(configFor(user, dbName));
  activePool = testPool;
  try {
    await setupStubs();
    await freshDbScenario();
    await remoteShapedScenario();
    await badRowScenario();
    await dedupeScenario();

    // Same remote-shaped path again, but logged in as a SUPERUSER whose
    // name is not postgres: the backfill must still survive the guard
    // trigger (set_config('request.jwt.claim.role','service_role',true)).
    await admin.query(`do $do$ begin
      if not exists (select 1 from pg_roles where rolname='${NONPG_ROLE}') then
        create role ${NONPG_ROLE} superuser login password '${NONPG_PASSWORD}';
      end if;
    end $do$`);
    nonPgPool = makePool(configForRole(NONPG_ROLE, dbName, NONPG_PASSWORD));
    const { rows: login } = await nonPgPool.query(
      `select current_user, (select rolsuper from pg_roles where rolname=current_user) as super`
    );
    assert.notEqual(login[0].current_user, 'postgres', 'expected a non-postgres login');
    assert.equal(login[0].super, true, 'expected a superuser login');
    activePool = nonPgPool;
    await remoteShapedScenario('non-postgres superuser login');
    activePool = testPool;
    await failedBackfillScenario();

    console.log('[reconcile-assert] all reconciliation assertions OK');
  } finally {
    await cleanup();
  }
}

main().catch(async (err) => {
  console.error('[reconcile-assert] FAILED:', err);
  await cleanup();
  process.exitCode = 1;
});
