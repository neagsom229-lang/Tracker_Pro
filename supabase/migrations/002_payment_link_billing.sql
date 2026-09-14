-- =====================================================================
-- Obsidian Finance — Migration 002: Payment Link billing
-- Run this AFTER 001_init_schema.sql, in the Supabase SQL Editor.
--
-- This migration switches billing from a dynamically-created Stripe
-- Checkout Session to a static Stripe Payment Link. Two new tables now
-- hold the source of truth for who is Pro:
--   - stripe_customers: maps a Supabase user to their Stripe customer id
--   - subscriptions:    the actual subscription record (status, plan,
--                       renewal date) that the app reads to decide isPro
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Retire the old billing columns from migration 001.
-- They lived on `profiles` when we created Checkout Sessions
-- dynamically; now that dedicated tables track this, keeping both would
-- give us two "sources of truth" that could disagree. Drop the trigger
-- that protected those columns first (it references them, so it would
-- error once they're gone), then drop the columns themselves.
-- ---------------------------------------------------------------------
drop trigger if exists protect_billing_columns_trigger on public.profiles;
drop function if exists public.protect_billing_columns();

alter table public.profiles drop column if exists is_pro;
alter table public.profiles drop column if exists stripe_customer_id;
alter table public.profiles drop column if exists stripe_subscription_id;
alter table public.profiles drop column if exists stripe_subscription_status;

-- ---------------------------------------------------------------------
-- 2. STRIPE_CUSTOMERS
-- One row per user, created the first time their `checkout.session.completed`
-- webhook arrives. Kept as its own table (rather than a column on
-- `profiles`) because subscription-lifecycle events from Stripe
-- (`customer.subscription.updated/deleted`) only tell us the Stripe
-- CUSTOMER id, not the Supabase user id — this table is how the webhook
-- looks up "which of my users does this customer belong to".
-- ---------------------------------------------------------------------
create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.stripe_customers enable row level security;

-- Users may READ their own link (handy for debugging in the app), but
-- there is deliberately NO insert/update/delete policy for the anon/
-- authenticated roles below. With RLS enabled and no matching policy,
-- Postgres denies the action by default — so only the webhook (using
-- the service_role key, which bypasses RLS entirely) can ever write
-- here. A user cannot "link" themselves to an arbitrary Stripe customer.
create policy "Users can view own stripe customer link"
  on public.stripe_customers for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. SUBSCRIPTIONS
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null check (
    status in ('active', 'trialing', 'canceled', 'past_due', 'incomplete', 'incomplete_expired', 'unpaid')
  ),
  plan_name text,
  current_period_end timestamptz,
  -- Unix seconds of the Stripe event that last wrote this row. Stripe
  -- does not guarantee webhook delivery order, so before applying an
  -- event we compare its timestamp to this column and ignore the event
  -- if it's older than what we already have — otherwise a delayed retry
  -- of an old event could overwrite a newer status.
  last_event_ts bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

-- Same reasoning as stripe_customers: read-only for the user, writable
-- only by the service-role webhook.
create policy "Users can view own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4. Realtime
-- Lets the frontend's `useProStatus()` hook subscribe to changes on this
-- table and update the UI the instant the webhook writes a new status —
-- no polling, no manual refresh needed except right after the Stripe
-- redirect (handled separately in App.jsx).
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.subscriptions;

-- =====================================================================
-- Why still keep RLS here even though only SELECT is allowed?
-- Without RLS enabled at all, ANY authenticated user could read EVERY
-- row via the anon key (RLS is what makes `.eq('user_id', ...)` in
-- application code actually enforced rather than just polite). With RLS
-- on and only a same-user SELECT policy, a user can see their own
-- subscription and nothing else, and cannot write at all.
-- =====================================================================
