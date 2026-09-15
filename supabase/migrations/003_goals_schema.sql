-- Goals (savings targets). One row per user-defined goal.
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

-- Owner-only access, mirroring the transactions/budgets pattern.
create policy "goals: owner can select" on public.goals
  for select using (auth.uid() = user_id);

create policy "goals: owner can insert" on public.goals
  for insert with check (auth.uid() = user_id);

create policy "goals: owner can update" on public.goals
  for update using (auth.uid() = user_id);

create policy "goals: owner can delete" on public.goals
  for delete using (auth.uid() = user_id);