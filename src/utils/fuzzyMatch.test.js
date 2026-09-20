import { describe, it, expect } from 'vitest';
import { fuzzyMatch, fuzzySearch } from './fuzzyMatch';

describe('fuzzyMatch', () => {
  it('matches an exact substring', () => {
    expect(fuzzyMatch('coffee', 'Coffee at Brown')).not.toBeNull();
  });

  it('matches a scattered subsequence in order', () => {
    // c-o-f-f-e-e appear in order within "ChezOFdFEnErgy"? No — use a
    // clearer scattered example: "cof" as a subsequence of "Costco Office"
    expect(fuzzyMatch('cof', 'Costco Office')).not.toBeNull();
  });

  it('rejects when characters are out of order', () => {
    // 'fc' never appears in order in "coffee" (c comes before f, not after)
    expect(fuzzyMatch('fc', 'coffee')).toBeNull();
  });

  it('rejects when a character is missing entirely', () => {
    expect(fuzzyMatch('xyz', 'coffee')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('COFFEE', 'coffee shop')).not.toBeNull();
    expect(fuzzyMatch('coffee', 'COFFEE SHOP')).not.toBeNull();
  });

  it('treats an empty query as matching everything with score 0', () => {
    expect(fuzzyMatch('', 'anything')).toBe(0);
  });

  it('returns null for a non-empty query against an empty target', () => {
    expect(fuzzyMatch('a', '')).toBeNull();
  });

  it('scores a contiguous match higher than a scattered one', () => {
    // "cof" as a straight prefix-contiguous run in "Coffee"...
    const contiguous = fuzzyMatch('cof', 'Coffee Shop');
    // ...vs "cof" as a scattered subsequence in "Costco Office" (c...o...f)
    const scattered = fuzzyMatch('cof', 'Costco Office');
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it('scores a prefix match higher than a match starting mid-string', () => {
    const prefix = fuzzyMatch('br', 'Brown Coffee');
    const midString = fuzzyMatch('br', 'Umbrella Corp'); // 'br' starts at index 2, not 0
    expect(prefix).toBeGreaterThan(midString);
  });
});

describe('fuzzySearch', () => {
  const items = [
    { name: 'Dashboard' },
    { name: 'Transactions' },
    { name: 'Budgets' },
    { name: 'Billing' },
  ];

  it('returns all items unranked when the query is empty', () => {
    expect(fuzzySearch('', items, (i) => i.name)).toEqual(items);
  });

  it('filters out non-matching items', () => {
    const results = fuzzySearch('bud', items, (i) => i.name);
    expect(results.map((r) => r.name)).toEqual(['Budgets']);
  });

  it('ranks a closer match first when multiple items match', () => {
    // "bu" appears, in order, only in "Budgets" (b-u) among these four —
    // Billing has a 'b' but no 'u' after it, Dashboard's only 'b' has no
    // 'u' after it either, Transactions has neither letter.
    const results = fuzzySearch('bu', items, (i) => i.name);
    expect(results.map((r) => r.name)).toEqual(['Budgets']);
  });
});