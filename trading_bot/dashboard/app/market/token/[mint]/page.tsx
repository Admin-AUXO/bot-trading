import { DiscoveryLabMarketStatsClient } from "@/components/discovery-lab-market-stats-client";
import { serverFetch } from "@/lib/server-api";
import type { DiscoveryLabMarketStatsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketTokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const initialPayload = await serverFetch<DiscoveryLabMarketStatsPayload>(
    `/api/operator/market/trending?limit=18&mint=${encodeURIComponent(mint)}&focusOnly=true`,
  );
  return <DiscoveryLabMarketStatsClient initialPayload={initialPayload} />;
}
