// supabase/functions/create-aba-payment/index.ts
//
// Deploy: supabase functions deploy create-aba-payment
//
// What this function does, start to finish:
//   1. Verifies the caller is a real logged-in user (never trusts the client).
//   2. Looks up the price server-side (client can't ask for a cheaper plan).
//   3. Builds ABA PayWay's signed purchase request (HMAC-SHA512, keyed by API key).
//   4. POSTs to ABA's /purchase endpoint itself.
//   5. Receives ABA's response — which contains a QR image, deeplink, and a
//      status code — and returns that to the browser.
//   6. Records a `pending` row in aba_transactions so the webhook can find it.
//
// The API key NEVER leaves this Deno process. The browser only ever sees
// the resulting QR, never the signing material.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Server-side price list. The ONLY place the amount is decided.
const PLANS: Record<string, { amountUSD: number; label: string; periodDays: number }> = {
  monthly: { amountUSD: 4.99, label: 'Obsidian Pro (Monthly)', periodDays: 30 },
  yearly: { amountUSD: 49.99, label: 'Obsidian Pro (Yearly)', periodDays: 365 },
};

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

function pad(n: number, width = 2) {
  return String(n).padStart(width, '0');
}

function reqTimeUTC(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

function generateTranId(): string {
  const time = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(6));
  const randStr = Array.from(rand, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
  return `OB${time}${randStr}`.slice(0, 20);
}

async function hmacSha512Base64(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // ---- 1. Who is calling? ----
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated.' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Not authenticated.' }, 401);

    // ---- 2. Validate the plan, decide the price ourselves ----
    const body = await req.json().catch(() => ({}));
    const plan = body.plan === 'yearly' ? 'yearly' : body.plan === 'monthly' ? 'monthly' : null;
    if (!plan) return json({ error: "plan must be 'monthly' or 'yearly'." }, 400);

    const { amountUSD, label } = PLANS[plan];
    const amount = amountUSD.toFixed(2);

    const merchantId = Deno.env.get('ABA_MERCHANT_ID');
    const apiKey = Deno.env.get('ABA_API_KEY');
    const apiUrl = Deno.env.get('ABA_API_URL');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!merchantId || !apiKey || !apiUrl || !supabaseUrl || !serviceRoleKey) {
      console.error('[create-aba-payment] Missing required env vars');
      return json({ error: 'Payment gateway not configured.' }, 500);
    }

    const tranId = generateTranId();
    const reqTime = reqTimeUTC();

    // ---- 3. Build the ABA field set ----
    const fields: Record<string, string> = {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: tranId,
      amount,
      items: '',
      shipping: '0.00',
      firstname: '',
      lastname: '',
      email: user.email ?? '',
      phone: '',
      type: 'purchase',
      payment_option: 'abapay',
      return_url: `${supabaseUrl}/functions/v1/aba-webhook`,
      cancel_url: `${APP_URL}/?canceled=true`,
      continue_success_url: `${APP_URL}/?success=true&provider=aba`,
      return_deeplink: '',
      currency: 'USD',
      custom_fields: '',
      return_params: '',
      payout: '',
      lifetime: '',
      additional_params: '',
      google_pay_token: '',
      skip_success_page: '',
    };

    // ---- 4. Sign it (order matters — matches ABA's docs exactly) ----
    const hashInput =
      fields.req_time +
      fields.merchant_id +
      fields.tran_id +
      fields.amount +
      fields.items +
      fields.shipping +
      fields.firstname +
      fields.lastname +
      fields.email +
      fields.phone +
      fields.type +
      fields.payment_option +
      fields.return_url +
      fields.cancel_url +
      fields.continue_success_url +
      fields.return_deeplink +
      fields.currency +
      fields.custom_fields +
      fields.return_params +
      fields.payout +
      fields.lifetime +
      fields.additional_params +
      fields.google_pay_token +
      fields.skip_success_page;

    const hash = await hmacSha512Base64(hashInput, apiKey);

    // ---- 5. POST the signed request to ABA from the server ----
    // This is the change: instead of handing the fields back to the
    // browser and having the browser POST them, we do it here. That
    // means the browser never has to know what a "signing scheme" is,
    // and there's one less network hop and one less place to leak.
    const formBody = new URLSearchParams({ ...fields, hash });

    const abaRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formBody.toString(),
    });

    const abaJson = await abaRes.json().catch(() => null);
    if (!abaJson) {
      console.error('[create-aba-payment] ABA returned non-JSON:', abaRes.status);
      return json({ error: 'Payment gateway returned an invalid response.' }, 502);
    }

    // ABA returns { status: { code, message }, qrString, qrImage, ... }
    const abaStatus = abaJson?.status;
    if (!abaStatus || abaStatus.code !== '00') {
      console.error('[create-aba-payment] ABA rejected:', abaStatus);
      return json({
        error: abaStatus?.message || 'Payment gateway rejected the request.',
      }, 400);
    }

    // ---- 6. Record the pending transaction so the webhook can find it ----
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error: insertError } = await admin
      .from('aba_transactions')
      .insert({
        tran_id: tranId,
        user_id: user.id,
        plan,
        amount_usd: amountUSD,
        status: 'pending',
      });

    if (insertError) {
      console.error('[create-aba-payment] insert failed:', insertError.message);
      // Not fatal — the QR is already valid. But log it loudly.
    }

    // ---- 7. Return exactly what the frontend needs to render the QR ----
    return json({
      tranId,
      plan,
      amount: amountUSD,
      label,
      qrImage: abaJson.qrImage,               // data:image/png;base64,...
      qrString: abaJson.qrString,
      abapayDeeplink: abaJson.abapay_deeplink,
      appStore: abaJson.app_store,
      playStore: abaJson.play_store,
      abaStatus,
    });
  } catch (err) {
    console.error('[create-aba-payment] unhandled:', err);
    return json({ error: err instanceof Error ? err.message : 'Something went wrong.' }, 500);
  }
});