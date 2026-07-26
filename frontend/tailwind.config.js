/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        signal: 'rgb(var(--signal) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        jade: 'rgb(var(--jade) / <alpha-value>)',
        rose: 'rgb(var(--rose) / <alpha-value>)',
        board: 'rgb(var(--board) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        token: ['clamp(3.5rem, 9vw, 7rem)', { lineHeight: '0.9', letterSpacing: '-0.04em' }],
        'token-sm': ['2rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      borderRadius: { card: '10px' },
      keyframes: {
        called: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
      },
      animation: { called: 'called 1.1s ease-in-out 3' },
    },
  },
  plugins: [],
};
