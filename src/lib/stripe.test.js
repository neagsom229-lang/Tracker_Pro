import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

describe('stripe lib', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('exports STRIPE_PAYMENT_LINK from env', async () => {
    vi.stubEnv('VITE_STRIPE_PAYMENT_LINK', 'https://buy.stripe.com/test_example');
    const { STRIPE_PAYMENT_LINK } = await import('./stripe.js');
    expect(STRIPE_PAYMENT_LINK).toContain('buy.stripe.com');
  });

  it('redirectToPaymentLink throws when link is not configured', async () => {
    vi.stubEnv('VITE_STRIPE_PAYMENT_LINK', '');
    const { redirectToPaymentLink } = await import('./stripe.js');
    await expect(redirectToPaymentLink()).rejects.toThrow('Stripe payment link is not configured.');
  });

  it('redirectToPaymentLink throws when user is not signed in', async () => {
    vi.stubEnv('VITE_STRIPE_PAYMENT_LINK', 'https://buy.stripe.com/test_example');
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    const { redirectToPaymentLink } = await import('./stripe.js');
    await expect(redirectToPaymentLink()).rejects.toThrow('You must be signed in to upgrade.');
  });
});
