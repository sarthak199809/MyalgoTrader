/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          400: '#f6d365',
          500: '#fda085',
          600: '#d4af37',
          700: '#aa820a',
          900: '#4a3800'
        },
        dark: {
          900: '#0c0e12',
          800: '#141821',
          700: '#1d2331',
          600: '#283144'
        }
      }
    },
  },
  plugins: [],
}
