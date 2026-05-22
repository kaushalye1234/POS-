/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./*.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#dc2626",
        secondary: "#10b981",
        "background-light": "#f8f6f6",
        "background-dark": "#0f172a",
        "card-glass": "rgba(30, 41, 59, 0.7)",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        inter: ["Inter", "sans-serif"],
        manrope: ["Manrope", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

/* placeholder aria-label */
