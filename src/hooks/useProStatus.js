import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Any status in this list counts as "the user should see Pro features".
// 'trialing' is included so a free-trial subscription unlocks Pro too.
// 'aba_manual' is not a status — it's a payment_provider value; the
// provider column tells us which checkout the user came through, so
// BillingPanel can show the right "Manage" affordance.
const ACTIVE_STATUSES = ['active', 'trialing'];

/**
 * useProStatus()
 * ---------------
 * Reads the signed-in user's latest `subscriptions` row and their latest
 * `manual_payments` row in parallel. Returns:
 *
 *   isPro             — true if a subscriptions row has an active status
 *   subscription      — the subscriptions row (or null)
 *   isPendingReview   — true if a manual_payments row is 'pending' and no
 *                       active subscription exists yet (i.e. user paid,
 *                       we haven't approved yet)
 *   pendingPayment    — the pending manual_payments row (or null)
 *   loading           — true while first fetch is in flight
 *   refresh()         — manual re-fetch
 *
 * WHY TWO TABLES:
 * The Stripe flow writes to `subscriptions` directly. The ABA manual flow
 * writes to `manual_payments` first; only after admin approval does a
 * `subscriptions` row appear. Without watching both, the ABA user sees a
 * frozen "Pro locked" UI for hours — they can't tell whether their payment
 * went through.
 *
 * WHY THE MODULE-LEVEL SINGLETON:
 * This hook is called from several components at once (App, Sidebar,
 * MobileNav, BillingPanel). Supabase Realtime channels are keyed by topic
 * name, so two components independently opening
 * `subscriptions-user-<id>` is a guaranteed collision. A per-component
 * useEffect would race. Instead: one channel per tab, keyed by user id,
 * with component mount/unmount only adding/removing a state listener.
 * This survives React 18 StrictMode's mount/unmount/mount dance cleanly.
 */

// ---- module-level singleton state, shared by every hook instance ----
let state = {
  subscription: null,
  pendingPayment: null,
  loading: true,
};
const listeners = new Set();
let channel = null;
let channelUserId = null;
let initPromise = null;

function notify() {
  for (const listener of listeners) listener(state);
}

function setState(patch) {
  state = { ...state, ...patch };
  notify();
}

async function fetchAll() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setState({ subscription: null, pendingPayment: null, loading: false });
    return { subscription: null, pendingPayment: null };
  }

  // Fetch both in parallel — the user either has a live subscription, a
  // pending manual payment, or neither. These two queries are independent
  // and cheap.
  const [subsResult, pendingResult] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('manual_payments')
      .select('id, plan, amount_usd, reference, status, created_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (subsResult.error) {
    console.error('useProStatus: subscriptions fetch failed', subsResult.error.message);
  }
  if (pendingResult.error) {
    // Table might not exist yet on older deploys — degrade gracefully.
    if (pendingResult.error.code !== '42P01') {
      console.error('useProStatus: manual_payments fetch failed', pendingResult.error.message);
    }
  }

  const subscription = subsResult.data ?? null;
  const pendingPayment = pendingResult.data ?? null;

  setState({ subscription, pendingPayment, loading: false });
  return { subscription, pendingPayment };
}

/**
 * refreshUntilPro()
 * -----------------
 * Used after the Stripe or ABA redirect lands on `?success=true`.
 *
 * The redirect and the webhook are two independent requests. The webhook
 * writes the `subscriptions` row and often arrives a second or two AFTER
 * the browser is back on the dashboard. A single refetch at page load
 * therefore reads "no subscription yet" and the just-paid user sees a
 * locked UI — the classic "I paid, nothing happened" ticket.
 *
 * So poll briefly. Realtime is still the long-term backstop: if we give
 * up here, the channel will flip the UI whenever the row finally shows.
 * Resolves true if Pro unlocked within the window, false otherwise.
 */
export async function refreshUntilPro({ attempts = 6, delayMs = 1500 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const { subscription } = await fetchAll();
    if (subscription && ACTIVE_STATUSES.includes(subscription.status)) return true;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

// (Re)points the shared channel(s) at `userId`. Always removes any
// existing channel first and awaits removal before opening new ones, so
// there's never a moment where two channels for the same topic exist.
async function openChannelsFor(userId) {
  if (channel && channelUserId === userId) return; // already correct

  if (channel) {
    await supabase.removeChannel(channel);
    channel = null;
    channelUserId = null;
  }

  // Watch BOTH tables under a single channel name so we don't have
  // multiple concurrent subscriptions. Any change to either table
  // (subscription approved, manual payment created) triggers a fresh
  // fetch that updates both fields.
  channel = supabase
    .channel(`user-status-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
      () => fetchAll()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'manual_payments', filter: `user_id=eq.${userId}` },
      () => fetchAll()
    )
    .subscribe();
  channelUserId = userId;
}

// Runs the initial fetch + opens Realtime channels exactly once for the
// tab. Every subsequent call returns the same in-flight/resolved promise
// — no matter how many components call it or how many times they
// mount/unmount.
function ensureStarted() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await fetchAll();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await openChannelsFor(user.id);
  })();

  return initPromise;
}

// Keep things correct across sign-out and sign-in (including switching
// accounts in the same tab) — re-point the channel at the new user, or
// tear it down on sign-out, rather than leaving it subscribed to the
// previous user's rows.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    if (channel) {
      await supabase.removeChannel(channel);
      channel = null;
      channelUserId = null;
    }
    initPromise = null;
    setState({ subscription: null, pendingPayment: null, loading: false });
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    // Only reopen if we're not already watching this user.
    if (session.user.id !== channelUserId) {
      initPromise = null;      // reset so ensureStarted runs again
      await fetchAll();
      await openChannelsFor(session.user.id);
    }
  }
});

export function useProStatus() {
  const [local, setLocal] = useState(state);

  useEffect(() => {
    listeners.add(setLocal);
    ensureStarted();

    return () => {
      listeners.delete(setLocal);
      // Deliberately no channel teardown — the singleton outlives the
      // component; teardown happens only on sign-out (see auth listener).
    };
  }, []);

  const isPro = !!local.subscription && ACTIVE_STATUSES.includes(local.subscription.status);

  // A user has a pending review when:
  //  - they have a manual_payments row in 'pending' status
  //  - they don't already have an active subscription (i.e. they're
  //    between paying and being approved)
  const isPendingReview =
    !isPro && !!local.pendingPayment && local.pendingPayment.status === 'pending';

  return {
    isPro,
    subscription: local.subscription,
    isPendingReview,
    pendingPayment: local.pendingPayment,
    loading: local.loading,
    refresh: fetchAll,
  };
}