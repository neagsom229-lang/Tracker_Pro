-- =====================================================================
-- Obsidian Finance — Manual ABA PayWay / Bakong KHQR confirmation flow
-- Run this in the Supabase SQL Editor AFTER 001, 002, 003, and 004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES — is_admin flag, WITH a tamper-proof guard
-- The existing "Profiles are updatable by owner" policy (from 001) has
-- no column-level restriction — it only checks WHICH ROW is being
-- updated, not WHICH COLUMNS. Without the trigger below, any signed-in
-- user could run `update profiles set is_admin = true where id =
-- auth.uid()` themselves and grant themselves admin. This is a genuine
-- privilege-escalation hole the moment is_admin exists, not a
-- theoretical one — closing it is not optional.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.guard_is_admin_column()
returns trigger as $$
begin
  -- auth.role() reflects the Postgres role PostgREST assigns per
  -- request: 'authenticated' for a normal user JWT, 'service_role' for
  -- an Edge Function using the service-role key. Running this same
  -- UPDATE directly in the SQL Editor (or via `supabase db` CLI/
  -- migrations) has NO PostgREST session at all, so auth.role() is
  -- NULL there — and `NULL <> 'service_role'` evaluates to NULL, which
  -- `if` treats as false. That's what makes this simultaneously:
  --   - block a normal authenticated user's client-side update, AND
  --   - still let YOU bootstrap the very first admin by running
  --     `update profiles set is_admin = true where email = '...'`
  --     directly in the SQL Editor, AND
  --   - let a service-role Edge Function change it later if you ever
  --     want an in-app "promote to admin" action.
  -- A change that isn't allowed is silently reverted rather than
  -- erroring the whole UPDATE, so an unrelated field (e.g. currency)
  -- can still be updated in the same request.
  if new.is_admin is distinct from old.is_admin and auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_is_admin on public.profiles;
create trigger guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin_column();

-- ---------------------------------------------------------------------
-- 2. SUBSCRIPTIONS — allow a non-Stripe source
-- A manually-approved payment needs to grant Pro through the exact same
-- `subscriptions` table useProStatus.js already reads (status in
-- 'active'/'trialing') rather than inventing a second, parallel
-- Pro-status mechanism. stripe_customer_id/stripe_subscription_id were
-- NOT NULL — relaxing that is safe: Postgres never treats two NULLs as
-- violating a UNIQUE constraint, so multiple manual rows can each have
-- a NULL stripe_subscription_id without conflicting.
-- ---------------------------------------------------------------------
alter table public.subscriptions alter column stripe_customer_id drop not null;
alter table public.subscriptions alter column stripe_subscription_id drop not null;
alter table public.subscriptions add column if not exists source text not null default 'stripe'
  check (source in ('stripe', 'manual_aba'));

-- ---------------------------------------------------------------------
-- 3. MANUAL_PAYMENTS
-- ---------------------------------------------------------------------
create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(10, 2) not null, -- fixed server-side (create-manual-payment), never client-supplied
  currency text not null default 'USD',
  khqr_md5 text, -- the Bakong KHQR payload's MD5 — kept for a future automated-verification pass
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'approved', 'rejected')),
  claimed_transaction_ref text, -- what the user typed as their ABA/Bakong transaction reference
  screenshot_path text, -- path in the payment-proofs storage bucket, nullable
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.manual_payments enable row level security;

create policy "Users can view own manual payments"
  on public.manual_payments for select
  using (auth.uid() = user_id);

create policy "Admins can view all manual payments"
  on public.manual_payments for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin));

-- Users may submit proof on their OWN still-pending payment — but see
-- the trigger below for why they can't use this same path to approve
-- themselves.
create policy "Users can submit proof on own pending payment"
  on public.manual_payments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Same shape of problem as is_admin above: the UPDATE policy checks
-- ROW ownership, not which VALUE `status` is being set to. Without
-- this guard, a user could update their own row straight to
-- status = 'approved' and grant themselves Pro. Only a service-role
-- Edge Function (review-manual-payment, after verifying the CALLER is
-- an admin) may move a row into 'approved' or 'rejected'.
create or replace function public.guard_manual_payment_status()
returns trigger as $$
begin
  if new.status in ('approved', 'rejected') and auth.role() <> 'service_role' then
    new.status := old.status;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists guard_manual_payment_status on public.manual_payments;
create trigger guard_manual_payment_status
  before update on public.manual_payments
  for each row execute function public.guard_manual_payment_status();

create index if not exists idx_manual_payments_status on public.manual_payments (status) where status = 'submitted';
create index if not exists idx_manual_payments_user on public.manual_payments (user_id);

-- ---------------------------------------------------------------------
-- 4. STORAGE — payment proof screenshots (private bucket)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

-- Path convention enforced by these policies: `<user_id>/<filename>`.
create policy "Users can upload own payment proof"
  on storage.objects for insert
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can view own payment proof"
  on storage.objects for select
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Admins can view all payment proofs"
  on storage.objects for select
  using (
    bucket_id = 'payment-proofs'
    and exists (select 1 from public.profiles where id = auth.uid() and is_admin)
  );