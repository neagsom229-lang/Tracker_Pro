-- =====================================================================
-- Migration 006: Real ABA PayWay API integration
-- Run after your existing migrations (numbering collisions in 003/004
-- notwithstanding -- this one only adds new objects, so it's safe to
-- run regardless of what order those resolve to).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Track a distinct source for real, API-verified ABA payments,
-- separate from the existing manual_aba (QR + human review) path. Keeping
-- them distinguishable matters operationally: you'll want to know how
-- many Pro users came from an automated, cryptographically-confirmed
-- payment versus one you eyeballed in your ABA app.
-- ---------------------------------------------------------------------
alter table public.subscriptions drop constraint if exists subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('stripe', 'manual_aba', 'aba'));

-- ---------------------------------------------------------------------
-- 2. ABA_TRANSACTIONS
--
-- Written BEFORE we ever call ABA, keyed by the tran_id we generate.
-- This is what lets aba-webhook resolve "which of our users does this
-- payment belong to" from data WE control -- rather than trusting
-- whatever ABA echoes back in custom_fields/return_params, which is a
-- weaker guarantee than a lookup against our own row. Same principle as
-- stripe_customers: the webhook looks things up, it doesn't trust the
-- caller to tell it who they are.
-- ---------------------------------------------------------------------
create table if not exists public.aba_transactions (
  tran_id      text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  plan         text not null check (plan in ('monthly', 'yearly')),
  amount_usd   numeric(10, 2) not null,
  status       text not null default 'initiated'
    check (status in ('initiated', 'completed', 'failed')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists aba_transactions_user_id_idx on public.aba_transactions (user_id, created_at desc);

alter table public.aba_transactions enable row level security;

-- Read-only for the owner (so the UI could show "payment pending" if you
-- want later). Writes are service-role only (create-aba-payment inserts,
-- aba-webhook updates) -- there is deliberately no insert/update policy
-- for authenticated users, so a client cannot mark its own transaction
-- 'completed'.
create policy "Users can view own aba transactions"
  on public.aba_transactions for select using (auth.uid() = user_id);