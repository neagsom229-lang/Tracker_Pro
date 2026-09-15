-- Goals (savings targets)
create table if not exists public.goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  target_amount   numeric(12,2) not null check (target_amount > 0),
  current_amount  numeric(12,2) not null default 0,
  deadline        date,
  created_at      timestamptz not null default now()
);

create index if not exists goals_user_id_idx on public.goals (user_id);
alter table public.goals enable row level security;

create policy "goals: owner can select" on public.goals for select using (auth.uid() = user_id);
create policy "goals: owner can insert" on public.goals for insert with check (auth.uid() = user_id);
create policy "goals: owner can update" on public.goals for update using (auth.uid() = user_id);
create policy "goals: owner can delete" on public.goals for delete using (auth.uid() = user_id);

-- Debts (loans, credit cards)
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

create policy "debts: owner can select" on public.debts for select using (auth.uid() = user_id);
create policy "debts: owner can insert" on public.debts for insert with check (auth.uid() = user_id);
create policy "debts: owner can update" on public.debts for update using (auth.uid() = user_id);
create policy "debts: owner can delete" on public.debts for delete using (auth.uid() = user_id);