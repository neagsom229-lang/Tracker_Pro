// supabase/functions/review-manual-payment/index.ts
//
// Deploy with: supabase functions deploy review-manual-payment
//
// The ONLY code path that can move a manual_payments row to 'approved'
// and actually grant Pro. The database trigger (guard_manual_payment_status,
// see migration 005) already blocks a plain client-side update from
// setting status to 'approved'/'rejected' — this function is what's
// allowed to do it, and only after checking the CALLER's own is_admin
// flag server-side. Never trust a client-supplied "I'm an admin" claim;
// always re-derive it from the database using the caller's verified user id.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

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

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Re-derive admin status from the database — never trust a client
    // claim of "I'm an admin" for an action this sensitive.
    const { data: callerProfile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!callerProfile?.is_admin) return jsonResponse({ error: 'Not authorized.' }, 403);

    const { paymentId, decision, proMonths = 1 } = await req.json();
    if (!['approve', 'reject'].includes(decision)) {
      return jsonResponse({ error: 'decision must be "approve" or "reject".' }, 400);
    }

    const { data: payment, error: fetchError } = await admin.from('manual_payments').select('*').eq('id', paymentId).single();
    if (fetchError || !payment) return jsonResponse({ error: 'Payment not found.' }, 404);
    if (payment.status !== 'submitted') {
      return jsonResponse({ error: `This payment is already ${payment.status}.` }, 400);
    }

    const { error: updateError } = await admin
      .from('manual_payments')
      .update({ status: decision === 'approve' ? 'approved' : 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', paymentId);
    if (updateError) {
      console.error('manual_payments update failed:', updateError.message);
      return jsonResponse({ error: 'Could not update that payment — try again.' }, 500);
    }

    if (decision === 'approve') {
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + proMonths);

      // Deliberately NOT a blind upsert-by-user_id: `subscriptions` has
      // no unique constraint on user_id (only on stripe_subscription_id
      // — a user can legitimately have multiple historical rows, e.g.
      // cancel and later resubscribe via Stripe with a new subscription
      // id). An upsert keyed on user_id would either error (no matching
      // constraint for ON CONFLICT to target) or, worse, silently
      // overwrite a real Stripe-sourced row for this same user. Instead:
      // look specifically for THIS user's own manual_aba row (if any)
      // and only ever touch that one.
      const { data: existingManualSub } = await admin
        .from('subscriptions')
        .select('id')
        .eq('user_id', payment.user_id)
        .eq('source', 'manual_aba')
        .maybeSingle();

      const subValues = {
        status: 'active',
        plan_name: 'Pro (ABA PayWay)',
        current_period_end: periodEnd.toISOString(),
        source: 'manual_aba',
        last_event_ts: Math.floor(Date.now() / 1000),
        updated_at: new Date().toISOString(),
      };

      const { error: subError } = existingManualSub
        ? await admin.from('subscriptions').update(subValues).eq('id', existingManualSub.id)
        : await admin.from('subscriptions').insert({ user_id: payment.user_id, ...subValues });

      if (subError) {
        console.error('subscriptions write failed:', subError.message);
        return jsonResponse({ error: 'Payment approved but granting Pro failed — check logs.' }, 500);
      }

      await admin.from('notifications').insert({
        user_id: payment.user_id,
        title: 'Payment approved!',
        message: `You're Pro until ${periodEnd.toLocaleDateString()}. Thanks for paying via ABA PayWay.`,
        type: 'goal_reached',
      });
    } else {
      await admin.from('notifications').insert({
        user_id: payment.user_id,
        title: 'Payment not confirmed',
        message: `We couldn't confirm your ABA PayWay payment. Contact support if you believe this is a mistake.`,
        type: 'info',
      });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('Unexpected error in review-manual-payment:', err.message);
    return jsonResponse({ error: 'Something went wrong — try again.' }, 500);
  }
});