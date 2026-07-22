import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Citrus Press — warm amber accent. Kept under the existing `brand` key so
        // every bg-brand-*/text-brand-* usage across the app repaints automatically.
        brand: {
          50: "#FDF9F0", 100: "#FBF0DC", 200: "#F5DDB0", 300: "#EEC583",
          400: "#E2A855", 500: "#D38C34", 600: "#CE7A22", 700: "#A9631A",
          800: "#8A5115", 900: "#6E4111", 950: "#402609",
        },
        // Warm neutral scale (replaces cool gray site-wide via the same class names).
        gray: {
          50: "#FDFBF6", 100: "#F7F0E2", 200: "#F1E7D3", 300: "#E4D6BC",
          400: "#C7B89A", 500: "#A6957A", 600: "#8C826E", 700: "#6B6252",
          800: "#4A4335", 900: "#241E14", 950: "#17130C",
        },
        // Semantic status colors, retinted to sit in the same warm world.
        emerald: {
          50: "#E1F4E9", 100: "#CDEEDD", 200: "#A3DEC1", 300: "#78CDA3",
          400: "#4C9C7A", 500: "#35875F", 600: "#25794D", 700: "#1E6440",
          800: "#194F35", 900: "#153F2B",
        },
        amber: {
          50: "#FAEBD3", 100: "#F6DEB9", 200: "#EEC888", 300: "#E4AF5A",
          400: "#C68F35", 500: "#B67B27", 600: "#A66A1F", 700: "#8A561B",
          800: "#6F4517", 900: "#5A3812",
        },
        red: {
          50: "#FAE2DF", 100: "#F5CCC7", 200: "#EAA69C", 300: "#DD8072",
          400: "#CC5C4A", 500: "#C24B37", 600: "#BE4335", 700: "#9C362A",
          800: "#7C2B21", 900: "#63221A",
        },
        blue: {
          50: "#DFEEFA", 100: "#C7E1F5", 200: "#9BCAEC", 300: "#6FB0E0",
          400: "#4A93CE", 600: "#215F8C", 700: "#1B4E73",
          800: "#153D5A",
        },
        // Soft KPI tint families used for dashboard/report cards.
        mint: { bg: "#E1F3E7", ink: "#1F6B45" },
        sky: { bg: "#DFEEFA", ink: "#215F8C" },
        peach: { bg: "#FBE6D0", ink: "#9C5B15" },
        lilac: { bg: "#EDE2F8", ink: "#6B4A9C" },
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Display", "SF Pro Text",
          "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif",
        ],
      },
      borderRadius: {
        lg: "10px",
        xl: "14px",
        "2xl": "20px",
        "3xl": "26px",
      },
      boxShadow: {
        // Soft, warm-tinted elevation (Citrus Press) instead of neutral gray shadows.
        card: "0 10px 26px -18px rgba(150,100,20,.24)",
        "card-hover": "0 16px 34px -16px rgba(150,100,20,.30)",
        btn: "0 8px 18px -8px rgba(206,122,34,.45)",
        popover: "0 20px 44px -18px rgba(60,40,10,.30)",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(.22,.9,.32,1)",
      },
    },
  },
  plugins: [],
};
export default config;
