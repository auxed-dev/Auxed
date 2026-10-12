/** @type {import('tailwindcss').Config} */

// Role themed colours are CSS variables holding "r g b" triplets (see styles/globals.css)
// so they work with Tailwind's opacity modifiers, e.g. bg-accent/40.
const themed = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: themed('accent'),
        'accent-soft': themed('accent-soft'),
        'accent-deep': themed('accent-deep'),
        surface: themed('surface'),
        chip: themed('chip'),
        nav: themed('nav'),
        fab: themed('fab'),
        lime: { DEFAULT: '#D0FF34', deep: '#A8D41A', ink: '#1C2A06' },
        ink: { DEFAULT: '#000000', 900: '#07070A', 800: '#0E0E13' },
      },
      fontFamily: {
        wide: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
        cond: ['var(--font-anton)', 'Impact', 'sans-serif'],
        ui: ['var(--font-saira)', 'system-ui', 'sans-serif'],
        num: ['var(--font-poppins)', 'system-ui', 'sans-serif'],
        din: ['var(--font-barlow)', 'system-ui', 'sans-serif'],
        bubble: ['var(--font-bagel)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-italiana)', 'Georgia', 'serif'],
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        sys: ['-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        card: '28px',
      },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        pulseGlow: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        sheetUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        popIn: { from: { opacity: '0', transform: 'scale(0.6)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
      animation: {
        marquee: 'marquee 18s linear infinite',
        floaty: 'floaty 3.2s ease-in-out infinite',
        pulseGlow: 'pulseGlow 1.8s ease-in-out infinite',
        sheetUp: 'sheetUp 280ms cubic-bezier(.2,.8,.2,1)',
        fadeIn: 'fadeIn 240ms ease-out',
        popIn: 'popIn 260ms cubic-bezier(.2,.9,.3,1.3) both',
      },
    },
  },
  plugins: [],
};
