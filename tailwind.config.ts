import type { Config } from "tailwindcss";
import { tailwindColors, tailwindShadows } from "./lib/theme";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["variant", ['@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }', ':root[data-theme="dark"] &']],
  // KPI tones and trend colors are picked at run time
  safelist: [{ pattern: /^(bg|text|ring|border)-(navy|up|down|amber|shift|new|removed|teal|flat)(\/(10|15|20|30))?$/ }],
  theme: {
    extend: {
      colors: tailwindColors(),
      boxShadow: tailwindShadows(),
      fontFamily: {
        sans: ["var(--font-sans)", "-apple-system", "'Segoe UI'", "Arial", "sans-serif"],
      },
      borderRadius: { DEFAULT: "8px" },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        ping2: { "0%": { transform: "scale(1)", opacity: "0.55" }, "100%": { transform: "scale(2.1)", opacity: "0" } },
        sweep: { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } },
      },
      animation: {
        "fade-up": "fade-up 360ms cubic-bezier(.2,.7,.2,1) both",
        shimmer: "shimmer 1.4s infinite",
        ping2: "ping2 1.6s cubic-bezier(0,0,.2,1) infinite",
        sweep: "sweep 6s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
