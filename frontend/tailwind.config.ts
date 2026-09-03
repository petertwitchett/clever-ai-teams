import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          light: "rgb(var(--color-primary-light) / <alpha-value>)",
          foreground: "var(--color-primary-fg)",
        },
        surface: {
          bg: "var(--surface-bg)",
          card: "var(--surface-card)",
          sidebar: "var(--surface-sidebar)",
          navbar: "var(--surface-navbar)",
          border: "var(--surface-border)",
          hover: "var(--surface-hover)",
        },
        content: {
          main: "var(--text-main)",
          muted: "var(--text-muted)",
          subtle: "var(--text-subtle)",
        },
        mat: {
          purple: "#7367F0",
          orange: "#FF9F43",
          green: "#28C76F",
          blue: "#00CFDD",
          red: "#EA5455",
          darkNavy: "#25293C",
          darkCard: "#2F3349",
          darkSidebar: "#2B2C40",
          lightBg: "#F8F7FA",
          lightCard: "#FFFFFF",
        },
      },
      spacing: {
        "4.5": "1.125rem",
      },
      borderRadius: {
        mat: "0.5rem",
        "mat-lg": "0.75rem",
        "mat-xl": "1rem",
        "mat-pill": "9999px",
      },
      boxShadow: {
        mat: "0 2px 9px 0 rgba(47, 43, 61, 0.06), 0 0 1px 1px rgba(47, 43, 61, 0.04)",
        "mat-hover": "0 4px 18px 0 rgba(47, 43, 61, 0.12)",
        "mat-dark": "0 2px 9px 0 rgba(15, 20, 34, 0.35)",
        "mat-glow": "0 0 20px -2px rgba(var(--color-primary), 0.4)",
        "mat-card": "0 3px 12px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.03)",
      },
      fontFamily: {
        sans: [
          "Public Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
