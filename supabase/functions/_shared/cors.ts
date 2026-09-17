// supabase/functions/_shared/cors.ts
//
// Every function so far used `'Access-Control-Allow-Origin': '*'` — that
// allows ANY website to make a browser fetch to these endpoints. The
// practical risk is lower than it might look, since these functions
// require a Bearer token in an Authorization header rather than relying
// on an automatically-attached cookie, and a malicious cross-origin page
// can't read that token out of this app's own localStorage/JS state
// (that's blocked by the browser's same-origin policy regardless of
// CORS). So '*' here isn't the same severity as, say, a cookie-authed
// API with permissive CORS. Still, restricting to a real allowlist is
// the correct default for anything touching bank tokens or payments —
// it's cheap, and it closes off any FUTURE endpoint that might
// (mistakenly) rely on implicit auth from ever being exploitable this way.
//
// Set ALLOWED_ORIGINS as a comma-separated list, e.g.:
//   supabase secrets set ALLOWED_ORIGINS="https://your-app.vercel.app,http://localhost:5173"

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((o) => o.trim()).filter(Boolean);

export function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  // Echo back the request's own origin ONLY if it's in the allowlist —
  // this is the standard pattern for a dynamic (non-'*') CORS allowlist,
  // since the header can only ever hold one value, not a list.
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    Vary: 'Origin', // tells any caching layer the response varies per-Origin
  };
}