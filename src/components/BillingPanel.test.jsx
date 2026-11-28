import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import BillingPanel from './BillingPanel';

// BillingPanel reads a lot of live singletons. Mock them so the test only
// exercises provider selection: source='manual_aba' wins even when the
// remote's NOT NULL DEFAULT 'stripe' payment_provider says otherwise.
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

async function expectAba(subscription) {
  try {
    await render(subscription);
    expect(container.textContent).toContain('Paid via ABA KHQR');
    expect(container.textContent).toContain('Contact support to cancel');
    expect(container.textContent).not.toContain('Paid via Card (Stripe)');
  } finally {
    await cleanup();
  }
}

async function expectStripe(subscription) {
  try {
    await render(subscription);
    expect(container.textContent).toContain('Paid via Card (Stripe)');
    expect(container.textContent).toContain('Manage subscription & invoices');
    expect(container.textContent).not.toContain('Paid via ABA KHQR');
  } finally {
    await cleanup();
  }
}

describe('BillingPanel provider selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("source='manual_aba' wins over the remote default payment_provider='stripe'", async () => {
    await expectAba({ status: 'active', source: 'manual_aba', payment_provider: 'stripe' });
  });

  it("a non-default payment_provider='aba_manual' is honoured even with source='stripe'", async () => {
    await expectAba({ status: 'active', source: 'stripe', payment_provider: 'aba_manual' });
  });

  it('both source and payment_provider stripe resolve to stripe', async () => {
    await expectStripe({ status: 'active', source: 'stripe', payment_provider: 'stripe' });
  });

  it("source='manual_aba' with no payment_provider at all resolves to aba_manual", async () => {
    await expectAba({ status: 'active', source: 'manual_aba' });
  });

  it('defaults to stripe when neither column is available', async () => {
    await expectStripe({ status: 'active' });
  });

  it('honours other non-default providers', async () => {
    await expectAba({ status: 'active', payment_provider: 'aba' });
  });
});
