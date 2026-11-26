import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import BillingPanel from './BillingPanel';

// BillingPanel reads a lot of live singletons. Mock them so the test only
// exercises the provider-selection logic (payment_provider, with a
// source='manual_aba' fallback for rows written before that column existed).
const mocks = vi.hoisted(() => ({ proStatus: {} }));

vi.mock('../hooks/useProStatus', () => ({ useProStatus: () => mocks.proStatus }));
vi.mock('../store/useStore', () => ({
  useStore: (selector) => selector({ openUpgradeModal: vi.fn() }),
}));
vi.mock('../api/client', () => ({
  api: { profile: { setProToggle: vi.fn() } },
  isLocalBackend: () => false,
}));
vi.mock('../lib/stripe', () => ({ redirectToCustomerPortal: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function render(subscription) {
  mocks.proStatus = {
    isPro: true,
    subscription,
    isPendingReview: false,
    pendingPayment: null,
    loading: false,
    refresh: vi.fn(),
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<BillingPanel />);
  });
}

async function cleanup() {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  container = null;
}

describe('BillingPanel provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses payment_provider when the remote column is present', async () => {
    try {
      await render({ status: 'active', payment_provider: 'aba' });
      expect(container.textContent).toContain('Paid via ABA KHQR');
      expect(container.textContent).toContain('Contact support to cancel');
      expect(container.textContent).not.toContain('Paid via Card (Stripe)');
    } finally {
      await cleanup();
    }
  });

  it("falls back to aba_manual when only source='manual_aba' is set", async () => {
    try {
      await render({ status: 'active', source: 'manual_aba' });
      expect(container.textContent).toContain('Paid via ABA KHQR');
      expect(container.textContent).toContain('Contact support to cancel');
      expect(container.textContent).not.toContain('Paid via Card (Stripe)');
    } finally {
      await cleanup();
    }
  });

  it('defaults to stripe when neither column is available', async () => {
    try {
      await render({ status: 'active' });
      expect(container.textContent).toContain('Paid via Card (Stripe)');
      expect(container.textContent).toContain('Manage subscription & invoices');
    } finally {
      await cleanup();
    }
  });

  it('prefers payment_provider over source when both are present', async () => {
    try {
      await render({ status: 'active', payment_provider: 'stripe', source: 'manual_aba' });
      expect(container.textContent).toContain('Paid via Card (Stripe)');
    } finally {
      await cleanup();
    }
  });
});
