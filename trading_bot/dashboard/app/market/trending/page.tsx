import { CompactPageHeader } from "@/components/dashboard-primitives";
import { MarketTrendingGrid } from "@/components/market-trending-grid";
import { serverFetch } from "@/lib/server-api";
import { buildDegradedMarketStatsPayload } from "@/lib/market-fallback";
import type { DiscoveryLabMarketStatsPayload, SmartWalletActivityPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketTrendingPage() {
  const payloadResult = await Promise.allSettled([
    serverFetch<DiscoveryLabMarketStatsPayload>("/api/operator/market/trending?limit=50"),
  ]);
  const initialPayload = payloadResult[0]?.status === "fulfilled"
    ? payloadResult[0].value
    : buildDegradedMarketStatsPayload(
      payloadResult[0]?.reason instanceof Error ? payloadResult[0].reason.message : "Failed to load /api/operator/market/trending.",
    );
  const mints = initialPayload.tokens.map((row) => row.mint).join(",");
  const smartWalletResult = mints.length > 0
    ? await Promise.allSettled([
      serverFetch<SmartWalletActivityPayload[]>(
        `/api/operator/market/smart-wallet-events?limit=10&mints=${encodeURIComponent(mints)}`,
      ),
    ])
    : [];
  const initialSmartWalletEvents = smartWalletResult[0]?.status === "fulfilled" ? smartWalletResult[0].value : [];

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Market intel"
        title="Trending"
        description="Scan the board, pin what matters, open a token only when it earns the click."
      />
      <MarketTrendingGrid
        mode="trending"
        initialPayload={initialPayload}
        initialSmartWalletEvents={initialSmartWalletEvents}
      />
    </div>
  );
}
