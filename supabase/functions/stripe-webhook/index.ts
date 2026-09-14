// supabase/functions/stripe-webhook/index.ts
//
// Deploy with:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// --no-verify-jwt is required because Stripe calls this endpoint
// directly — it has no Supabase user session or auth token to send.
// Supabase's default "reject requests without a valid JWT" check must be
// switched off for this one function. We authenticate the request a
// DIFFERENT way instead: verifying the Stripe-Signature header below,
// which only Stripe (holding your webhook signing secret) could produce.
//
// WHY a webhook at all, instead of trusting the browser's redirect back
// to our app after payment?
// Stripe Checkout / Payment Links redirect the user's BROWSER to your
// success URL — but a browser redirect is not proof that payment
// actually succeeded (a user could type that URL in manually, or the
// payment could still be processing). The webhook is a server-to-server
// call FROM Stripe, cryptographically signed, and it's the only signal
// this app treats as authoritative for "this user is now Pro".

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
// The Node Stripe library, loaded via Deno's npm: specifier as requested.
// It needs two Deno-specific adjustments to work outside Node:
//   1. `httpClient: Stripe.createFetchHttpClient()` — Deno doesn't have
//      Node's `http`/`https` modules that Stripe's SDK uses by default.
//   2. A SubtleCryptoProvider, passed into `constructEventAsync` — Deno
//      doesn't have Node's synchronous `crypto` module either, so
//      signature verification has to happen via the async Web Crypto API.
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Service-role client: bypasses RLS. Safe here because this whole
// function's identity check IS the Stripe signature verification below —
// by the time we touch the database, we've already proven the request
// really came from Stripe.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Pulls a human-friendly plan name off a Stripe subscription's first
// line item. Falls back to the Price id if no nickname was set on the
// Price in the Stripe Dashboard.
function extractPlanName(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  return item?.price?.nickname ?? item?.price?.id ?? null;
}

function isoOrNull(unixSeconds: number | null | undefined): string | null {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

/**
 * The single write-path for the `subscriptions` table. Every event
 * handler below funnels into this function, which:
 *  - Ignores the event if we've already applied a NEWER event for this
 *    subscription (handles Stripe's "no delivery order guarantee").
 *  - Upserts on `stripe_subscription_id`, so a duplicate/retried
 *    delivery of the same event just re-writes the same values instead
 *    of creating a second row.
 *  - Falls back to whatever is already stored for any field it wasn't
 *    given, so e.g. `invoice.payment_failed` (which only tells us the
 *    new status) doesn't null out the plan name or period end.
 */
async function upsertSubscriptionStatus(params: {
  subscriptionId: string;
  customerId?: string | null;
  userId?: string | null;
  status: string;
  planName?: string | null;
  currentPeriodEnd?: string | null;
  eventCreated: number; // unix seconds from event.created
}) {
  const { subscriptionId, eventCreated } = params;

  const { data: existing } = await admin
    .from('subscriptions')
    .select('*')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (existing && existing.last_event_ts > eventCreated) {
    console.log(`Ignoring out-of-order event for subscription ${subscriptionId} (already have a newer one).`);
    return;
  }

  const resolvedUserId = params.userId ?? existing?.user_id;
  const resolvedCustomerId = params.customerId ?? existing?.stripe_customer_id;

  if (!resolvedUserId || !resolvedCustomerId) {
    // This should only happen if a subscription-lifecycle event arrives
    // before the very first `checkout.session.completed` for that
    // customer has been processed — Stripe will retry failed/ignored
    // webhooks, and by the next retry the link will normally exist.
    console.error(`No known user/customer link for subscription ${subscriptionId} yet — skipping.`);
    return;
  }

  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: resolvedUserId,
      stripe_customer_id: resolvedCustomerId,
      stripe_subscription_id: subscriptionId,
      status: params.status,
      plan_name: params.planName ?? existing?.plan_name ?? null,
      current_period_end: params.currentPeriodEnd ?? existing?.current_period_end ?? null,
      last_event_ts: eventCreated,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' }
  );

  if (error) console.error(`Failed to upsert subscription ${subscriptionId}:`, error.message);
}

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();

  let event: Stripe.Event;
  try {
    // constructEventAsync (rather than the sync constructEvent) plus the
    // SubtleCryptoProvider is what makes signature verification work on
    // Deno. This throws if the signature doesn't match — i.e. the
    // request didn't actually come from Stripe — which is what makes it
    // safe to leave this endpoint publicly reachable.
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // Fires once, right after a successful Payment Link / Checkout
      // payment. This is the ONLY event that carries `client_reference_id`,
      // which is how we find out which Supabase user just paid.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!userId) {
          console.error('checkout.session.completed had no client_reference_id — cannot link this payment to a user.');
          break;
        }
        if (!subscriptionId) break; // e.g. a one-time payment, not a subscription

        // Remember which Stripe customer this Supabase user is, so
        // future subscription-lifecycle events (which only mention the
        // customer, not the user) can be resolved back to them.
        const { error: linkError } = await admin
          .from('stripe_customers')
          .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: 'user_id' });
        if (linkError) console.error('Failed to link stripe customer:', linkError.message);

        // Fetch the full subscription so we get its current status,
        // plan, and renewal date — the checkout session itself doesn't
        // include those details.
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        await upsertSubscriptionStatus({
          subscriptionId,
          customerId,
          userId,
          status: subscription.status,
          planName: extractPlanName(subscription),
          currentPeriodEnd: isoOrNull(subscription.current_period_end),
          eventCreated: event.created,
        });
        break;
      }

      // Fires on renewals, plan changes, cancellations-at-period-end,
      // reactivations, etc. — anything that changes the subscription's
      // status without fully deleting it.
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: link } = await admin
          .from('stripe_customers')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        await upsertSubscriptionStatus({
          subscriptionId: subscription.id,
          customerId,
          userId: link?.user_id ?? null,
          status: subscription.status,
          planName: extractPlanName(subscription),
          currentPeriodEnd: isoOrNull(subscription.current_period_end),
          eventCreated: event.created,
        });
        break;
      }

      // Fires when a subscription is fully canceled (immediately, or at
      // the end of the billing period once that period ends).
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscriptionStatus({
          subscriptionId: subscription.id,
          customerId: subscription.customer as string,
          status: 'canceled',
          currentPeriodEnd: isoOrNull(subscription.current_period_end),
          eventCreated: event.created,
        });
        break;
      }

      // Fires when a renewal payment fails (expired card, insufficient
      // funds, etc.). We mark the row `past_due` so the app can choose
      // to restrict Pro features until the card is fixed, without
      // waiting for Stripe to eventually cancel the subscription outright.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break; // not a subscription invoice

        await upsertSubscriptionStatus({
          subscriptionId,
          status: 'past_due',
          eventCreated: event.created,
        });
        break;
      }

      default:
        // Stripe sends dozens of event types; we only care about the
        // ones above. Everything else is safely ignored.
        break;
    }
  } catch (err) {
    // A failure HERE (e.g. a transient Supabase outage) should make
    // Stripe retry the webhook later, so we return a 500 rather than
    // swallowing the error as a 200.
    console.error('Error handling webhook event:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
