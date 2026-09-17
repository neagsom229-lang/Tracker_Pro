// supabase/functions/sync-bank-transactions/index.ts
//
// Deploy with: supabase functions deploy sync-bank-transactions --no-verify-jwt
//
// IMPORTANT: deployed WITHOUT Supabase's automatic JWT check (like the
// Stripe webhook) because this function has TWO legitimate callers that
// don't both carry a normal user session:
//   1. The app itself, right after a user finishes Plaid Link — sends a
//      real user JWT, and this function syncs only THAT user's
//      connections. Auth here is "is this a valid Supabase user token".
//   2. A scheduled cron job (see setup notes below) — has no user at
//      all, needs to sync EVERY active connection. Auth here is a
//      shared secret (CRON_SECRET) instead, the same pattern most
//      schedulers (Vercel Cron, GitHub Actions, etc.) use for
//      unattended calls.
// Since neither of those is "the standard Supabase user-JWT check",
// verification is done manually below instead of relying on the
// platform gateway.
//
// Uses Plaid's `/transactions/sync` endpoint — the current recommended
// approach (cursor-based, delta-only) rather than the older
// `/transactions/get` (date-range, re-fetches everything every time).

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

// Coarse Plaid personal_finance_category.primary -> our category id.
// Keep in sync with CATEGORIES in src/utils/constants.js. Anything not
// listed here (Plaid's taxonomy is much larger than ours) falls back to
// 'other' — better an uncategorized-but-present transaction than a
// silently dropped one.
const PLAID_CATEGORY_MAP: Record<string, string> = {
  INCOME: 'salary',
  TRANSFER_IN: 'salary',
  FOOD_AND_DRINK: 'food',
  RENT_AND_UTILITIES: 'rent',
  TRANSPORTATION: 'transport',
  TRAVEL: 'transport',
  ENTERTAINMENT: 'entertainment',
  GENERAL_MERCHANDISE: 'shopping',
  PERSONAL_CARE: 'health',
  MEDICAL: 'health',
};

function mapCategory(plaidTxn: any): string {
  const primary = plaidTxn.personal_finance_category?.primary;
  return PLAID_CATEGORY_MAP[primary] || 'other';
}

async function getAccessToken(admin: ReturnType<typeof createClient>, secretId: string): Promise<string | null> {
  const { data, error } = await admin.schema('vault').from('decrypted_secrets').select('decrypted_secret').eq('id', secretId).single();
  if (error || !data) {
    console.error('Vault decrypt failed for secret', secretId, error?.message);
    return null;
  }
  return data.decrypted_secret as string;
}

// Syncs a single bank_connections row: pages through /transactions/sync
// until has_more is false, upserts added/modified rows, deletes removed
// ones, then persists the new cursor so the next run only fetches deltas.
async function syncOneConnection(admin: ReturnType<typeof createClient>, connection: any) {
  const accessToken = await getAccessToken(admin, connection.access_token_secret_id);
  if (!accessToken) {
    await admin.from('bank_connections').update({ status: 'error' }).eq('id', connection.id);
    return { connectionId: connection.id, synced: 0, error: 'Could not decrypt access token' };
  }

  let cursor = connection.cursor;
  let hasMore = true;
  let syncedCount = 0;

  while (hasMore) {
    const res = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        access_token: accessToken,
        cursor: cursor || undefined,
      }),
    });

    if (!res.ok) {
      console.error('Plaid /transactions/sync failed for connection', connection.id, res.status, await res.text());
      await admin.from('bank_connections').update({ status: 'error' }).eq('id', connection.id);
      return { connectionId: connection.id, synced: syncedCount, error: 'Plaid sync request failed' };
    }

    const page = await res.json();

    const upserts = [...page.added, ...page.modified].map((t: any) => ({
      user_id: connection.user_id,
      // Plaid's sign convention is the OPPOSITE of ours: positive amount
      // = money OUT of the account (an expense), negative = money IN.
      // Our app's convention (see TransactionModal) is the reverse
      // (income positive, expense negative) — flip the sign here, once,
      // at the sync boundary, so nothing downstream needs to know Plaid
      // conventions exist at all.
      amount: -t.amount,
      description: t.merchant_name || t.name || 'Bank transaction',
      category: mapCategory(t),
      date: t.date,
      plaid_transaction_id: t.transaction_id,
      source: 'plaid',
    }));

    if (upserts.length) {
      const { error: upsertError } = await admin
        .from('transactions')
        .upsert(upserts, { onConflict: 'user_id,plaid_transaction_id' });
      if (upsertError) console.error('Upsert failed for connection', connection.id, upsertError.message);
      else syncedCount += upserts.length;
    }

    if (page.removed.length) {
      const removedIds = page.removed.map((t: any) => t.transaction_id);
      await admin.from('transactions').delete().eq('user_id', connection.user_id).in('plaid_transaction_id', removedIds);
    }

    cursor = page.next_cursor;
    hasMore = page.has_more;
  }

  await admin.from('bank_connections').update({ cursor, status: 'active', last_synced_at: new Date().toISOString() }).eq('id', connection.id);
  return { connectionId: connection.id, synced: syncedCount };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  // Every response below needs corsHeaders(req) — not just the OPTIONS
  // preflight. A missing header on the OPTIONS response blocks the
  // browser from even sending the real request; a missing header on the
  // real response blocks the browser from letting JS read it once it
  // arrives. Both matter. Mode 1 (cron) never hits a browser at all —
  // it's a server-to-server call authenticated by x-cron-secret — but
  // Mode 2 (triggered from PlaidLinkButton.jsx right after Link
  // succeeds) is a genuine browser fetch, so it needs this on every path.
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // --- Mode 1: scheduled / bulk (shared-secret auth) ---
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret) {
    if (cronSecret !== Deno.env.get('CRON_SECRET')) {
      return jsonResponse({ error: 'Invalid cron secret.' }, 401);
    }
    const { data: connections, error } = await admin.from('bank_connections').select('*').eq('status', 'active');
    if (error) return jsonResponse({ error: error.message }, 500);

    const results = [];
    for (const connection of connections) results.push(await syncOneConnection(admin, connection));
    return jsonResponse({ results });
  }

  // --- Mode 2: single user, triggered right after Plaid Link succeeds ---
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not authenticated.' }, 401);

    const { data: connections, error } = await admin.from('bank_connections').select('*').eq('user_id', user.id).eq('status', 'active');
    if (error) return jsonResponse({ error: error.message }, 500);

    const results = [];
    for (const connection of connections) results.push(await syncOneConnection(admin, connection));
    return jsonResponse({ results });
  } catch (err) {
    console.error('Unexpected error in sync-bank-transactions:', err.message);
    return jsonResponse({ error: 'Something went wrong.' }, 500);
  }
});