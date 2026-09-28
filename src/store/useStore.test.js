import { describe, it, expect } from 'vitest';
import { selectTotals, selectUnreadCount, selectGoalTotals, selectDebtTotals } from './useStore';

describe('useStore selectors & initial state', () => {
  it('selectTotals computes income, expenses and balance correctly', () => {
    const transactions = [
      { amount: 100, category: 'salary' },
      { amount: -30, category: 'food' },
      { amount: -20, category: 'transport' },
    ];
    const totals = selectTotals(transactions);
    expect(totals.totalIncome).toBe(100);
    expect(totals.totalExpenses).toBe(50);
    expect(totals.totalBalance).toBe(50);
  });

  it('selectUnreadCount filters unread notifications', () => {
    const notifications = [
      { id: '1', read: false },
      { id: '2', read: true },
      { id: '3', read: false },
    ];
    expect(selectUnreadCount(notifications)).toBe(2);
  });

  it('selectGoalTotals computes goal progress correctly', () => {
    const goals = [
      { targetAmount: 1000, currentAmount: 250 },
      { targetAmount: 500, currentAmount: 500 },
    ];
    const totals = selectGoalTotals(goals);
    expect(totals.totalTarget).toBe(1500);
    expect(totals.totalSaved).toBe(750);
    expect(totals.overallProgress).toBe(0.5);
  });

  it('selectDebtTotals computes debt totals correctly', () => {
    const debts = [
      { balance: 2000, initialBalance: 3000, minimumPayment: 100 },
      { balance: 500, initialBalance: 500, minimumPayment: 50 },
    ];
    const totals = selectDebtTotals(debts);
    expect(totals.totalDebt).toBe(2500);
    expect(totals.totalInitial).toBe(3500);
    expect(totals.totalMinimum).toBe(150);
  });
});
