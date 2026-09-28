import { describe, it, expect } from 'vitest';
import { addInterval, todayISO } from './recurrence';

describe('recurrence utils', () => {
  it('adds weekly interval correctly', () => {
    expect(addInterval('2026-01-01', 'weekly')).toBe('2026-01-08');
  });

  it('adds monthly interval correctly with month boundary clamping', () => {
    expect(addInterval('2026-01-31', 'monthly')).toBe('2026-02-28'); // 2026 is not a leap year
    expect(addInterval('2026-03-31', 'monthly')).toBe('2026-04-30');
  });

  it('adds yearly interval correctly', () => {
    expect(addInterval('2026-06-15', 'yearly')).toBe('2027-06-15');
  });

  it('returns today in ISO format', () => {
    const t = todayISO();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
