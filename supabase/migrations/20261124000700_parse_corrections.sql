-- =====================================================================
-- Obsidian Finance — Quick Add parse corrections (learned patterns)
-- Run this in the Supabase SQL Editor AFTER 001-005.
-- =====================================================================

create table if not exists public.parse_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The normalized keyword the local parser extracted as the likely
  -- "merchant" token (lowercased, trimmed) — e.g. "brown" from
  -- "Coffee at Brown". Matching on a single normalized keyword rather
  -- than the full free-text string is what makes this a simple,
  -- reliable key-value lookup instead of anything resembling ML: the
  -- NEXT time any text containing "brown" is parsed, this correction
  -- applies again, regardless of the rest of the sentence.
  pattern_key text not null,
  corrected_category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pattern_key) -- re-correcting the same keyword updates, never duplicates
);

alter table public.parse_corrections enable row level security;

create policy "Users manage own parse corrections"
  on public.parse_corrections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_parse_corrections_lookup on public.parse_corrections (user_id, pattern_key);