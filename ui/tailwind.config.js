/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // SAP BTP design tokens
        sap: {
          blue: '#0070d2',
          'blue-dark': '#0854a0',
          'blue-light': '#d1e8ff',
        },
        surface: {
          1: '#0a0c14',
          2: '#111827',
          3: '#1f2937',
          4: '#374151',
        },
      },
      fontFamily: {
        mono: ['Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
