/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        gray: {
          50: "var(--gray-50)",
          100: "var(--gray-100)",
          200: "var(--gray-200)",
          300: "var(--gray-300)",
          400: "var(--gray-400)",
          500: "var(--gray-500)",
          600: "var(--gray-600)",
          700: "var(--gray-700)",
          800: "var(--gray-800)",
          900: "var(--gray-900)",
          950: "var(--gray-950)",
        },
        accent: {
          50: "var(--accent-50)",
          100: "var(--accent-100)",
          200: "var(--accent-200)",
          300: "var(--accent-300)",
          400: "var(--accent-400)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
          700: "var(--accent-700)",
          800: "var(--accent-800)",
          900: "var(--accent-900)",
          950: "var(--accent-950)",
        },
        /* Semantic tokens — auto light/dark */
        page: "var(--color-page)",
        surface: "var(--color-surface)",
        muted: "var(--color-muted)",
        soft: "var(--color-soft)",
        edge: "var(--color-edge)",
        ink: "var(--color-ink)",
        "ink-muted": "var(--color-ink-muted)",
        link: "var(--color-link)",
        "link-hover": "var(--color-link-hover)",
        "tag-bg": "var(--color-tag-bg)",
        "tag-text": "var(--color-tag-text)",
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            color: "var(--color-ink)",
            a: {
              color: "var(--color-link)",
              "&:hover": {
                color: "var(--color-link-hover)",
              },
              textDecoration: "underline",
            },
            h2: { color: "var(--color-ink)" },
            h3: { color: "var(--color-ink)" },
            h4: { color: "var(--color-ink)" },
            strong: { color: "var(--color-ink)" },
            code: {
              color: "var(--color-link-hover)",
              backgroundColor: "var(--color-muted)",
              padding: "0.25rem 0.4rem",
              borderRadius: "0.25rem",
              fontWeight: "400",
            },
            "code::before": { content: '""' },
            "code::after": { content: '""' },
            pre: {
              backgroundColor: "var(--gray-800)",
              color: "var(--gray-100)",
            },
          },
        },
        /* invert no longer needed — semantic tokens handle dark mode */
        invert: {
          css: {},
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
