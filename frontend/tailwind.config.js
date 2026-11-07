/** @type {import('tailwindcss').Config} */
// All colours resolve through CSS variables (see src/styles/index.css) so light/dark share one class set.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: v('bg'),
        panel: v('surface'),
        panel2: v('surface2'),
        cyan: v('accent'),
        aqua: v('aqua'),
        'on-accent': v('on-accent'),
        ink: { DEFAULT: v('ink'), dim: v('dim') },
        st: { stable: v('st-stable'), review: v('st-review'), escalate: v('st-escalate'), na: v('st-na') },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk Variable"', '"Inter Variable"', 'system-ui', 'sans-serif'],
      },
      borderColor: { hair: 'rgb(var(--hair))' },
    },
  },
  plugins: [],
}
