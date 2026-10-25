/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef4fa', 100: '#d6e4f2', 500: '#2f6aa3', 600: '#24578a', 700: '#1e3a5f', 800: '#172d4a' },
        accent: { 500: '#2bb5a4', 600: '#1f9a8b' },
      },
    },
  },
  plugins: [],
};
