import { supabase } from './supabaseClient';

/**
 * Calls the parse-transaction Edge Function with the user's own access
 * token (same pattern as callFunction() in stripe.js) and returns the
 * validated { description, amount, category, date } shape, or throws
 * with a message that's already safe/friendly to show the user directly
 * — the Edge Function itself is responsible for never leaking internal
 * details into its error responses.
 */
export async function parseTransactionText(text) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-transaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ text }),
  });

  const data = await res.json().catch(() => ({ error: 'Something went wrong — try again.' }));
  if (!res.ok) throw new Error(data.error || 'Something went wrong — try again.');
  return data; // { description, amount, category, date }
}

/**
 * Same idea as parseTransactionText, but for a receipt photo. `imageBase64`
 * must be a full data URL (e.g. `data:image/jpeg;base64,...`), which is
 * exactly what ReceiptScanner.jsx's canvas export produces.
 */
export async function parseReceiptImage(imageBase64) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-receipt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ imageBase64 }),
  });

  const data = await res.json().catch(() => ({ error: 'Something went wrong — try again.' }));
  if (!res.ok) throw new Error(data.error || 'Something went wrong — try again.');
  return data; // { description, amount, category, date }
}