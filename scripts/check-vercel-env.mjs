// Fails the Vercel build when required public settings are missing,
// so a broken site is never deployed. Does nothing outside Vercel.
if (process.env.VERCEL) {
  const scope = process.env.VERCEL_ENV || 'unknown';
  const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_STRIPE_PAYMENT_LINK'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Names only, never values: safe to print in public build logs.
    const seen = Object.keys(process.env).filter((k) => k.startsWith('VITE_') || k.startsWith('ALLOW_')).sort();
    console.error(`Build stopped: missing environment variables: ${missing.join(', ')}`);
    console.error(`  deployment scope : VERCEL_ENV=${scope} (branch: ${process.env.VERCEL_GIT_COMMIT_REF || 'n/a'})`);
    console.error(`  VITE_/ALLOW_ names visible to this build: ${seen.length ? seen.join(', ') : '(none)'}`);
    console.error(`  Fix: Vercel > Project > Settings > Environment Variables. Add each name for the "${scope}" environment (Preview needs "Preview" ticked, with no branch restriction), then Redeploy.`);
    process.exit(1);
  }
  if (process.env.VITE_DATA_BACKEND === 'local') {
    console.error('Build stopped: VITE_DATA_BACKEND=local must not be set in production.');
    process.exit(1);
  }
  const stripeLink = process.env.VITE_STRIPE_PAYMENT_LINK || '';
  const allowTestStripe = process.env.ALLOW_TEST_STRIPE_ON_PRODUCTION === 'true';
  if (scope === 'production' && stripeLink.includes('test_') && !allowTestStripe) {
    console.error('Build stopped: VITE_STRIPE_PAYMENT_LINK appears to be a Stripe test link in VERCEL_ENV=production. Set ALLOW_TEST_STRIPE_ON_PRODUCTION=true only for approved private-beta test mode.');
    process.exit(1);
  }
}
