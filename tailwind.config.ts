import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff", 100: "#d9ecff", 200: "#bcddff", 300: "#8ec7ff",
          400: "#59a6ff", 500: "#2f82fb", 600: "#1763f0", 700: "#104edd",
          800: "#1340b3", 900: "#153b8d", 950: "#122555",
        },
      },
      fontFamily: { sans: ["system-ui", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
