import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import CategoryChart from './CategoryChart';

const mocks = vi.hoisted(() => ({
  state: {
    profile: { currency: 'USD' },
    openTransactionModal: vi.fn(),
  },
}));

vi.mock('../store/useStore', () => ({
  useStore: (selector) => selector(mocks.state),
}));

// jsdom has no ResizeObserver; recharts' ResponsiveContainer constructs one
// unconditionally. Report a non-zero size so charts actually render.
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

// Recharts warns when the act environment isn't flagged; keep the output clean.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container = null;
let root = null;

async function renderChart(props) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<CategoryChart {...props} />);
  });
}

async function unmountChart() {
  if (root) {
    await act(async () => root.unmount());
  }
  container?.remove();
  container = null;
  root = null;
}

describe('CategoryChart', () => {
  it('renders the empty state when the spending map is empty', async () => {
    try {
      await renderChart({ spendingMap: {} });
      expect(container.textContent).toContain('No expenses in this range');
    } finally {
      await unmountChart();
    }
  });

  it('renders sorted category labels and the top-category summary', async () => {
    try {
      await renderChart({ spendingMap: { food: 10, transport: 20 } });
      const text = container.textContent;
      expect(text).toContain('Spending by category: Transport $20.00 (67% of spending)');
      expect(text).toContain('Transport');
      expect(text).toContain('Food');
      const items = Array.from(container.querySelectorAll('ul[aria-label="Category amounts"] li'));
      expect(items[0].textContent).toContain('Transport');
      expect(items[1].textContent).toContain('Food');
    } finally {
      await unmountChart();
    }
  });

  it('shows the drill-down of expenses when a category slice is clicked', async () => {
    try {
      await renderChart({
        spendingMap: { transport: 20 },
        transactions: [
          { id: 't1', category: 'transport', amount: -20, description: 'Train ticket', date: '2026-01-05' },
          { id: 't2', category: 'other', amount: -5, description: 'Other purchase', date: '2026-01-04' },
        ],
      });

      const sector = container.querySelector('g.recharts-pie-sector');
      expect(sector).not.toBeNull();

      await act(async () => {
        sector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.querySelector('button[aria-label="Back to all categories"]')).not.toBeNull();
      expect(container.textContent).toContain('Transport');
      expect(container.textContent).toContain('Train ticket');
      expect(container.textContent).not.toContain('Other purchase');
    } finally {
      await unmountChart();
    }
  });
});
