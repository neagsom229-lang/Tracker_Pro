import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import ManualAbaFlow from './ManualAbaFlow';

const createManualPayment = vi.fn();
vi.mock('../lib/manualPayment', () => ({
  createManualPayment: (...args) => createManualPayment(...args),
  submitPaymentProof: vi.fn(),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

async function render(ui) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
}

async function cleanup() {
  if (root) await act(async () => root.unmount());
  container?.remove();
  root = null;
  container = null;
}

describe('ManualAbaFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows friendly error and no crash when createManualPayment fails', async () => {
    createManualPayment.mockRejectedValue(new Error('Manual payment is not configured yet.'));
    await render(<ManualAbaFlow onBack={() => {}} onSuccess={() => {}} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Manual payment is not configured yet.');
    expect(container.textContent).toContain('Try again');
    await cleanup();
  });
});
