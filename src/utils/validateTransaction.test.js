import { describe, it, expect } from 'vitest';
import { validateTransactionPayload } from './validateTransaction';

describe('validateTransactionPayload', () => {
  it('accepts a complete payload', () => {
    expect(validateTransactionPayload({ description: 'Coffee', amount: -4.5, category: 'Food', date: '2026-11-25' })).toBeNull();
  });

  it('rejects missing/blank description', () => {
    expect(validateTransactionPayload({ amount: -1, category: 'Food', date: '2026-11-25' })).toBeTruthy();
    expect(validateTransactionPayload({ description: '   ', amount: -1, category: 'Food', date: '2026-11-25' })).toBeTruthy();
  });

  it('rejects missing/malformed date', () => {
    expect(validateTransactionPayload({ description: 'x', amount: -1, category: 'Food' })).toBeTruthy();
    expect(validateTransactionPayload({ description: 'x', amount: -1, category: 'Food', date: '25-11-2026' })).toBeTruthy();
  });

  it('rejects zero/NaN/string amount', () => {
    expect(validateTransactionPayload({ description: 'x', amount: 0, category: 'Food', date: '2026-11-25' })).toBeTruthy();
    expect(validateTransactionPayload({ description: 'x', amount: NaN, category: 'Food', date: '2026-11-25' })).toBeTruthy();
    expect(validateTransactionPayload({ description: 'x', amount: '10', category: 'Food', date: '2026-11-25' })).toBeTruthy();
  });

  it('rejects missing category', () => {
    expect(validateTransactionPayload({ description: 'x', amount: -1, date: '2026-11-25' })).toBeTruthy();
    expect(validateTransactionPayload({ description: 'x', amount: -1, category: '', date: '2026-11-25' })).toBeTruthy();
  });

  it('rejects null input', () => {
    expect(validateTransactionPayload(null)).toBeTruthy();
  });
});
