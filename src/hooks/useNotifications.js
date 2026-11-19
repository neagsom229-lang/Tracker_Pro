import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { useStore, selectUnreadCount } from '../store/useStore';

/**
 * useNotifications()
 * ------------------
 * Keeps the bell live. The initial list is loaded once by `initData`;
 * this hook's only job is to subscribe to INSERTs on `notifications` so a
 * row written by the daily-digest Edge Function appears without a refresh.
 *
 * WHY THE CHANNEL NAME HAS AN INSTANCE SUFFIX
 * -------------------------------------------
 * Supabase keys Realtime channels by topic name. Opening two channels
 * with the same topic throws "cannot add postgres_changes callbacks after
 * subscribe()" — which is exactly what React StrictMode causes in
 * development, since it mounts, unmounts and remounts every component
 * while the first subscribe is still in flight. useProStatus solved this
 * with a module-level singleton because four components share it; here
 * only the bell subscribes, so the lighter fix is a per-instance topic
 * name. Both approaches make the collision structurally impossible
 * rather than merely unlikely.
 *
 * RLS applies to Realtime too: the filter below is a performance hint,
 * not the security boundary. A user could not receive another user's
 * notification even if this filter were wrong.
 */

let instanceCounter = 0;

export function useNotifications() {
  const notifications = useStore((s) => s.notifications);
  const userId = useStore((s) => s.session?.id);
  const receiveNotification = useStore((s) => s.receiveNotification);
  const markNotificationRead = useStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useStore((s) => s.markAllNotificationsRead);

  const instanceId = useRef(null);
  if (instanceId.current === null) instanceId.current = ++instanceCounter;

  useEffect(() => {
    if (!userId) return;

    let attempts = 0;
    const maxAttempts = 3;
    const backoffs = [1000, 5000, 30000];
    let currentChannel = null;
    let isMounted = true;
    let timeoutId = null;

    const subscribeChannel = () => {
      if (!isMounted) return;

      currentChannel = supabase
        .channel(`notifications-${userId}-${instanceId.current}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new;
            receiveNotification({
              id: row.id,
              title: row.title,
              message: row.message,
              type: row.type,
              read: row.read,
              createdAt: row.created_at,
            });
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[realtime:notifications]', status, err);
            if (currentChannel) {
              supabase.removeChannel(currentChannel);
            }
            attempts++;
            if (attempts < maxAttempts && isMounted) {
              const delay = backoffs[attempts - 1] || 30000;
              timeoutId = setTimeout(subscribeChannel, delay);
            } else if (attempts >= maxAttempts && isMounted) {
              toast.error('Live updates unavailable — refresh to retry.');
            }
          }
        });
    };

    subscribeChannel();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
      }
    };
  }, [userId, receiveNotification]);

  const unreadCount = useMemo(() => selectUnreadCount(notifications), [notifications]);

  return { notifications, unreadCount, markNotificationRead, markAllNotificationsRead };
}