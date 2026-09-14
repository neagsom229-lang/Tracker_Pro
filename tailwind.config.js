/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#07070A',
          900: '#0C0D12',
          800: '#13141B',
          700: '#1B1D27',
          600: '#262835',
        },
        slate: {
          850: '#1A1C24',
        },
        income: {
          DEFAULT: '#34D399',
          soft: 'rgba(52,211,153,0.12)',
        },
        expense: {
          DEFAULT: '#F87171',
          soft: 'rgba(248,113,113,0.12)',
        },
        gilt: {
          gold: '#E8C77A',
          purple: '#9F7AEA',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      backgroundImage: {
        'gilt-gradient': 'linear-gradient(135deg, #E8C77A 0%, #C89B5E 40%, #9F7AEA 100%)',
        'glass-sheen': 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%)',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0,0,0,0.45)',
        gilt: '0 0 24px rgba(232,199,122,0.25)',
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
