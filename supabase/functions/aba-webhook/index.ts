// supabase/functions/aba-webhook/index.ts
//
// Deploy: supabase functions deploy aba-webhook --no-verify-jwt
// (ABA calls this server-to-server with no Supabase session -- same
// reasoning as stripe-webhook in this project.)
//
// WHY THIS DOESN'T TRUST THE INCOMING BODY'S STATUS FIELD
// ----------------------------------------------------------
// The publicly-documented shape of ABA's pushback notification is thin
// and, in some integration guides, described as an unauthenticated
// header (`X-PayWay-HMAC-SHA512`) whose exact contents aren't something
// I can verify against ABA's own docs with full confidence. Rather than
// gate Pro access on a signature scheme I'm not certain of, this
// function uses the incoming request for exactly one thing -- learning
// which `tran_id` to ask about -- and then makes its OWN
// server-to-server call to ABA's documented "Check transaction" API,
// signed with our own hash, to get the authoritative status directly
// from ABA. An attacker who POSTs a forged "success" here gains
// nothing: we don't act on anything they sent except an id, and we
// verify that id's real status ourselves. If you later confirm the
// exact webhook signature header ABA sends in your sandbox, add it as
// a first-pass fast rejection -- the Check Transaction call underneath
// stays either way, since it's the actual source of truth.
//
// WHY user_id COMES FROM OUR OWN TABLE, NOT FROM THE PAYLOAD
// -------------------------------------------------------------
// We stored tran_id -> user_id ourselves, before ever calling ABA (see
// create-aba-payment). Looking it up here means we never have to trust
// custom_fields or return_params surviving the round trip unmodified.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

function pad(n: number, width = 2) {
  return String(n).padStart(width, '0');
}
function reqTimeUTC(): string {
  const d = new Date();
  return (
    d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds())
  );
}
async function hmacSha512Base64(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

const PLAN_PERIOD_DAYS: Record<string, number> = { monthly: 30, yearly: 365 };
const PLAN_LABEL: Record<string, string> = { monthly: 'Obsidian Pro (Monthly, ABA PayWay)', yearly: 'Obsidian Pro (Yearly, ABA PayWay)' };

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const merchantId = Deno.env.get('ABA_MERCHANT_ID')!;
  const apiKey = Deno.env.get('ABA_API_KEY')!;
  const apiUrl = Deno.env.get('ABA_API_URL')!; // same purchase host; check-transaction is a sibling path
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ABA's pushback may arrive as form-encoded or JSON depending on
    // integration mode -- read the raw text and try both rather than
    // assuming one and 500ing on the other.
    const raw = await req.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = Object.fromEntries(new URLSearchParams(raw));
    }

    const tranId = String(payload.tran_id ?? '');
    if (!tranId) {
      console.error('aba-webhook: no tran_id in payload', raw.slice(0, 500));
      return new Response('OK', { status: 200 }); // nothing to act on; don't make ABA retry forever
    }

    // ---- Look up OUR OWN record of this transaction --------------------
    const { data: txn, error: txnError } = await admin
      .from('aba_transactions')
      .select('user_id, plan, amount_usd, status')
      .eq('tran_id', tranId)
      .maybeSingle();

    if (txnError || !txn) {
      console.error('aba-webhook: unknown tran_id', tranId, txnError?.message);
      return new Response('OK', { status: 200 });
    }
    if (txn.status === 'completed') {
      return new Response('OK', { status: 200 }); // already processed -- webhooks can be delivered more than once
    }

    // ---- Ask ABA directly what actually happened -----------------------
    // Check Transaction's documented hash is over just these three
    // fields, keyed the same way as the Purchase hash (HMAC-SHA512 with
    // the API key, base64-encoded).
    const checkReqTime = reqTimeUTC();
    const checkHashInput = checkReqTime + merchantId + tranId;
    const checkHash = await hmacSha512Base64(checkHashInput, apiKey);

    // Purchase and Check Transaction are sibling endpoints under the
    // same API root -- swap the last path segment rather than requiring
    // a second secret just for this URL.
    const checkUrl = apiUrl.replace(/\/purchase$/, '/check-transaction');

    const checkRes = await fetch(checkUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ req_time: checkReqTime, merchant_id: merchantId, tran_id: tranId, hash: checkHash }),
    });
    const checkBody = await checkRes.json().catch(() => ({}));

    // ABA's status code for "approved" is documented as "0" on some
    // endpoints and "00" on others in different parts of their docs --
    // check both, and log the raw response so a sandbox mismatch is
    // visible in your function logs rather than silently swallowed.
    const statusCode = String(checkBody?.status?.code ?? checkBody?.status ?? '');
    const approved = statusCode === '0' || statusCode === '00' || checkBody?.data?.payment_status === 'APPROVED';

    if (!checkRes.ok || !approved) {
      console.log('aba-webhook: transaction not approved yet', tranId, JSON.stringify(checkBody));
      return new Response('OK', { status: 200 }); // not an error -- just not paid (yet, or ever)
    }

    // ---- Grant Pro, the same way every other provider does ------------
    const periodDays = PLAN_PERIOD_DAYS[txn.plan] ?? 30;
    const currentPeriodEnd = new Date(Date.now() + periodDays * 86_400_000).toISOString();

    const { error: subError } = await admin.from('subscriptions').insert({
      user_id: txn.user_id,
      source: 'aba',
      status: 'active',
      plan_name: PLAN_LABEL[txn.plan] ?? 'Obsidian Pro (ABA PayWay)',
      current_period_end: currentPeriodEnd,
      stripe_customer_id: null,
      stripe_subscription_id: null,
    });
    if (subError) {
      console.error('aba-webhook: failed to write subscription', subError.message);
      return new Response('Internal error', { status: 500 }); // worth a retry from ABA's side
    }

    await admin
      .from('aba_transactions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('tran_id', tranId);

    // Best-effort -- a missing notification shouldn't fail the whole
    // webhook when the part that actually matters (granting Pro) already
    // succeeded.
    await admin.from('notifications').insert({
      user_id: txn.user_id,
      type: 'system',
      title: 'Payment confirmed',
      message: `Your ${txn.plan} Pro payment via ABA PayWay was confirmed. Welcome to Pro!`,
      dedupe_key: `aba-payment:${tranId}`,
    }).select().maybeSingle().then(() => {}, () => {});

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('aba-webhook failed', err);
    return new Response('Internal error', { status: 500 });
  }
});