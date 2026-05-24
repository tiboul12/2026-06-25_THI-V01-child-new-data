/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "rgb(var(--tw-primary) / <alpha-value>)",
        "secondary": "rgb(var(--tw-secondary) / <alpha-value>)",
        "accent": "rgb(var(--tw-accent) / <alpha-value>)",
        "accent-dark": "rgb(var(--tw-accent-dark) / <alpha-value>)",
        "accent-darker": "rgb(var(--tw-accent-darker) / <alpha-value>)",
        "background": "rgb(var(--tw-background) / <alpha-value>)",
        "surface": "rgb(var(--tw-surface) / <alpha-value>)",
        "surface-light": "rgb(var(--tw-surface-light) / <alpha-value>)",
        "btn-text": "rgb(var(--btn-text-color) / <alpha-value>)",
        "light-primary": "rgb(var(--color-light-primary) / <alpha-value>)",
        "light-secondary": "rgb(var(--color-light-secondary) / <alpha-value>)",
        "light-accent": "rgb(var(--color-light-accent) / <alpha-value>)",
        "light-background": "rgb(var(--color-light-background) / <alpha-value>)",
        "light-surface": "rgb(var(--color-light-surface) / <alpha-value>)",
        "light-surface-hover": "rgb(var(--color-light-surface-hover) / <alpha-value>)",
        "light-text": "rgb(var(--color-light-text) / <alpha-value>)",
        "light-text-muted": "rgb(var(--color-light-text-muted) / <alpha-value>)",
        "light-border": "rgb(var(--color-light-border) / <alpha-value>)",
      },
      fontFamily: {
        "display": ["Space Grotesk", "sans-serif"]
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
