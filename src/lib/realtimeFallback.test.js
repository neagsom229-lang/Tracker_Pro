// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRealtimeFallback } from './realtimeFallback';

const INTERVAL = 20000;

function setVisibility(value) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
}

describe('createRealtimeFallback', () => {
  let warnSpy;
  let infoSpy;
  let instances;

  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility('visible');
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    instances = [];
  });

  afterEach(() => {
    instances.forEach((f) => f.stop());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function make(opts = {}) {
    const refetch = opts.refetch ?? vi.fn().mockResolvedValue(undefined);
    const fallback = createRealtimeFallback({ label: 'test', intervalMs: INTERVAL, refetch, ...opts });
    instances.push(fallback);
    return { fallback, refetch };
  }

  it('does not poll when healthy', async () => {
    const { fallback, refetch } = make();
    fallback.onStatus('SUBSCRIBED');

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);

    expect(refetch).not.toHaveBeenCalled();
    expect(fallback.isLive()).toBe(true);
  });

  it('polls slowly while the channel is down', async () => {
    const { fallback, refetch } = make();
    fallback.onStatus('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refetch).toHaveBeenCalledTimes(2);

    expect(fallback.isLive()).toBe(false);
  });

  it('logs exactly one warning per outage', () => {
    const { fallback } = make();
    fallback.onStatus('CHANNEL_ERROR');
    fallback.onStatus('TIMED_OUT');
    fallback.onStatus('CLOSED');

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('stops polling and does one catch-up fetch on recovery', async () => {
    const { fallback, refetch } = make();
    fallback.onStatus('CHANNEL_ERROR');
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(refetch).toHaveBeenCalledTimes(1);

    fallback.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(0); // let the catch-up fetch run

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(fallback.isLive()).toBe(true);

    await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    expect(refetch).toHaveBeenCalledTimes(2); // polling stopped
  });

  it('skips polling while the tab is hidden and refetches when it becomes visible', async () => {
    setVisibility('hidden');
    const { fallback, refetch } = make();
    fallback.onStatus('CHANNEL_ERROR');

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(refetch).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches immediately on window online while down', async () => {
    const { fallback, refetch } = make();
    fallback.onStatus('CHANNEL_ERROR');

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('ignores every event after stop()', async () => {
    const { fallback, refetch } = make();
    fallback.onStatus('SUBSCRIBED');
    fallback.stop();

    fallback.onStatus('CHANNEL_ERROR');
    fallback.onStatus('SUBSCRIBED');
    await vi.advanceTimersByTimeAsync(INTERVAL * 2);

    expect(refetch).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(fallback.isLive()).toBe(false);
  });

  it('never throws when refetch rejects', async () => {
    const refetch = vi.fn().mockRejectedValue(new Error('network down'));
    const { fallback } = make({ refetch });
    fallback.onStatus('CHANNEL_ERROR');

    let threw = false;
    try {
      await vi.advanceTimersByTimeAsync(INTERVAL * 2);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
