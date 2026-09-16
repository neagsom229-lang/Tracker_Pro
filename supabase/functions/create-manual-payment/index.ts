// supabase/functions/create-manual-payment/index.ts
//
// Deploy with: supabase functions deploy create-manual-payment
//
// Generates a Bakong KHQR code the user scans with ANY Cambodian banking
// app (ABA Mobile included) to pay for Pro. This uses only YOUR OWN
// Bakong account alias (e.g. "yourname@abaa" — visible in your ABA
// Mobile app under your profile) — not an ABA merchant API key, not a
// merchant account. That's the whole reason this path works without
// ABA's onboarding process.
//
// The amount is fixed here, server-side, from PRO_PRICE_USD — never
// trust a client-supplied amount for something a human will later
// eyeball-match against a real bank transaction.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { BakongKHQR, IndividualInfo } from 'npm:bakong-khqr@1.0.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const amount = Number(Deno.env.get('PRO_PRICE_USD') || '4.99');
    const bakongAccountId = Deno.env.get('BAKONG_ACCOUNT_ID'); // e.g. "yourname@abaa"
    const merchantName = Deno.env.get('BAKONG_MERCHANT_NAME') || 'Obsidian';
    const merchantCity = Deno.env.get('BAKONG_MERCHANT_CITY') || 'Phnom Penh';

    if (!bakongAccountId) {
      console.error('BAKONG_ACCOUNT_ID secret is not set.');
      return jsonResponse({ error: 'Manual payment is not configured yet.' }, 500);
    }

    const individualInfo = new IndividualInfo(bakongAccountId, merchantName, merchantCity, {
      currency: 840, // 840 = USD, 116 = KHR, per the KHQR/EMVCo currency code table
      amount,
      // Bill number ties the QR itself back to a specific pending row,
      // which is a nice-to-have if you ever cross-reference it manually
      // against your ABA transaction history.
      billNumber: `OBS-${Date.now()}`,
      expirationTimestamp: Date.now() + 15 * 60 * 1000, // 15 minutes
    });

    const khqr = new BakongKHQR();
    const result = khqr.generateIndividual(individualInfo);
    if (!result?.data?.qr) {
      console.error('KHQR generation failed:', result);
      return jsonResponse({ error: 'Could not generate a payment QR — try again.' }, 500);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: payment, error: insertError } = await admin
      .from('manual_payments')
      .insert({ user_id: user.id, amount, currency: 'USD', khqr_md5: result.data.md5, status: 'pending' })
      .select('id')
      .single();

    if (insertError) {
      console.error('manual_payments insert failed:', insertError.message);
      return jsonResponse({ error: 'Could not start the payment — try again.' }, 500);
    }

    return jsonResponse({
      paymentId: payment.id,
      qr: result.data.qr, // the raw KHQR payload string — render this as a QR image client-side
      amount,
    });
  } catch (err) {
    console.error('Unexpected error in create-manual-payment:', err.message);
    return jsonResponse({ error: 'Something went wrong — try again.' }, 500);
  }
});