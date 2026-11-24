// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// The hook talks to one module-level singleton, so this file deliberately
// imports it once and runs its tests in order (no vi.resetModules, which
// would give the hook a different React copy than this test file).
const mocks = vi.hoisted(() => {
  const state = {
    subscription: null,
    pendingPayment: null,
    queryError: null,
    statusCallback: null,
    callbacks: [],
  };

  const buildQuery = (table) => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        if (state.queryError) return { data: null, error: state.queryError };
        return {
          data: table === 'subscriptions' ? state.subscription : state.pendingPayment,
          error: null,
        };
      },
    };
    return q;
  };

  return {
    state,
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    channel: vi.fn(() => {
      const ch = {
        on: () => ch,
        subscribe: (cb) => {
          state.callbacks.push(cb);
          state.statusCallback = cb;
          return ch;
        },
      };
      return ch;
    }),
    removeChannel: vi.fn(async () => {}),
    from: vi.fn(buildQuery),
  };
});

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: mocks.auth,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    from: mocks.from,
  },
}));

vi.mock('../api/client', () => ({
  // These tests exercise the Supabase path of useProStatus; forcing the
  // backend flag off makes them pass whether or not the test run sets
  // VITE_DATA_BACKEND=local. (The local path is covered by other tests.)
  isLocalBackend: () => false,
  api: {},
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import { useProStatus } from './useProStatus';

const mounted = [];

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const probe = {};
  function Probe() {
    Object.assign(probe, useProStatus());
    return null;
  }
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  mounted.push({ root, container });
  return probe;
}

beforeEach(() => {
  mocks.state.subscription = {
    id: 'sub-1',
    user_id: 'user-1',
    status: 'active',
    created_at: '2026-01-01',
  };
  mocks.state.pendingPayment = null;
  mocks.state.queryError = null;
  mocks.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  mocks.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mocks.channel.mockClear();
  mocks.removeChannel.mockClear();
  mocks.from.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(async () => {
  for (const view of mounted) {
    await act(async () => {
      view.root.unmount();
    });
    view.container.remove();
  }
  mounted.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useProStatus', () => {
  it('loads Pro and opens exactly one channel', async () => {
    const probe = await mount();

    expect(probe.isPro).toBe(true);
    expect(probe.subscription?.id).toBe('sub-1');
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.channel.mock.calls[0][0]).toContain('user-status-user-1');
    expect(mocks.state.callbacks).toHaveLength(1);

    // A second component using the hook must reuse the singleton channel.
    await mount();
    expect(mocks.channel).toHaveBeenCalledTimes(1);
    expect(mocks.state.callbacks).toHaveLength(1);
  });

  it('keeps isPro true when a refetch fails', async () => {
    const probe = await mount();
    expect(probe.isPro).toBe(true);

    mocks.state.queryError = { message: 'network down', code: '500' };
    await act(async () => {
      await probe.refresh();
    });

    expect(probe.isPro).toBe(true);
    expect(probe.subscription?.id).toBe('sub-1');
  });

  it('clears isPro on a confirmed "no subscription" response', async () => {
    const probe = await mount();

    mocks.state.queryError = null;
    mocks.state.subscription = null;
    await act(async () => {
      await probe.refresh();
    });

    expect(probe.isPro).toBe(false);
    expect(probe.subscription).toBeNull();
  });

  it('polls on CHANNEL_ERROR without removeChannel/re-subscribe, and stops on SUBSCRIBED', async () => {
    await mount();
    const statusCallback = mocks.state.callbacks[0];
    expect(typeof statusCallback).toBe('function');

    const channelCallsBefore = mocks.channel.mock.calls.length;
    vi.useFakeTimers();

    await act(async () => {
      statusCallback('CHANNEL_ERROR');
    });

    expect(mocks.removeChannel).not.toHaveBeenCalled();
    expect(mocks.channel.mock.calls.length).toBe(channelCallsBefore); // no manual re-subscribe

    const callsBefore = mocks.from.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(mocks.from.mock.calls.length).toBeGreaterThan(callsBefore); // fallback polled

    await act(async () => {
      statusCallback('SUBSCRIBED');
    });
    await act(async () => {}); // let the catch-up fetch settle

    const callsAfterRecovery = mocks.from.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mocks.from.mock.calls.length).toBe(callsAfterRecovery); // polling stopped
  });
});
