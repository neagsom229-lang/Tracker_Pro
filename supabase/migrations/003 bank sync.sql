-- =====================================================================
-- Obsidian Finance — Bank Sync (Plaid)
-- Run this in the Supabase SQL Editor AFTER 001 and 002.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. VAULT
-- Supabase Vault gives us `vault.create_secret()` / the
-- `vault.decrypted_secrets` view — envelope encryption for exactly this
-- use case (a third-party API credential that must never be readable in
-- plain SQL, a backup, or a dashboard table browser). It ships enabled
-- by default on all current Supabase projects; this line is a no-op if
-- so, and only matters on an older project.
-- ---------------------------------------------------------------------
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------
-- 1. BANK_CONNECTIONS
-- One row per linked bank item. The actual Plaid access token is NEVER
-- stored in this table (or anywhere in plain Postgres) — only the UUID
-- of a Vault secret that holds it. Only a service-role client (i.e.
-- only our own Edge Functions, never the browser) can read
-- `vault.decrypted_secrets` to get the real token back out.
-- ---------------------------------------------------------------------
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  institution_name text not null,
  plaid_item_id text not null unique,
  access_token_secret_id uuid not null, -- points into vault.secrets, not a plain token
  cursor text, -- Plaid's /transactions/sync pagination cursor; null = "never synced"
  status text not null default 'active', -- 'active' | 'error' | 'disconnected'
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.bank_connections enable row level security;

-- Users can see WHICH banks they've connected (institution name, status,
-- last sync time) — never the secret id itself is meaningful to them
-- without Vault decrypt access, which RLS + Postgres grants already
-- block for the `authenticated` role.
create policy "Bank connections are viewable by owner"
  on public.bank_connections for select
  using (auth.uid() = user_id);

-- Deliberately NO insert/update/delete policy for `authenticated`: every
-- write to this table happens via a service-role Edge Function
-- (exchange-plaid-token, sync-bank-transactions), after we've already
-- exchanged/validated things with Plaid server-side. A user disconnecting
-- a bank should call a "disconnect-bank" style function too, for the
-- same reason — never a direct client-side UPDATE.

create index if not exists idx_bank_connections_user on public.bank_connections (user_id);
create index if not exists idx_bank_connections_status on public.bank_connections (status) where status = 'active';

-- ---------------------------------------------------------------------
-- 2. TRANSACTIONS — sync support
-- Adds just enough to dedupe re-syncs and to tell a synced row apart
-- from a manually-entered one in the UI.
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists plaid_transaction_id text,
  add column if not exists source text not null default 'manual'; -- 'manual' | 'plaid' | 'ai'

-- Partial unique index (not a full unique constraint) because
-- plaid_transaction_id is null for every manually-entered row — a full
-- unique constraint would treat all those nulls as needing to be
-- distinct-or-equal in ways that vary by Postgres version; a partial
-- index sidesteps that entirely and is the standard pattern for
-- "unique only when present."
create unique index if not exists idx_transactions_plaid_dedupe
  on public.transactions (user_id, plaid_transaction_id)
  where plaid_transaction_id is not null;