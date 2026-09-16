import { supabase } from './supabaseClient';

/**
 * initiateAbaPayment(plan)
 * -------------------------
 * plan: 'monthly' | 'yearly'
 *
 * Note there's no `amount` parameter here, unlike the original spec.
 * The price is decided server-side in create-aba-payment (see the price
 * table there) precisely so this function can't be used to request a
 * cheaper Pro upgrade by passing a smaller number -- there's simply
 * nowhere left in the flow for a tampered amount to enter.
 *
 * WHY THIS BUILDS A REAL <form> INSTEAD OF FOLLOWING A RETURNED URL
 * -------------------------------------------------------------------
 * For `payment_option: 'abapay'`, ABA's Purchase endpoint doesn't hand
 * back a JSON `{ url: ... }` you can redirect to -- posting the signed
 * fields IS the request, and ABA's response to that exact POST is the
 * hosted checkout page (raw HTML), rendered directly. A `fetch()` call
 * can't "redirect the browser" to what it receives; only an actual form
 * submission (or the browser's own navigation) can land the user on a
 * page ABA rendered. So: the Edge Function computes and signs the
 * fields, and this function builds a real hidden <form> with those
 * fields as inputs and calls `.submit()` on it -- the browser then
 * genuinely navigates away from your SPA to ABA's page, the same way it
 * would for a normal link click.
 */
export async function initiateAbaPayment(plan) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again to continue.');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-aba-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Could not start the ABA PayWay checkout. Please try again.');
  }

  const { postUrl, fields } = body;

  // A real <form>, appended to the document and submitted -- not a
  // fetch, not a client-side route change. This is a genuine full-page
  // navigation: the user leaves the Obsidian SPA and lands on ABA's
  // hosted checkout, exactly as if they'd clicked a link to it.
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = postUrl;
  form.style.display = 'none';

  for (const [key, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value ?? '';
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
  // No return value / no cleanup -- the page is navigating away right
  // now, so there's nothing left for this function's caller to do.
}