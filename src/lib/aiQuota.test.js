import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AI_DAILY_LIMIT_FREE,
  DEFAULT_AI_DAILY_LIMIT_PRO,
  getAiDailyLimit,
  isAiQuotaExceeded,
  getAiQuotaIncrement,
  getAiQuotaErrorMessage,
} from '../../supabase/functions/_shared/aiQuota.ts';

describe('aiQuota', () => {
  it('uses the documented defaults per plan', () => {
    expect(DEFAULT_AI_DAILY_LIMIT_FREE).toBe(20);
    expect(DEFAULT_AI_DAILY_LIMIT_PRO).toBe(100);
    expect(getAiDailyLimit(false)).toBe(20);
    expect(getAiDailyLimit(true)).toBe(100);
  });

  it('honours env overrides independently for free and Pro', () => {
    const env = { AI_DAILY_LIMIT_FREE: '5', AI_DAILY_LIMIT_PRO: '250' };
    expect(getAiDailyLimit(false, env)).toBe(5);
    expect(getAiDailyLimit(true, env)).toBe(250);
  });

  it('falls back on invalid or negative env values but allows zero', () => {
    expect(getAiDailyLimit(false, { AI_DAILY_LIMIT_FREE: '' })).toBe(20);
    expect(getAiDailyLimit(false, { AI_DAILY_LIMIT_FREE: 'abc' })).toBe(20);
    expect(getAiDailyLimit(true, { AI_DAILY_LIMIT_PRO: '-1' })).toBe(100);
    expect(getAiDailyLimit(true, { AI_DAILY_LIMIT_PRO: '12.5' })).toBe(100);
    expect(getAiDailyLimit(false, { AI_DAILY_LIMIT_FREE: '0' })).toBe(0);
  });

  it('treats reaching the limit as over quota', () => {
    expect(isAiQuotaExceeded(19, 20)).toBe(false);
    expect(isAiQuotaExceeded(20, 20)).toBe(true);
    expect(isAiQuotaExceeded(21, 20)).toBe(true);
    expect(isAiQuotaExceeded(0, 0)).toBe(true);
  });

  it('builds the atomic increment arguments', () => {
    expect(getAiQuotaIncrement('user-1', '2026-11-25')).toEqual({
      p_user_id: 'user-1',
      p_usage_date: '2026-11-25',
    });
  });

  it('returns a friendly, plan-aware message', () => {
    const free = getAiQuotaErrorMessage(20, false);
    const pro = getAiQuotaErrorMessage(100, true);
    expect(free).toContain('20 AI Quick Add requests');
    expect(free).toContain('resets tomorrow');
    expect(free).toContain('Upgrade to Pro');
    expect(pro).toContain('100 AI Quick Add requests');
    expect(pro).not.toContain('Upgrade to Pro');
    expect(getAiQuotaErrorMessage(1, true)).toContain('1 AI Quick Add request');
  });
});
