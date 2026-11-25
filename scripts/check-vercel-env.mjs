// Fails the Vercel build when required public settings are missing,
// so a broken site is never deployed. Does nothing outside Vercel.
if (process.env.VERCEL) {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_STRIPE_PAYMENT_LINK'].filter(
    (name) => !process.env[name],
  );
  if (missing.length > 0) {
    console.error(`Build stopped: missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.VITE_DATA_BACKEND === 'local') {
    console.error('Build stopped: VITE_DATA_BACKEND=local must not be set in production.');
    process.exit(1);
  }
  const stripeLink = process.env.VITE_STRIPE_PAYMENT_LINK || '';
  const allowTestStripe = process.env.ALLOW_TEST_STRIPE_ON_PRODUCTION === 'true';
  if (
    process.env.VERCEL_ENV === 'production' &&
    stripeLink.includes('test_') &&
    !allowTestStripe
  ) {
    console.error(
      'Build stopped: VITE_STRIPE_PAYMENT_LINK appears to be a Stripe test link in VERCEL_ENV=production. Set ALLOW_TEST_STRIPE_ON_PRODUCTION=true only for approved private-beta test mode.',
    );
    process.exit(1);
  }
}
