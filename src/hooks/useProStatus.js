import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Any status in this list counts as "the user should see Pro features".
// 'trialing' is included so a free-trial subscription unlocks Pro too.
const ACTIVE_STATUSES = ['active', 'trialing'];

/**
 * useProStatus()
 * ---------------
 * Reads the signed-in user's row from the `subscriptions` table (there's
 * at most one per user in this app) and returns whether it's currently
 * "Pro". Use this anywhere you need to gate a feature — it always
 * reflects what's actually in the database, which is itself only ever
 * written by the verified Stripe webhook (see
 * supabase/functions/stripe-webhook), never by the client.
 *
 * IMPORTANT — why this file has a module-level "manager" instead of just
 * a plain useEffect:
 *
 * This hook is called from several components at once (App, Sidebar,
 * MobileNav, BillingPanel). Supabase keeps Realtime channels keyed by
 * topic name, so two components independently trying to open
 * `subscriptions-user-<id>` is a guaranteed collision — whichever call
 * loses the race gets handed the other's already-subscribed channel and
 * throws "cannot add postgres_changes callbacks ... after subscribe()".
 *
 * An earlier version of this file fixed that by ref-counting how many
 * components were mounted and tearing the channel down when the count
 * hit zero. That reintroduced the exact same race under React
 * StrictMode: StrictMode mounts every component, then unmounts all of
 * them, then mounts them all again, as one synchronous dance. The
 * ref-count could hit zero (triggering teardown, which reset the
 * "started" flag) while the *original* async setup chain from the first
 * mount was still in flight — so the remount's setup and the stale
 * setup both ended up racing to create a channel with the same name.
 *
 * The fix here removes that coupling entirely: setup runs exactly once
 * per browser tab, guarded by a stored promise (`initPromise`) that is
 * never reset except on an actual sign-out/sign-in. Component mount and
 * unmount only add/remove a listener for state updates — they never
 * touch the channel. That makes a double-subscribe structurally
 * impossible rather than merely unlikely.
 *
 * Returns:
 *   isPro      - boolean, true if status is 'active' or 'trialing'
 *   subscription - the raw row (or null if the user has never subscribed)
 *   loading    - true while the first fetch is in flight
 *   refresh()  - manually re-fetch; call this right after the user
 *                returns from the Stripe redirect so the UI doesn't have
 *                to wait for the realtime event to arrive
 */

// ---- module-level singleton state, shared by every hook instance ----
let state = { subscription: null, loading: true };
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

async function fetchSubscription() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setState({ subscription: null, loading: false });
    return null;
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) console.error('useProStatus: failed to load subscription', error.message);
  setState({ subscription: data ?? null, loading: false });
  // Returned (not just stored) so callers like refreshUntilPro below can
  // act on the result without racing the React state update.
  return data ?? null;
}

/**
 * refreshUntilPro()
 * -----------------
 * Used by App after the Stripe redirect lands on `?success=true`.
 *
 * The redirect and the Stripe webhook are two independent requests. The
 * webhook is what writes the `subscriptions` row, and it frequently
 * arrives a second or three AFTER the browser is already back on the
 * dashboard. A single refetch at page load therefore often reads a row
 * that doesn't exist yet, and the user who just paid sees a still-locked
 * Pro UI — the classic "I paid, nothing happened" support ticket.
 *
 * So poll briefly instead. Realtime is still the long-term backstop: if
 * we give up here, the channel opened in ensureStarted() will flip the
 * UI whenever the row finally shows up.
 *
 * Resolves true if Pro unlocked within the window, false otherwise.
 */
export async function refreshUntilPro({ attempts = 6, delayMs = 1500 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const row = await fetchSubscription();
    if (row && ACTIVE_STATUSES.includes(row.status)) return true;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

// (Re)points the shared channel at `userId`. Always removes any existing
// channel first and awaits that removal before opening the new one, so
// there's never a moment where two channels for the same-shaped topic
// both exist.
async function openChannelFor(userId) {
  if (channel && channelUserId === userId) return; // already correct, nothing to do

  if (channel) {
    await supabase.removeChannel(channel);
    channel = null;
    channelUserId = null;
  }

  channel = supabase
    .channel(`subscriptions-user-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
      () => fetchSubscription()
    )
    .subscribe();
  channelUserId = userId;
}

// Runs the initial fetch + opens the Realtime channel exactly once for
// the lifetime of this module (i.e. the tab). Every call after the first
// just returns the same in-flight/resolved promise — no matter how many
// components call it or how many times they mount/unmount.
function ensureStarted() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await fetchSubscription();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await openChannelFor(user.id);
  })();

  return initPromise;
}

// Keep things correct across sign-out and sign-in (including switching
// accounts in the same tab, e.g. in a shared/test browser) — re-point
// the channel at the new user, or tear it down entirely on sign-out,
// rather than leaving it subscribed to the previous user's row.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT') {
    if (channel) {
      await supabase.removeChannel(channel);
      channel = null;
      channelUserId = null;
    }
    initPromise = null;
    setState({ subscription: null, loading: false });
    return;
  }

  if (event === 'SIGNED_IN' && session?.user && session.user.id !== channelUserId) {
    await fetchSubscription();
    await openChannelFor(session.user.id);
  }
});

export function useProStatus() {
  const [local, setLocal] = useState(state);

  useEffect(() => {
    listeners.add(setLocal);
    ensureStarted();

    return () => {
      listeners.delete(setLocal);
      // Deliberately no channel teardown here — see the comment above
      // `ensureStarted` for why tying the channel's lifecycle to
      // component mount/unmount is what caused the original bug.
    };
  }, []);

  const isPro = !!local.subscription && ACTIVE_STATUSES.includes(local.subscription.status);

  return { isPro, subscription: local.subscription, loading: local.loading, refresh: fetchSubscription };
}