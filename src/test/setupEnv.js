// Ensure unit tests do not depend on local .env files.
import { vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key-for-ci');
