import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

// Decision: map palette tokens as raw CSS variable references (`var(--token)`).
// This keeps a single source of truth in index.css and lets both palettes
// (light/dark) swap by toggling the `.dark` class — no Tailwind JIT purge
// issue because the CSS variable values change, not the utility class names.
const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:          'var(--bg)',
        'bg-2':      'var(--bg-2)',
        'ink-1':     'var(--ink-1)',
        'ink-2':     'var(--ink-2)',
        'ink-3':     'var(--ink-3)',
        rule:        'var(--rule)',
        accent:      'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
      },
      fontFamily: {
        display: ['Fraunces', ...defaultTheme.fontFamily.serif],
        sans:    ['Switzer', ...defaultTheme.fontFamily.sans],
        mono:    ['ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
