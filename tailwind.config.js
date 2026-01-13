/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--theme-color-rgb) / <alpha-value>)',
          hover: 'var(--theme-color-hover)',
          light: 'var(--theme-color-light)',
        },
      },
    },
  },
  plugins: [],
};
