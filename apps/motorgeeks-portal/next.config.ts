import type { NextConfig } from "next";

const dealerOsOrigin = (
  process.env.DEALEROS_PORTAL_ORIGIN ||
  process.env.NEXT_PUBLIC_DEALEROS_PORTAL_ORIGIN ||
  "https://dealer-os-ten.vercel.app"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dealer-login",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/dealer-login", destination: `${dealerOsOrigin}/dealer-login` },
        { source: "/dealer-portal", destination: `${dealerOsOrigin}/dealer-portal` },
        { source: "/dealer-portal/:path*", destination: `${dealerOsOrigin}/dealer-portal/:path*` },
        { source: "/api/dealer-portal/:path*", destination: `${dealerOsOrigin}/api/dealer-portal/:path*` },
        { source: "/api/autotrader/:path*", destination: `${dealerOsOrigin}/api/autotrader/:path*` },
        { source: "/auth/:path*", destination: `${dealerOsOrigin}/auth/:path*` },
        { source: "/brand/:path*", destination: `${dealerOsOrigin}/brand/:path*` },
        { source: "/images/:path*", destination: `${dealerOsOrigin}/images/:path*` },
        { source: "/_next/:path*", destination: `${dealerOsOrigin}/_next/:path*` },
      ],
    };
  },
};

export default nextConfig;
