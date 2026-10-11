import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["recharts", "@supabase/supabase-js"],
  },
};

export default withSentryConfig(nextConfig, {
  // ── Build-time options (no auth token needed — source maps not uploaded) ──
  silent: !process.env.CI,

  // Don't upload source maps to Sentry servers.
  // Readable stack traces still work via the in-browser sourcemap that Next.js
  // serves; enabling upload later requires adding SENTRY_AUTH_TOKEN.
  sourcemaps: {
    disable: true,
  },

  // Tunnel Sentry requests through /monitoring so the DSN isn't
  // directly visible in browser network tabs.
  tunnelRoute: "/monitoring",

  // Don't auto-instrument Vercel Cron Monitors.
  automaticVercelMonitors: false,
});
