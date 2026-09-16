// supabase/functions/notify-admin-payment/index.ts
//
// Deploy with: supabase functions deploy notify-admin-payment --no-verify-jwt
//
// NOT called by the client directly. Wire it up as a no-code Supabase
// Database Webhook instead (Dashboard -> Database -> Webhooks):
//   Table: manual_payments
//   Events: Update
//   Type: HTTP Request -> your project's Edge Function URL for this function
//   HTTP Headers: x-cron-secret: <your CRON_SECRET>
//
// Using a Database Webhook rather than having the client call this
// function after submitting proof is deliberate: a webhook fires
// reliably from Postgres itself the instant the row changes, so it
// still fires even if the user's browser tab closes the moment they hit
// submit. A client-triggered call would silently never happen in that
// case — the one situation where reliability matters most (you not
// finding out about a real payment) is exactly the one a client-side
// call can't guarantee.
//
// --no-verify-jwt because Database Webhooks don't carry a user session
// (there's no "user" involved — Postgres itself is calling this). Auth
// here is the shared x-cron-secret header instead, reusing the same
// pattern as sync-bank-transactions' scheduled mode.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'Invalid secret.' }), { status: 401 });
  }

  try {
    const payload = await req.json();
    const record = payload.record;
    const oldRecord = payload.old_record;

    // Only act on the pending -> submitted transition, not every update
    // to this table (e.g. the eventual approve/reject writes would also
    // fire this webhook otherwise).
    if (record?.status !== 'submitted' || oldRecord?.status !== 'pending') {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: payer } = await admin.from('profiles').select('email, display_name').eq('id', record.user_id).single();
    const payerLabel = payer?.display_name || payer?.email || record.user_id;

    // 1. Email — sent to a fixed address regardless of DB state, so the
    // very first payment (before you've bootstrapped any is_admin
    // profile at all) still reaches you.
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const adminEmail = Deno.env.get('ADMIN_EMAIL');
    if (resendKey && adminEmail) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('RESEND_FROM') || 'Obsidian <onboarding@resend.dev>',
          to: adminEmail,
          subject: `Payment claim: ${payerLabel} — $${record.amount}`,
          text: [
            `${payerLabel} claims they paid $${record.amount} via ABA PayWay / Bakong KHQR.`,
            `Claimed transaction reference: ${record.claimed_transaction_ref || '(none provided)'}`,
            record.screenshot_path ? `Screenshot uploaded: ${record.screenshot_path}` : 'No screenshot uploaded.',
            '',
            `Check your ABA account for this transaction, then approve or reject it in the app's Admin panel.`,
            `Payment ID: ${record.id}`,
          ].join('\n'),
        }),
      });
      if (!emailRes.ok) console.error('Resend email failed:', emailRes.status, await emailRes.text());
    } else {
      console.warn('RESEND_API_KEY or ADMIN_EMAIL not set — skipping email, relying on in-app notification only.');
    }

    // 2. In-app notification — for anyone already marked is_admin, using
    // the notifications table/bell already built into the app.
    const { data: admins } = await admin.from('profiles').select('id').eq('is_admin', true);
    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map((a) => ({
          user_id: a.id,
          title: 'New payment to review',
          message: `${payerLabel} claims they paid $${record.amount} via ABA PayWay.`,
          type: 'info',
        }))
      );
    }

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Unexpected error in notify-admin-payment:', err.message);
    return new Response(JSON.stringify({ error: 'Something went wrong.' }), { status: 500 });
  }
});