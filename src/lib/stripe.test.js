import { describe, it, expect, vi } from 'vitest';
import { STRIPE_PAYMENT_LINK, redirectToPaymentLink } from './stripe';
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
  it('exports STRIPE_PAYMENT_LINK', () => {
    expect(STRIPE_PAYMENT_LINK).toContain('buy.stripe.com');
  });

  it('redirectToPaymentLink throws when user is not signed in', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(redirectToPaymentLink()).rejects.toThrow('You must be signed in to upgrade.');
  });
});
