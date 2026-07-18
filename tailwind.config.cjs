/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0b0f19',
          900: '#111827',
          850: '#151d2e',
          800: '#1b2436',
          700: '#243049',
        },
      },
    },
  },
  plugins: [],
};
