import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  async redirects(): Promise<Array<{ source: string; destination: string; permanent: boolean }>> {
    return [
      { source: "/trading", destination: "/operational-desk/trading", permanent: true },
      { source: "/positions", destination: "/operational-desk/trading", permanent: true },
      { source: "/candidates", destination: "/operational-desk/trading", permanent: true },
      { source: "/operational-desk", destination: "/operational-desk/overview", permanent: true },
      { source: "/workbench", destination: "/workbench/packs", permanent: false },
      { source: "/market", destination: "/market/trending", permanent: false },
      { source: "/settings", destination: "/operational-desk/settings", permanent: true },
      { source: "/telemetry", destination: "/operational-desk/overview", permanent: true },
    ];
  },
};

export default nextConfig;
