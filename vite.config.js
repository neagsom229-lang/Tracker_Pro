import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The smoke test starts its own API on a free port and points the proxy at it.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-server proxy so the browser can call the Express API at the same
    // origin (same-origin → no CORS). Production static serving isn't set up
    // for /api yet — local mode is for dev.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          motion: ['framer-motion'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
