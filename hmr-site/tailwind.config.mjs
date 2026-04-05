/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        "primary": "#004f53",
        "primary-container": "#01696e",
        "on-primary": "#ffffff",
        "surface": "#eefcfc",
        "on-surface": "#111e1e",
        "on-surface-variant": "#3e4949",
        "surface-container-low": "#e8f6f6",
        "surface-container-lowest": "#ffffff",
        "outline-variant": "#bec9c9",
      },
      fontFamily: {
        "archivo": ["Archivo", "sans-serif"],
        "body": ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
