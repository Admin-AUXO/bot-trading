import { DiscoveryLabMarketStatsClient } from "@/components/discovery-lab-market-stats-client";
import { serverFetch } from "@/lib/server-api";
import type { DiscoveryLabMarketStatsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketTrendingPage() {
  const initialPayload = await serverFetch<DiscoveryLabMarketStatsPayload>("/api/operator/market/trending?limit=18");
  return <DiscoveryLabMarketStatsClient initialPayload={initialPayload} />;
}
