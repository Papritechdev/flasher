/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Override blue → brand red so all blue-* classes render as red
        blue: {
          200:  '#fecaca',
          300:  '#fca5a5',
          400:  '#f87171',
          500:  '#FF0000',
          600:  '#dc2626',
          700:  '#b91c1c',
          800:  '#991b1b',
          950:  '#450a0a',
        },
        pass: '#22c55e',
        fail: '#ef4444',
        pending: '#f59e0b',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
