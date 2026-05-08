/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'derp-blue': 'var(--derp-blue)',
        'derp-purple': 'var(--derp-purple)',
        'success-green': 'var(--success-green)',
        'warning-orange': 'var(--warning-orange)',
        'error-red': 'var(--error-red)',
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-card': 'var(--bg-card)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        border: 'var(--border)',
      },
      spacing: {
        'page-top': 'var(--page-top-gap)',
      },
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        exo: ['"Exo 2"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
