import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'src/components/**',
        'src/hooks/**',
        'src/lib/Ai.js',
        'src/lib/aba.js',
        'src/lib/dataProvider.js',
        'src/lib/manualPayment.js',
        'src/lib/supabaseClient.js',
        'src/App.jsx',
        'src/main.jsx',
        'supabase/**',
        'dist/**',
        'node_modules/**',
        '*.config.js',
      ],
      thresholds: {
        lines: 60,
        functions: 35,
      },
    },
  },
});
