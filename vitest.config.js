import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setupEnv.js'],
    define: {
      'process.env.VITE_SUPABASE_URL': 'https://placeholder.supabase.co',
      'process.env.VITE_SUPABASE_ANON_KEY': 'placeholder-anon-key-for-ci',
    },
    globals: true,
    // Non-DOM suites run in the cheaper node environment; component/hook
    // tests keep jsdom (a file-level @vitest-environment annotation wins).
    environmentMatchGlobs: [
      ['server/**', 'node'],
      ['src/api/**', 'node'],
      ['src/lib/**', 'node'],
      ['src/store/**', 'node'],
      ['src/utils/**', 'node'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'src/components/**',
        'src/hooks/**',
        'src/lib/Ai.js',
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