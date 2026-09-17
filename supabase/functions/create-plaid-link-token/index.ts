// supabase/functions/create-plaid-link-token/index.ts
//
// Deploy with: supabase functions deploy create-plaid-link-token
//
// First step of connecting a bank: mints a short-lived Plaid "Link
// token" the browser hands to Plaid's own Link widget. Nothing
// sensitive comes back from this call (no access token yet — that only
// exists after the user actually authenticates with their bank inside
// Plaid's UI and we exchange the resulting public_token server-side, in
// exchange-plaid-token).

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox'; // 'sandbox' | 'development' | 'production'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not authenticated.' }, 401);

    const plaidRes = await fetch(`https://${PLAID_ENV}.plaid.com/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        client_name: 'Obsidian',
        // `client_user_id` is what lets Plaid's own fraud/dedup systems
        // associate this Link session with a specific end user of ours —
        // it is NOT the Plaid access token and is safe to send.
        user: { client_user_id: user.id },
        products: ['transactions'],
        country_codes: ['US'],
        language: 'en',
        // Plaid replays this exact webhook URL for item-level events
        // (e.g. a connection needing re-auth). Wire it up once you've
        // deployed sync-bank-transactions and have its real URL.
        // webhook: `${Deno.env.get('SUPABASE_URL')}/functions/v1/plaid-webhook`,
      }),
    });

    if (!plaidRes.ok) {
      console.error('Plaid link/token/create failed:', plaidRes.status, await plaidRes.text());
      return jsonResponse({ error: 'Could not start the bank connection — try again shortly.' }, 502);
    }

    const { link_token } = await plaidRes.json();
    return jsonResponse({ link_token });
  } catch (err) {
    console.error('Unexpected error in create-plaid-link-token:', err.message);
    return jsonResponse({ error: 'Something went wrong — try again.' }, 500);
  }
});