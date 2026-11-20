import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { createRealtimeFallback } from '../lib/realtimeFallback';

// ============================================================================
// REQUIREMENT (deliberately "less dumb"):
//   "Pro status and notifications are always correct" — NOT
//   "the WebSocket always connects".
// Realtime is a convenience, not a dependency. When the socket is blocked
// (ISP, VPN, ad-blocker, flaky data) the app must stay correct and quiet:
// no wiped Pro status, no toast spam, no channel churn. The fallback in
// src/lib/realtimeFallback.js keeps data correct by polling, and recovers
// automatically when the socket returns.
// ============================================================================

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
 *
 * FAILURE SEMANTICS:
 * A network blip must never look like a real state change. So:
 *  - the user is read from getSession() (local, cached) instead of
 *    getUser() (a network call that can transiently return user:null);
 *  - a failed query keeps the previous subscription/pendingPayment;
 *  - only a successful response — including a confirmed "no row" — may
 *    change those fields;
 *  - a fetch sequence number discards stale in-flight responses.
 */

// ---- module-level singleton state, shared by every hook instance ----
let state = {
  subscription: null,
  pendingPayment: null,
  loading: true,
};
const listeners = new Set();
let channel = null;
let realtimeFallback = null;
let channelUserId = null;
let initPromise = null;
let channelOpenChain = Promise.resolve();
let fetchSeq = 0;
let queryFailureWarned = false;

function notify() {
  for (const listener of listeners) listener(state);
}

function setState(patch) {
  state = { ...state, ...patch };
  notify();
}

async function fetchAll() {
  const seq = ++fetchSeq;

  // Local, cached session. getUser() would be a network call that can
  // transiently resolve to null during a blip and wipe Pro status.
  let user = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  } catch {
    // getSession is local, but if it ever fails: keep previous state.
    return { subscription: state.subscription, pendingPayment: state.pendingPayment };
  }

  if (!user) {
    if (seq !== fetchSeq) return { subscription: state.subscription, pendingPayment: state.pendingPayment };
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

  // A newer fetch started while this one was in flight — its result is
  // stale and must not overwrite the newer one.
  if (seq !== fetchSeq) {
    return { subscription: state.subscription, pendingPayment: state.pendingPayment };
  }

  // Only successful responses change state. A failed query keeps the
  // previous value so a blip cannot look like "Pro revoked".
  const subscription = subsResult.error ? state.subscription : subsResult.data ?? null;

  let pendingPayment = state.pendingPayment;
  if (pendingResult.error) {
    // 42P01 = relation does not exist (older deploy): that's a confirmed
    // "no pending payment", not an outage.
    if (pendingResult.error.code === '42P01') pendingPayment = null;
  } else {
    pendingPayment = pendingResult.data ?? null;
  }

  const hadError =
    !!subsResult.error || (!!pendingResult.error && pendingResult.error.code !== '42P01');
  if (hadError) {
    if (!queryFailureWarned) {
      queryFailureWarned = true;
      const first = subsResult.error || pendingResult.error;
      console.warn('useProStatus: status fetch failed — keeping last known status', first?.message);
    }
  } else {
    queryFailureWarned = false;
  }

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

/**
 * teardownChannel()
 * -----------------
 * Stops the realtime fallback FIRST (so a late CLOSED/CHANNEL_ERROR event
 * from the removal is ignored and cannot start polling), then removes the
 * channel. Safe to call when there is nothing to tear down.
 */
async function teardownChannel() {
  if (realtimeFallback) {
    realtimeFallback.stop();
    realtimeFallback = null;
  }
  if (channel) {
    const existing = channel;
    channel = null;
    channelUserId = null;
    await supabase.removeChannel(existing);
  }
}

/**
 * openChannelsFor(userId)
 * -----------------------
 * (Re)points the shared channel at `userId`.
 *
 * Serialized through a promise chain: two concurrent callers can never both
 * create a channel, even if the first is still awaiting teardown. The
 * per-user guard inside makes duplicate sequential calls a no-op.
 */
function openChannelsFor(userId) {
  const run = async () => {
    if (channel && channelUserId === userId) return; // already correct

    try {
      if (channel) await teardownChannel();

      const fallback = createRealtimeFallback({
        label: 'proStatus',
        refetch: fetchAll,
        intervalMs: 20000,
      });

      const newChannel = supabase
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
        );

      channel = newChannel;
      channelUserId = userId;
      realtimeFallback = fallback;
      newChannel.subscribe(fallback.onStatus);
    } catch (err) {
      console.warn('useProStatus: failed to open realtime channel', err?.message);
    }
  };

  // Run even if a previous link rejected, so one failure cannot wedge the
  // chain forever.
  channelOpenChain = channelOpenChain.then(run, run);
  return channelOpenChain;
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
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    await openChannelsFor(user.id);
  })();

  // Never let a rejected init promise be an unhandled rejection; later
  // calls can still retry because initPromise stays set.
  initPromise.catch(() => {});

  return initPromise;
}

async function handleAuthChange(event, session) {
  if (event === 'SIGNED_OUT') {
    await teardownChannel();
    initPromise = null;
    fetchSeq++; // invalidate any in-flight fetch
    setState({ subscription: null, pendingPayment: null, loading: false });
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    // Only reopen if we're not already watching this user.
    if (session.user.id !== channelUserId) {
      initPromise = null; // reset so ensureStarted runs again
      fetchSeq++; // invalidate any in-flight fetch
      await fetchAll();
      await openChannelsFor(session.user.id);
    }
  }
}

// Keep things correct across sign-out and sign-in (including switching
// accounts in the same tab) — re-point the channel at the new user, or
// tear it down on sign-out, rather than leaving it subscribed to the
// previous user's rows.
//
// The work is deferred with setTimeout(..., 0): awaiting other Supabase
// calls directly inside an onAuthStateChange callback can deadlock the
// auth client (it re-enters the same internal lock).
supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    handleAuthChange(event, session).catch(() => {});
  }, 0);
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
