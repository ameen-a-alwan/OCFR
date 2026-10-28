import type { NextConfig } from "next";

const backend =
  process.env.INTERNAL_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  // Local `next dev` / direct Next access: proxy /api/* → FastAPI
  // In Docker, nginx usually handles /api before traffic reaches Next.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/:path*`,
      },
    ];
  },
};

export default nextConfig;
