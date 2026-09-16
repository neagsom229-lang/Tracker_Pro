import { supabase } from './supabaseClient';

async function callFunction(name, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({ error: 'Request failed' }));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Starts a new pending manual payment and gets back a KHQR payload
// string to render as a QR code (see UpgradeModal.jsx for the `qrcode`
// rendering — this function only handles the data, not the image).
export const createManualPayment = () => callFunction('create-manual-payment');

// Called once the user has actually paid: uploads their optional
// screenshot to the private payment-proofs bucket (path prefixed with
// their own user id, matching the storage RLS policy from migration 005)
// and moves the payment row from 'pending' to 'submitted' — a plain
// client-side update is fine here (see the guard trigger for why this
// can't be abused to self-approve).
export async function submitPaymentProof(paymentId, { transactionRef, screenshotFile }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let screenshotPath = null;
  if (screenshotFile) {
    screenshotPath = `${user.id}/${paymentId}-${screenshotFile.name}`;
    const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(screenshotPath, screenshotFile, { upsert: true });
    if (uploadError) throw new Error(`Could not upload that screenshot: ${uploadError.message}`);
  }

  const { error } = await supabase
    .from('manual_payments')
    .update({
      status: 'submitted',
      claimed_transaction_ref: transactionRef || null,
      screenshot_path: screenshotPath,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', paymentId);
  if (error) throw new Error(error.message);
}

// ---------------- Admin-only ----------------

export async function getSubmittedPayments() {
  const { data, error } = await supabase
    .from('manual_payments')
    .select('id, user_id, amount, currency, status, claimed_transaction_ref, screenshot_path, submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true });
  if (error) throw new Error(error.message);

  // A second query for payer emails — kept separate rather than a join,
  // since Supabase's JS client doesn't do arbitrary cross-table joins
  // without a defined foreign-table relationship being selected explicitly.
  const userIds = [...new Set(data.map((p) => p.user_id))];
  const { data: profiles } = await supabase.from('profiles').select('id, email, display_name').in('id', userIds.length ? userIds : ['']);
  const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  return data.map((p) => ({
    id: p.id,
    userId: p.user_id,
    payerLabel: profileById[p.user_id]?.display_name || profileById[p.user_id]?.email || p.user_id,
    amount: p.amount,
    currency: p.currency,
    claimedTransactionRef: p.claimed_transaction_ref,
    screenshotPath: p.screenshot_path,
    submittedAt: p.submitted_at,
  }));
}

export async function getPaymentProofUrl(path) {
  const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const reviewManualPayment = (paymentId, decision) => callFunction('review-manual-payment', { paymentId, decision });