// supabase/functions/exchange-plaid-token/index.ts
//
// Deploy with: supabase functions deploy exchange-plaid-token
//
// NOTE: this function wasn't in the original file list but the flow
// described ("exchange the public token for an access token") is not
// safe to do from the browser — it requires PLAID_SECRET, a server-only
// credential — so it has to be its own server-side step. This is that
// step: called once, right after Plaid Link's onSuccess callback fires
// with a public_token.
//
// Runs the public_token -> access_token exchange, then stores the
// resulting access_token in Supabase Vault (encrypted at rest) and
// writes only a reference to it — never the token itself — into
// bank_connections.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAID_ENV = Deno.env.get('PLAID_ENV') || 'sandbox';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not authenticated.' }, 401);

    const { public_token, institution_name } = await req.json();
    if (typeof public_token !== 'string' || !public_token) {
      return jsonResponse({ error: 'Missing public_token.' }, 400);
    }

    const exchangeRes = await fetch(`https://${PLAID_ENV}.plaid.com/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('PLAID_CLIENT_ID'),
        secret: Deno.env.get('PLAID_SECRET'),
        public_token,
      }),
    });

    if (!exchangeRes.ok) {
      console.error('Plaid public_token/exchange failed:', exchangeRes.status, await exchangeRes.text());
      return jsonResponse({ error: 'Could not finish connecting that bank — try again.' }, 502);
    }

    const { access_token, item_id } = await exchangeRes.json();

    // Service-role client: needed both to write bank_connections (no
    // client insert policy exists — see the migration) and to call
    // Vault, which only the service role can do.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Encrypt the access token via Vault BEFORE it touches any regular
    // table. `create_secret` returns the new secret's UUID; that UUID is
    // the only thing that ever lands in bank_connections.
    const { data: secretId, error: vaultError } = await admin
      .schema('vault')
      .rpc('create_secret', { secret: access_token, unique_name: `plaid_access_token_${item_id}` });

    if (vaultError) {
      console.error('Vault create_secret failed:', vaultError.message);
      return jsonResponse({ error: 'Could not securely store that connection — try again.' }, 500);
    }

    const { error: insertError } = await admin.from('bank_connections').insert({
      user_id: user.id,
      institution_name: institution_name || 'Connected bank',
      plaid_item_id: item_id,
      access_token_secret_id: secretId,
    });

    if (insertError) {
      console.error('bank_connections insert failed:', insertError.message);
      return jsonResponse({ error: 'Could not save that connection — try again.' }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected error in exchange-plaid-token:', err.message);
    return jsonResponse({ error: 'Something went wrong — try again.' }, 500);
  }
});