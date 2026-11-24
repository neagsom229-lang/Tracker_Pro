// Fails the Vercel build when required public settings are missing,
// so a broken site is never deployed. Does nothing outside Vercel.
if (process.env.VERCEL) {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter(
    (name) => !process.env[name]
  );
  if (missing.length > 0) {
    console.error(`Build stopped: missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.VITE_DATA_BACKEND === 'local') {
    console.error('Build stopped: VITE_DATA_BACKEND=local must not be set in production.');
    process.exit(1);
  }
}
