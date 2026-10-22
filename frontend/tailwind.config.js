const color = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  // Dark mode: the class "dark" on <html> (settings.js), so the setting can override the device.
  darkMode: 'class',
  theme: {
    extend: {
      // FRANZ!werk palette: logo yellow, the blues of franzwerk-tuebingen.de. The values are
      // CSS variables (src/index.css, light and dark), so every class follows the theme.
      colors: {
        gelb: color('gelb'),
        'gelb-hell': color('gelb-hell'),
        werkblau: color('werkblau'),
        blau: color('blau'),
        'blau-hell': color('blau-hell'),
        papier: color('papier'),
        tinte: color('tinte'),
        ziegel: color('ziegel'),
        gruen: color('gruen'),
        // surfaces on the page (cards, fields): white in light mode
        flaeche: color('flaeche'),
        // text in the blue of the brand on light surfaces; lighter in dark mode
        akzent: color('akzent'),
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
