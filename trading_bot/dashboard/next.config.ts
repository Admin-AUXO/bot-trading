import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  async redirects(): Promise<Array<{ source: string; destination: string; permanent: boolean }>> {
    return [
      { source: "/trading", destination: "/operational-desk/trading", permanent: true },
      { source: "/positions", destination: "/operational-desk/trading", permanent: true },
      { source: "/candidates", destination: "/operational-desk/trading", permanent: true },
      { source: "/operational-desk", destination: "/operational-desk/overview", permanent: true },
      { source: "/settings", destination: "/operational-desk/settings", permanent: true },
      { source: "/discovery-lab", destination: "/workbench/editor", permanent: false },
      { source: "/discovery-lab/overview", destination: "/workbench/editor", permanent: false },
      { source: "/discovery-lab/run-lab", destination: "/workbench/runs", permanent: false },
      { source: "/discovery-lab/config", destination: "/workbench/editor", permanent: false },
      { source: "/discovery-lab/studio", destination: "/workbench/editor", permanent: false },
      { source: "/discovery-lab/results", destination: "/workbench/runs", permanent: false },
      { source: "/discovery-lab/strategy-ideas", destination: "/workbench/runs", permanent: false },
      { source: "/discovery-lab/market-stats", destination: "/market/trending", permanent: false },
      { source: "/telemetry", destination: "/operational-desk/overview", permanent: true },
    ];
  },
};

export default nextConfig;
