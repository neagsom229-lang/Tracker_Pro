import { createClient } from '@supabase/supabase-js';

// Both values are PUBLIC (the "anon" key is safe to ship to the browser —
// it can only do what your Row Level Security policies allow it to do).
// Never put the Supabase SERVICE ROLE key in any file under src/ — that
// key bypasses RLS entirely and must only ever live server-side (Edge
// Functions / serverless functions), never in client bundle code.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev rather than silently making requests to "undefined".
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // needed for OAuth redirect (Google) to work
  },
});
