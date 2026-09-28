import { describe, it, expect } from 'vitest';
import { formatMoney, toCSV } from './format';

describe('format utils', () => {
  it('formats money correctly in USD', () => {
    expect(formatMoney(1234.56, 'USD')).toContain('1,234.56');
  });

  it('formats money correctly in KHR (no decimals)', () => {
    expect(formatMoney(100, 'KHR')).toContain('410,000');
  });

  it('generates valid CSV string from transactions', () => {
    const txs = [
      { id: '1', date: '2026-01-01', description: 'Coffee & "Snacks"', category: 'Food', amount: -5.5 },
    ];
    const csv = toCSV(txs);
    expect(csv).toContain('Coffee & ""Snacks""');
    expect(csv).toContain('Food');
    expect(csv).toContain('Expense');
    expect(csv).toContain('-5.50');
  });
});
