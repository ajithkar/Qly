/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)',
        secondary: 'rgb(var(--secondary) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        signal: 'rgb(var(--signal) / <alpha-value>)',
        'signal-strong': 'rgb(var(--signal-strong) / <alpha-value>)',
        link: 'rgb(var(--link) / <alpha-value>)',
        amber: 'rgb(var(--amber) / <alpha-value>)',
        jade: 'rgb(var(--jade) / <alpha-value>)',
        rose: 'rgb(var(--rose) / <alpha-value>)',
        board: 'rgb(var(--board) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['Lexend', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        token: ['clamp(3.5rem, 9vw, 7rem)', { lineHeight: '0.9', letterSpacing: '-0.04em' }],
        'token-sm': ['2rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      borderRadius: { card: '14px', button: '10px' },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 3px rgb(0 0 0 / 0.06)',
        elevated: '0 8px 24px rgb(0 0 0 / 0.10), 0 2px 6px rgb(0 0 0 / 0.06)',
        card: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px rgba(16,24,40,.06)',
        glow: '0 0 0 1px rgb(var(--signal) / 0.15), 0 8px 30px rgb(var(--signal) / 0.20)',
      },
      keyframes: {
        called: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        called: 'called 1.1s ease-in-out 3',
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
      },
    },
  },
  plugins: [],
};
