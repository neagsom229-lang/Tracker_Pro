import { describe, it, expect } from 'vitest';
import { parseQuickAddText } from './parseQuickAdd';

const todayISO = () => new Date().toISOString().slice(0, 10);
const yesterdayISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

describe('parseQuickAddText', () => {
  it('extracts amount, category, and date keyword together', () => {
    const result = parseQuickAddText('Coffee 4.50 at Brown yesterday');
    expect(result.amount).toBe(4.5);
    expect(result.category).toBe('food');
    expect(result.date).toBe(yesterdayISO());
    expect(result.confidence).toBe('high');
  });

  it('prefers a $-prefixed amount over a plain number elsewhere in the sentence', () => {
    // The "2" in "2 coffees" should NOT be picked over the real $4.50 total
    const result = parseQuickAddText('2 coffees for $4.50 at Brown');
    expect(result.amount).toBe(4.5);
  });

  it('defaults to today when no date keyword is present', () => {
    const result = parseQuickAddText('Lunch 12 at Chipotle');
    expect(result.date).toBe(todayISO());
  });

  it('is low confidence when no amount is found', () => {
    const result = parseQuickAddText('Coffee at Brown yesterday');
    expect(result.amount).toBeNull();
    expect(result.confidence).toBe('low');
  });

  it('is low confidence when no category keyword matches anything', () => {
    const result = parseQuickAddText('19.99 for xyzzy widget');
    expect(result.amount).toBe(19.99);
    expect(result.category).toBe('other'); // falls back to 'other' as the stored value...
    expect(result.confidence).toBe('low'); // ...but confidence correctly reflects it was a guess
  });

  it('folds "split with X" into the description as a note, not a real split feature', () => {
    const result = parseQuickAddText('Dinner 40 split with Dara');
    expect(result.description).toContain('split with Dara');
    expect(result.amount).toBe(40);
  });

  it('a per-user correction overrides the static keyword map', () => {
    // Without a correction, "brown" doesn't match any static keyword,
    // so this is a low-confidence guess into 'other'.
    const withoutCorrection = parseQuickAddText('4.50 at Brown');
    expect(withoutCorrection.category).toBe('other');

    // With a learned correction for "brown" -> shopping (say the user
    // previously corrected this merchant), it should apply immediately.
    const withCorrection = parseQuickAddText('4.50 at Brown', { brown: 'shopping' });
    expect(withCorrection.category).toBe('shopping');
    expect(withCorrection.confidence).toBe('high');
  });

  it('sets direction to income for an income category, expense otherwise', () => {
    const income = parseQuickAddText('salary 2000');
    expect(income.direction).toBe('income');
    const expense = parseQuickAddText('coffee 4.50');
    expect(expense.direction).toBe('expense');
  });

  it('never returns an empty description even if everything else was stripped out', () => {
    const result = parseQuickAddText('4.50');
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('resolves a weekday name to the most recent past occurrence, not a future one', () => {
    const result = parseQuickAddText('Coffee 4 at Brown monday');
    const parsedDate = new Date(`${result.date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expect(parsedDate.getDay()).toBe(1); // Monday
    expect(parsedDate.getTime()).toBeLessThanOrEqual(today.getTime()); // not in the future
  });
});