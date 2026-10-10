import type { Config } from "tailwindcss";

// Semantic, Apple-style tokens. Every color resolves to a CSS variable in
// globals.css so the whole UI adapts to light / dark without per-class overrides.
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: rgb("--canvas"), // grouped background
        surface: rgb("--surface"), // grouped cell / card
        elevated: rgb("--elevated"), // popovers, sheets
        gray: rgb("--gray"), // base for fills: bg-gray/15 etc.
        label: {
          DEFAULT: rgb("--label"),
          2: "rgb(var(--label-2) / 0.62)",
          3: "rgb(var(--label-2) / 0.32)",
        },
        separator: "var(--separator)",
        accent: { DEFAULT: rgb("--accent"), text: rgb("--accent-text") },
        positive: rgb("--positive"),
        negative: rgb("--negative"),
        warning: rgb("--warning"),
        info: rgb("--info"),
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          "system-ui",
          '"Segoe UI"',
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      // Size-specific tracking & leading — large text tightens, small text opens up.
      fontSize: {
        "large-title": ["2.125rem", { lineHeight: "1.12", letterSpacing: "-0.024em", fontWeight: "700" }],
        title1: ["1.75rem", { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "700" }],
        title2: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.016em", fontWeight: "700" }],
        title3: ["1.1875rem", { lineHeight: "1.25", letterSpacing: "-0.012em", fontWeight: "600" }],
        headline: ["0.9375rem", { lineHeight: "1.35", letterSpacing: "-0.006em", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.45", letterSpacing: "-0.004em" }],
        callout: ["0.875rem", { lineHeight: "1.4", letterSpacing: "0" }],
        subhead: ["0.8125rem", { lineHeight: "1.38", letterSpacing: "0.002em" }],
        footnote: ["0.75rem", { lineHeight: "1.35", letterSpacing: "0.006em" }],
        caption: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.012em" }],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      transitionTimingFunction: {
        spring: "var(--ease-spring)",
        "spring-bounce": "var(--ease-spring-bounce)",
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      // Apple fill opacities (quaternary → secondary)
      opacity: { 7: "0.07", 12: "0.12", 16: "0.16", 22: "0.22" },
      boxShadow: {
        card: "var(--shadow-card)",
        float: "var(--shadow-float)",
      },
    },
  },
  plugins: [],
};

export default config;
