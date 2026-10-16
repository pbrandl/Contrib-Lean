/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // FRANZ!werk palette: logo yellow, the blues of franzwerk-tuebingen.de
      colors: {
        gelb: '#F5DC51',
        'gelb-hell': '#FFF8D2',
        werkblau: '#1F3B52',
        blau: '#406B8F',
        'blau-hell': '#EEF3F7',
        papier: '#F5F7F9',
        tinte: '#14232F',
        ziegel: '#A63A28',
        gruen: '#23774A',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(20 35 47 / 0.06), 0 8px 24px -12px rgb(20 35 47 / 0.18)',
      },
    },
  },
  plugins: [],
}
