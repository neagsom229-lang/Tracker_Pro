// Pure, DB-free helpers for the per-user daily AI Quick Add quota.
// Kept in _shared/ so the same rules can be unit-tested in Node/Vitest and
// imported by the Deno Edge Function without pulling in Supabase or Deno.

export const DEFAULT_AI_DAILY_LIMIT_FREE = 20;
export const DEFAULT_AI_DAILY_LIMIT_PRO = 100;

export interface AiQuotaEnv {
  AI_DAILY_LIMIT_FREE?: string | undefined;
  AI_DAILY_LIMIT_PRO?: string | undefined;
}

/** Resolve the daily limit for this user's plan. Bad env values fall back. */
export function getAiDailyLimit(isPro: boolean, env: AiQuotaEnv = {}): number {
  const raw = isPro ? env.AI_DAILY_LIMIT_PRO : env.AI_DAILY_LIMIT_FREE;
  const fallback = isPro ? DEFAULT_AI_DAILY_LIMIT_PRO : DEFAULT_AI_DAILY_LIMIT_FREE;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** A user is over quota once their stored count has reached the limit. */
export function isAiQuotaExceeded(usageCount: number, limit: number): boolean {
  return usageCount >= limit;
}

/** Arguments for the atomic `increment_ai_usage` RPC (one reserved request). */
export function getAiQuotaIncrement(userId: string, usageDate: string) {
  return { p_user_id: userId, p_usage_date: usageDate };
}

/** User-facing 429 message — never expose env names or internal counts. */
export function getAiQuotaErrorMessage(limit: number, isPro: boolean): string {
  const requestWord = limit === 1 ? 'request' : 'requests';
  const upgrade = isPro ? '' : ' Upgrade to Pro for a higher daily limit.';
  return `You've used all ${limit} AI Quick Add ${requestWord} for today. Your limit resets tomorrow.${upgrade}`;
}
