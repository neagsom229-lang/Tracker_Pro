/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ---- Semantic tokens — the single source of truth.
        // Values are CSS variables; `:root` (dark) + `html.light` define them.
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        warning: 'var(--color-warning)',
        destructive: 'var(--color-destructive)',
        ring: 'var(--color-ring)',
        background: 'var(--color-background)',
        card: 'var(--color-card)',
        muted: 'var(--color-muted)',
        'muted-foreground': 'var(--color-muted-foreground)',
        border: 'var(--color-border)',
        income: 'var(--color-income)',
        'income-soft': 'var(--color-income-soft)',
        expense: 'var(--color-expense)',
        'expense-soft': 'var(--color-expense-soft)',
        text: 'var(--color-text)',
        // Legacy app tokens (readable in both modes via the variables above).
        obsidian: {
          950: 'var(--color-obsidian-950)',
          900: 'var(--color-obsidian-900)',
          800: 'var(--color-obsidian-800)',
          700: 'var(--color-obsidian-700)',
          600: 'var(--color-obsidian-600)',
        },
        slate: {
          850: '#1A1C24',
        },
        gilt: {
          gold: 'var(--color-primary)',
          purple: 'var(--color-secondary)',
        },
      },
      fontFamily: {
        // IBM Plex Sans per the design-system search; Inter fallback.
        sans: ['IBM Plex Sans', 'Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      backgroundImage: {
        'gilt-gradient': 'linear-gradient(135deg, #E8C77A 0%, #C89B5E 40%, #9F7AEA 100%)',
        'glass-sheen': 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45)',
        gilt: '0 0 24px rgba(232,199,122,0.25)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 16px rgba(232,199,122,0.20)' },
          '50%': { boxShadow: '0 0 32px rgba(232,199,122,0.45)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
