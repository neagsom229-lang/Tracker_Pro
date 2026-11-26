import { describe, it, expect } from 'vitest';
import {
  MANUAL_PAYMENT_RATE_LIMIT,
  MANUAL_PAYMENT_RATE_WINDOW_MS,
  getRateLimitSince,
  shouldBlockManualPaymentCreate,
  getPendingCleanupUpdate,
} from '../../supabase/functions/_shared/manualPaymentRules.ts';

describe('manualPaymentRules', () => {
  it('computes rate limit window start', () => {
    expect(getRateLimitSince(1_700_000_000_000)).toBe(new Date(1_700_000_000_000 - MANUAL_PAYMENT_RATE_WINDOW_MS).toISOString());
  });

  it('blocks create at or above limit', () => {
    expect(shouldBlockManualPaymentCreate(MANUAL_PAYMENT_RATE_LIMIT - 1)).toBe(false);
    expect(shouldBlockManualPaymentCreate(MANUAL_PAYMENT_RATE_LIMIT)).toBe(true);
    expect(shouldBlockManualPaymentCreate(MANUAL_PAYMENT_RATE_LIMIT + 1)).toBe(true);
  });

  it('marks stale pending rows as expired (not deleted)', () => {
    expect(getPendingCleanupUpdate()).toEqual({ status: 'expired' });
  });
});
