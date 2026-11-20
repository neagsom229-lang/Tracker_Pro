import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Dashboard from './Dashboard';

// Dashboard is a composition of live components (recharts, framer-motion,
// zustand reads). This smoke test mocks the store and asserts the shell
// renders without throwing — the deeper interactions live in the
// CategoryChart / Pro-status tests.
const mocks = vi.hoisted(() => ({
  state: {
    transactions: [],
    budgets: {},
    profile: { currency: 'USD' },
    notifications: [],
    session: null,
    dataLoading: false,
    dataError: null,
    addTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    openTransactionModal: vi.fn(),
    saveParseCorrection: vi.fn(),
    parseCorrections: {},
  },
}));

vi.mock('../store/useStore', () => ({
  useStore: (selector) => selector(mocks.state),
  selectTotals: () => ({ totalIncome: 0, totalExpenses: 0, totalBalance: 0 }),
  selectSpendingThisMonth: () => ({}),
  selectGoalTotals: () => ({ totalTarget: 0, totalSaved: 0, overallProgress: 0 }),
  selectDebtTotals: () => ({ totalDebt: 0, totalInitial: 0, totalMinimum: 0 }),
  selectUnreadCount: () => 0,
}));

// jsdom lacks ResizeObserver; recharts constructs one unconditionally.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ contentRect: { width: 300, height: 300 } }]);
    }
    unobserve() {}
    disconnect() {}
  };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

async function mountDashboard() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Dashboard />);
  });
}

describe('Dashboard', () => {
  it('renders its panels without throwing with the store mocked', async () => {
    try {
      await mountDashboard();
      const text = container.textContent;
      expect(text).toContain('Total Balance');
      expect(text).toContain('Total Income');
      expect(text).toContain('Total Expenses');
      expect(text).toContain('Spending by Category');
      expect(text).toContain('Recent Transactions');
    } finally {
      if (root) {
        await act(async () => root.unmount());
      }
      container?.remove();
      container = null;
      root = null;
    }
  });
});
