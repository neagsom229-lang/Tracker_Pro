/**
 * realtimeFallback
 * ----------------
 * Realtime is a convenience, not a dependency.
 *
 * supabase-js already reconnects its WebSocket by itself. What it cannot do
 * is tell you "I've been offline for 30s and you may have missed rows". This
 * module is the small, quiet safety net for that gap:
 *
 *   - Healthy (SUBSCRIBED): do nothing. No timers, no listeners.
 *   - Unhealthy (CHANNEL_ERROR / TIMED_OUT / CLOSED): mark down, log ONE
 *     warning for the whole outage, and poll `refetch` on a slow interval —
 *     but only while the tab is visible (a hidden tab must not burn data).
 *   - Recovery (SUBSCRIBED again): stop polling and do exactly one catch-up
 *     refetch so events missed during the outage are applied.
 *   - `online` / tab becoming visible while down: refetch immediately.
 *
 * A failing refetch is swallowed: polling is best-effort and must never
 * throw into the channel callback or a timer.
 *
 * Everything is idempotent and safe to call after stop().
 */
export function createRealtimeFallback({ label = 'channel', refetch, intervalMs = 30000 } = {}) {
  let live = false;
  let down = false;
  let stopped = false;
  let polling = false;
  let pollTimer = null;
  let outageWarned = false;

  const isVisible = () =>
    typeof document === 'undefined' || document.visibilityState !== 'hidden';

  const clearPoll = () => {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const detach = () => {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', handleOnline);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
  };

  // Never throws — a rejected refetch is expected during an outage.
  const safeRefetch = async () => {
    try {
      await refetch();
    } catch {
      // swallow: the next poll / catch-up fetch will try again
    }
  };

  function handleOnline() {
    if (stopped || live || !isVisible()) return;
    safeRefetch();
  }

  function handleVisibility() {
    if (stopped || live) return;
    if (isVisible()) safeRefetch();
  }

  const startPolling = () => {
    if (polling || stopped) return;
    polling = true;

    const tick = async () => {
      if (stopped) return;
      if (isVisible()) await safeRefetch();
      if (!stopped) pollTimer = setTimeout(tick, intervalMs);
    };

    pollTimer = setTimeout(tick, intervalMs);

    if (typeof window !== 'undefined') window.addEventListener('online', handleOnline);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
  };

  const stopPolling = () => {
    polling = false;
    clearPoll();
    detach();
  };

  return {
    /** Called directly as the Supabase channel's subscribe callback. */
    onStatus(status) {
      if (stopped) return;

      if (status === 'SUBSCRIBED') {
        const wasDown = down;
        live = true;
        down = false;
        stopPolling();
        outageWarned = false;
        if (wasDown) {
          console.info(`[realtime:${label}] connection restored — live updates resumed`);
          safeRefetch(); // catch up on anything missed while polling
        }
        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        live = false;
        down = true;
        if (!outageWarned) {
          outageWarned = true;
          console.warn(
            `[realtime:${label}] live updates unavailable (${status}) — polling every ${Math.round(intervalMs / 1000)}s while the tab is visible`
          );
        }
        startPolling();
      }
    },

    stop() {
      stopped = true;
      stopPolling();
    },

    isLive() {
      return live && !stopped;
    },
  };
}
