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
        'rarity-common':    'var(--rarity-common)',
        'rarity-uncommon':  'var(--rarity-uncommon)',
        'rarity-scare':     'var(--rarity-scare)',
        'rarity-rare':      'var(--rarity-rare)',
        'rarity-epic':      'var(--rarity-epic)',
        'rarity-mythic':    'var(--rarity-mythic)',
        'rarity-legendary': 'var(--rarity-legendary)',
        'rarity-unique':    'var(--rarity-unique)',
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
