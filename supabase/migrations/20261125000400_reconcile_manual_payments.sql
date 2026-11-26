-- =====================================================================
-- Obsidian Finance — Migration 20261125000400
-- Reconcile the checked-in migrations with the already-deployed remote
-- schema. Idempotent: on a fresh DB built from our own migrations the old
-- columns/policies/triggers do not exist, so every step below is a no-op.
-- Never edit an already-applied migration; add files like this one instead.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Backfill legacy columns, ONLY when they exist.
-- The remote manual_payments is a hybrid table: it has both the new
-- (amount, claimed_transaction_ref) and old (amount_usd, reference, plan)
-- columns, with data in the old ones. A fresh DB has none of the old
-- columns, so the whole block is skipped there.
-- ---------------------------------------------------------------------
do $$
declare
  has_amount_usd boolean;
  has_reference boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manual_payments'
      and column_name = 'amount_usd'
  ) into has_amount_usd;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'manual_payments'
      and column_name = 'reference'
  ) into has_reference;

  if has_amount_usd or has_reference then
    if has_amount_usd then
      execute 'update public.manual_payments
                  set amount = amount_usd
                where amount is null and amount_usd is not null';
    end if;

    if has_reference then
      execute 'update public.manual_payments
                  set claimed_transaction_ref = reference
                where claimed_transaction_ref is null and reference is not null';
    end if;

    -- A row with no amount can never be a real payment. Pending rows can
    -- safely be discarded; anything further along must be looked at by a
    -- human rather than guessed at here.
    execute 'delete from public.manual_payments where amount is null and status = ''pending''';

    if exists (select 1 from public.manual_payments where amount is null) then
      raise exception 'manual_payments: non-pending row(s) with NULL amount remain after backfill — refusing to guess';
    end if;

    execute 'alter table public.manual_payments alter column amount set not null';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Remove the remote-only auto-approve-on-INSERT trigger. It grants Pro
-- from an untrusted INSERT path; approval must only happen through the
-- reviewed service-role function (review-manual-payment).
-- ---------------------------------------------------------------------
drop trigger if exists trg_auto_approve_admin_payments on public.manual_payments;
drop function if exists public.auto_approve_admin_payments();

-- ---------------------------------------------------------------------
-- 3. Remove the old client INSERT policy. Creates now go through
-- create-manual-payment (service role) with a server-fixed amount.
-- ---------------------------------------------------------------------
drop policy if exists "Users can insert own manual payments" on public.manual_payments;

-- ---------------------------------------------------------------------
-- 4. Remove the old guard (migration ...100 already replaced it with
-- guard_manual_payment_fields). Safe to repeat on the remote.
-- ---------------------------------------------------------------------
drop trigger if exists guard_manual_payment_status on public.manual_payments;
drop function if exists public.guard_manual_payment_status();

-- ---------------------------------------------------------------------
-- 5. Retire the old columns after the data has been moved.
-- ---------------------------------------------------------------------
alter table public.manual_payments drop column if exists plan;
alter table public.manual_payments drop column if exists amount_usd;
alter table public.manual_payments drop column if exists reference;

-- ---------------------------------------------------------------------
-- 6. Make guard_is_admin_column()/guard_is_admin match the repo definition
-- from 20261124000600 (the remote function body is unknown). Adding
-- `set search_path = public` keeps the SECURITY DEFINER function safe.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.guard_is_admin_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.role() is NULL outside a PostgREST request, so a direct SQL
  -- Editor UPDATE can bootstrap the first admin while a normal JWT cannot.
  if new.is_admin is distinct from old.is_admin and auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_is_admin on public.profiles;
create trigger guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin_column();

-- ---------------------------------------------------------------------
-- 7. Pin search_path on every public-schema plpgsql SECURITY DEFINER
-- function that does not have one yet (e.g. the remote's
-- protect_billing_columns). Existing settings are left alone.
-- ---------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and (
        p.proconfig is null
        or not exists (
          select 1 from unnest(p.proconfig) as setting
          where setting like 'search_path=%'
        )
      )
  loop
    execute format('alter function %s set search_path = public', fn.signature);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. AI usage: one row per user per day. Users may only READ it; the
-- Edge Function writes through the service-role-only RPC below.
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null default current_date,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;

drop policy if exists "Users can view own AI usage" on public.ai_usage;
create policy "Users can view own AI usage"
  on public.ai_usage for select
  using (auth.uid() = user_id);

create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_usage_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ai_usage (user_id, usage_date, count)
  values (p_user_id, p_usage_date, 1)
  on conflict (user_id, usage_date)
  do update set count = public.ai_usage.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- No PUBLIC/anon/authenticated access — only the service-role Edge
-- Function may reserve a request. Role existence is checked because a
-- plain local Postgres test DB may not define Supabase's roles.
revoke all on function public.increment_ai_usage(uuid, date) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.increment_ai_usage(uuid, date) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.increment_ai_usage(uuid, date) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.increment_ai_usage(uuid, date) to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Payment-proof upload limits (no-op when the bucket is missing).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    execute $sql$
      update storage.buckets
         set file_size_limit = 5242880,
             allowed_mime_types = array['image/jpeg','image/png','image/webp']
       where id = 'payment-proofs'
    $sql$;
  end if;
end $$;

-- 10. Deliberately NOT touched: aba_transactions (remote has 3 rows),
--     subscriptions rows, and any payment_provider column. BillingPanel
--     maps provider = payment_provider ?? (source === 'manual_aba'
--     ? 'aba_manual' : 'stripe') on the client instead.
