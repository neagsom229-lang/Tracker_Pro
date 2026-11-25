-- =====================================================================
-- Obsidian Finance — Net Worth tracking
-- Run this in the Supabase SQL Editor AFTER 001-006.
-- =====================================================================

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'investment', 'property', 'debt')),
  -- Always a positive magnitude, regardless of type — a debt is
  -- entered as "I owe $500" (value = 500), never as -500. Asking users
  -- to remember "debts are negative" is a needless way to get this
  -- wrong; the sign only matters in the net-worth ARITHMETIC below,
  -- never in what a person types into a form.
  value numeric(14, 2) not null check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;

create policy "Users manage own assets"
  on public.assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_assets_user on public.assets (user_id);

-- ---------------------------------------------------------------------
-- NET_WORTH_SNAPSHOTS
-- One row per user per day. This is what makes the "net worth over
-- time" chart honest rather than fabricated: there is no way to know
-- what someone's net worth was last month unless something recorded it
-- at the time. Rather than inventing backdated history, this table
-- starts recording from the moment a user first adds an asset — the
-- trend line will be flat/short at first and grow more meaningful over
-- the following days and weeks, which is the truth, not a cosmetic gap
-- to paper over.
-- ---------------------------------------------------------------------
create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  total_assets numeric(14, 2) not null default 0,
  total_debts numeric(14, 2) not null default 0,
  net_worth numeric(14, 2) not null default 0,
  unique (user_id, date) -- one snapshot per day; same-day changes update it in place
);

alter table public.net_worth_snapshots enable row level security;

create policy "Users can view own net worth history"
  on public.net_worth_snapshots for select
  using (auth.uid() = user_id);

-- No insert/update policy for `authenticated` — every row here is
-- written by the trigger below (which runs as its owner via SECURITY
-- DEFINER, not as the calling user), never directly by the client.
-- This guarantees the snapshot always reflects a REAL recomputation
-- from the assets table, never a value the client could fabricate.

create index if not exists idx_net_worth_snapshots_lookup on public.net_worth_snapshots (user_id, date desc);

-- ---------------------------------------------------------------------
-- Trigger: recompute today's snapshot whenever assets change
-- ---------------------------------------------------------------------
create or replace function public.recompute_net_worth_snapshot()
returns trigger as $$
declare
  affected_user uuid := coalesce(new.user_id, old.user_id);
  v_assets numeric;
  v_debts numeric;
begin
  select
    coalesce(sum(value) filter (where type <> 'debt'), 0),
    coalesce(sum(value) filter (where type = 'debt'), 0)
  into v_assets, v_debts
  from public.assets
  where user_id = affected_user;

  insert into public.net_worth_snapshots (user_id, date, total_assets, total_debts, net_worth)
  values (affected_user, current_date, v_assets, v_debts, v_assets - v_debts)
  on conflict (user_id, date) do update
    set total_assets = excluded.total_assets,
        total_debts = excluded.total_debts,
        net_worth = excluded.net_worth;

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists on_assets_change on public.assets;
create trigger on_assets_change
  after insert or update or delete on public.assets
  for each row execute function public.recompute_net_worth_snapshot();