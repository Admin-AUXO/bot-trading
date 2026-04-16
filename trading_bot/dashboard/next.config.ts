import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  async redirects(): Promise<Array<{ source: string; destination: string; permanent: boolean }>> {
    return [
      { source: "/trading", destination: "/operational-desk/trading", permanent: true },
      { source: "/positions", destination: "/operational-desk/trading", permanent: true },
      { source: "/candidates", destination: "/operational-desk/trading", permanent: true },
      { source: "/operational-desk", destination: "/operational-desk/overview", permanent: true },
      { source: "/settings", destination: "/operational-desk/settings", permanent: true },
      { source: "/telemetry", destination: "/operational-desk/overview", permanent: true },
    ];
  },
};

export default nextConfig;

export const operationalDeskRoutes = {
  root: "/operational-desk",
  overview: "/operational-desk/overview",
  trading: "/operational-desk/trading",
  settings: "/operational-desk/settings",
} as const;

export const discoveryLabRoutes = {
  root: "/discovery-lab",
  overview: "/discovery-lab/overview",
  marketStats: "/discovery-lab/market-stats",
  studio: "/discovery-lab/studio",
  runLab: "/discovery-lab/run-lab",
  results: "/discovery-lab/results",
  strategyIdeas: "/discovery-lab/strategy-ideas",
  config: "/discovery-lab/config",
} as const;
