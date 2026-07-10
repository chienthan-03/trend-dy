import type { NextConfig } from "next";

/**
 * Same-origin cookie strategy:
 * Browser talks to Next.js on :3000; `/api/v1/*` is rewritten to Nest on :3001
 * so the httpOnly `session` cookie is set for localhost:3000.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@factory/shared"],
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:3001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
