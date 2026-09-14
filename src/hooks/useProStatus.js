import { useCallback, useEffect, useState } from 'react';
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
 * It also opens a Supabase Realtime subscription on the `subscriptions`
 * table, so if the webhook updates the row while this component is
 * mounted (e.g. the user pays in another tab, or a renewal fails), the
 * UI updates within a second or two with no polling and no manual
 * refresh needed.
 *
 * Returns:
 *   isPro      - boolean, true if status is 'active' or 'trialing'
 *   subscription - the raw row (or null if the user has never subscribed)
 *   loading    - true while the first fetch is in flight
 *   refresh()  - manually re-fetch; call this right after the user
 *                returns from the Stripe redirect so the UI doesn't have
 *                to wait for the realtime event to arrive
 */
export function useProStatus() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) console.error('useProStatus: failed to load subscription', error.message);
    setSubscription(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let channel;

    // Realtime filters need the user id up front, so we resolve the
    // user once, then fetch AND subscribe scoped to just their row.
    supabase.auth.getUser().then(({ data: { user } }) => {
      fetchSubscription();
      if (!user) return;

      channel = supabase
        .channel(`subscriptions-user-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
          () => fetchSubscription()
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchSubscription]);

  const isPro = !!subscription && ACTIVE_STATUSES.includes(subscription.status);

  return { isPro, subscription, loading, refresh: fetchSubscription };
}
