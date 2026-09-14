import { supabase } from './supabaseClient';

// Your Stripe Payment Link for the Pro subscription plan. It's created
// once in the Stripe Dashboard (Payment Links > New) and never changes —
// unlike a Checkout Session, there's no per-user object to create on our
// server, which is what makes this integration so simple. Swap this for
// your live-mode link when you go to production.
export const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/test_28E3cwfmXe753yI1Ew6kg01';

/**
 * Sends the browser to the Payment Link with `client_reference_id` set
 * to the current Supabase user's id. This is the ONLY piece of
 * information that lets our webhook figure out which app user just
 * paid — Stripe echoes it back untouched in the `checkout.session.completed`
 * event as `session.client_reference_id`.
 *
 * Nothing here talks to Stripe's API directly, so there's no secret key
 * anywhere in this file — it's just a URL redirect.
 */
export async function redirectToPaymentLink() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to upgrade.');

  const url = new URL(STRIPE_PAYMENT_LINK);
  url.searchParams.set('client_reference_id', user.id);
  window.location.href = url.toString();
}

// Everything below still goes through our own Edge Function, because
// managing an EXISTING subscription (view invoices, update card, cancel)
// requires calling the Stripe API with the secret key — that can't be a
// plain redirect the way a Payment Link purchase can.
async function callFunction(name, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error || 'Request failed');
  }
  return res.json();
}

export async function redirectToCustomerPortal() {
  const { url } = await callFunction('customer-portal', {
    returnUrl: window.location.origin,
  });
  window.location.href = url;
}
