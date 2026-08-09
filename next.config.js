/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Enables src/instrumentation.ts (OpenTelemetry -> Vercel Observability).
    // Required on Next 14; built in from Next 15 onwards.
    instrumentationHook: true,
  },
};

// Opt-in bundle report: `ANALYZE=1 npm run build`
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "1",
});

module.exports = withBundleAnalyzer(nextConfig);
