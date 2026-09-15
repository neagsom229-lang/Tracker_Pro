-- Debts (loans, credit cards, etc.). One row per debt.
-- Two amount columns on purpose: `initial_balance` is what the user owed
-- when they added the debt (used for progress %), `balance` is what they
-- owe now (shrinks with every payment).
create table if not exists public.debts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  initial_balance   numeric(12,2) not null check (initial_balance >= 0),
  balance           numeric(12,2) not null check (balance >= 0),
  interest_rate     numeric(5,2)  not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  minimum_payment   numeric(12,2) not null default 0 check (minimum_payment >= 0),
  created_at        timestamptz not null default now()
);

create index if not exists debts_user_id_idx on public.debts (user_id);

alter table public.debts enable row level security;

create policy "debts: owner can select" on public.debts
  for select using (auth.uid() = user_id);

create policy "debts: owner can insert" on public.debts
  for insert with check (auth.uid() = user_id);

create policy "debts: owner can update" on public.debts
  for update using (auth.uid() = user_id);

create policy "debts: owner can delete" on public.debts
  for delete using (auth.uid() = user_id);