/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["recharts", "@supabase/supabase-js"],
  },
};

export default nextConfig;
