import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { dataProvider } from '../lib/dataProvider';
import { createRealtimeFallback } from '../lib/realtimeFallback';
import { useStore, selectUnreadCount } from '../store/useStore';
import { api, isLocalBackend } from '../api/client';

/**
 * useNotifications()
 * ------------------
 * Keeps the bell live. The initial list is loaded once by `initData`;
 * this hook's only job is to subscribe to INSERTs on `notifications` so a
 * row written by the daily-digest Edge Function appears without a refresh.
 *
 * When Realtime is unavailable the fallback polls
 * `dataProvider.getNotifications(userId)` (oldest-first into
 * receiveNotification, which de-dupes by id) so a notification still shows
 * up within a minute — silently, with no toast spam.
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

    if (isLocalBackend()) {
      // Local mode: poll GET /api/notifications every 60s (api rows are
      // already in the store shape; receiveNotification de-dupes by id).
      const refetch = async () => {
        const rows = await api.notifications.get();
        for (let i = rows.length - 1; i >= 0; i--) receiveNotification(rows[i]);
      };
      void refetch();
      const timerId = setInterval(refetch, 60000);
      return () => clearInterval(timerId);
    }

    let currentChannel = null;

    const fallback = createRealtimeFallback({
      label: 'notifications',
      intervalMs: 60000,
      refetch: async () => {
        const rows = await dataProvider.getNotifications(userId);
        // Oldest-first: receiveNotification prepends each row, so feeding
        // oldest → newest leaves the list in its intended newest-first
        // order. De-dup by id makes repeats harmless.
        for (let i = rows.length - 1; i >= 0; i--) {
          receiveNotification(rows[i]);
        }
      },
    });

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
      .subscribe(fallback.onStatus);

    return () => {
      // Stop the fallback before removing the channel: the removal can
      // emit CLOSED, and a stopped fallback must ignore it rather than
      // start polling during teardown.
      fallback.stop();
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
      }
    };
  }, [userId, receiveNotification]);

  const unreadCount = useMemo(() => selectUnreadCount(notifications), [notifications]);

  return { notifications, unreadCount, markNotificationRead, markAllNotificationsRead };
}
