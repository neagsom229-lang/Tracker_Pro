import { supabase } from './supabaseClient';

async function callFunction(name, body, extraHeaders = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({ error: 'Request failed' }));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const createPlaidLinkToken = () => callFunction('create-plaid-link-token').then((d) => d.link_token);

export const exchangePlaidToken = (publicToken, institutionName) =>
  callFunction('exchange-plaid-token', { public_token: publicToken, institution_name: institutionName });

// No body needed — the function identifies the caller from their JWT
// and syncs only THEIR bank connections (see the "Mode 2" branch in
// sync-bank-transactions).
export const syncBankTransactionsNow = () => callFunction('sync-bank-transactions', {});