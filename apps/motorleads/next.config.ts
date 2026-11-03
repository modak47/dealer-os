import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd()
  },
  async headers() {
    return [{
      source: "/seller/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, nosnippet" }]
    }];
  },
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "www.motorgeeks.co.uk" }],
      destination: "https://motorgeeks.co.uk/:path*",
      permanent: true
    }];
  }
};

export default nextConfig;
