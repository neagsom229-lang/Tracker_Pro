export const MANUAL_PAYMENT_RATE_LIMIT = 5;
export const MANUAL_PAYMENT_RATE_WINDOW_MS = 60 * 60 * 1000;

export function getRateLimitSince(nowMs: number = Date.now()): string {
  return new Date(nowMs - MANUAL_PAYMENT_RATE_WINDOW_MS).toISOString();
}

export function shouldBlockManualPaymentCreate(recentCount: number, limit = MANUAL_PAYMENT_RATE_LIMIT): boolean {
  return recentCount >= limit;
}

export function getPendingCleanupUpdate() {
  return { status: 'expired' as const };
}
