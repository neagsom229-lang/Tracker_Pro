-- =====================================================================
-- Obsidian Finance — Supabase schema
-- Run this in the Supabase SQL Editor (Database > SQL Editor > New query)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES
-- One row per auth.users row. Holds plan/billing state that the rest of
-- the app reads. We never let the client write `is_pro` directly (see
-- RLS policies below) — only the Stripe webhook (using the service role
-- key, which bypasses RLS) is allowed to flip that flag. This is the
-- core of the whole billing security model: a paid feature is only ever
-- unlocked by a server that has verified money actually moved.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  is_pro boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_status text, -- 'active' | 'past_due' | 'canceled' | ...
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and update their OWN profile row only.
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  -- Prevent a user from granting themselves Pro by editing their own row:
  -- is_pro / stripe_* columns are excluded from what this policy allows
  -- to change via a trigger below, not via WITH CHECK (Postgres RLS can't
  -- diff old vs new per-column) — see `protect_billing_columns` trigger.
  with check (auth.uid() = id);

-- Automatically create a profile row whenever a new user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Belt-and-suspenders: even though normal users only get an UPDATE policy
-- that they could theoretically use to change is_pro, this trigger blocks
-- any change to billing columns unless the request comes from the
-- service_role (which the Stripe webhook function uses).
create or replace function public.protect_billing_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_pro := old.is_pro;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.stripe_subscription_status := old.stripe_subscription_status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_billing_columns_trigger on public.profiles;
create trigger protect_billing_columns_trigger
  before update on public.profiles
  for each row execute procedure public.protect_billing_columns();

-- ---------------------------------------------------------------------
-- 2. TRANSACTIONS
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null, -- positive = income, negative = expense (USD)
  category text not null,
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_date_idx
  on public.transactions (user_id, date desc);

alter table public.transactions enable row level security;

create policy "Users can view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users can insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own transactions"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own transactions"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. BUDGETS (Pro feature: one monthly limit per category per user)
-- ---------------------------------------------------------------------
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0),
  created_at timestamptz not null default now(),
  unique (user_id, category)
);

alter table public.budgets enable row level security;

create policy "Users can manage own budgets"
  on public.budgets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4. RECURRING RULES (Pro feature: weekly / monthly / yearly)
-- ---------------------------------------------------------------------
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null,
  category text not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'yearly')),
  next_run_date date not null,
  created_at timestamptz not null default now()
);

alter table public.recurring_rules enable row level security;

create policy "Users can manage own recurring rules"
  on public.recurring_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
-- Why RLS instead of filtering in application code?
-- RLS is enforced by Postgres itself on every query, no matter which
-- client or API path reaches the database — the anon key used in the
-- browser genuinely cannot read or write another user's rows, even if
-- there's a bug in the frontend code. Filtering only in the frontend
-- ("WHERE user_id = currentUser.id") is a UX nicety, not a security
-- boundary — anyone with devtools could change the query. RLS makes the
-- database the enforcement point.
-- =====================================================================
