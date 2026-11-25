-- =====================================================================
-- Obsidian Finance — In-app notifications
-- Run this in the Supabase SQL Editor AFTER 001, 002, and 003.
-- Backs the notification bell (see src/hooks/useNotifications.js).
-- =====================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info', -- 'budget_exceeded' | 'recurring_due' | 'goal_reached' | 'info'
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- Users can read and mark-as-read their OWN notifications only.
create policy "Notifications are viewable by owner"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Notifications are updatable by owner"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert/delete policy for `authenticated`: notifications are only
-- ever written by server-side logic (a budget-check trigger, a
-- recurring-due check, a future daily-digest Edge Function — see the
-- comment in useNotifications.js) using the service role, never
-- typed/created by the client directly. This mirrors bank_connections'
-- "server writes, client only reads its own rows" pattern.

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read = false;