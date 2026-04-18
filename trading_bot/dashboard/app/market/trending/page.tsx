import { CompactPageHeader, EmptyState } from "@/components/dashboard-primitives";
import { MarketTrendingGrid } from "@/components/market-trending-grid";
import { serverFetch } from "@/lib/server-api";
import { marketRoutes } from "@/lib/dashboard-routes";
import type { DiscoveryLabMarketStatsPayload, SmartWalletActivityPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketTrendingPage() {
  try {
    const initialPayload = await serverFetch<DiscoveryLabMarketStatsPayload>("/api/operator/market/trending?limit=50");
    const mints = initialPayload.tokens.map((row) => row.mint).join(",");
    const initialSmartWalletEvents = await serverFetch<SmartWalletActivityPayload[]>(
      `/api/operator/market/smart-wallet-events?limit=10&mints=${encodeURIComponent(mints)}`,
    );

    return (
      <div className="space-y-5">
        <CompactPageHeader
          eyebrow="Market intel"
          title="Trending"
          description="Hot mints with quick pin/open actions and smart-wallet activity context."
          actions={(
            <a href={marketRoutes.watchlist} className="text-xs text-text-secondary hover:text-text-primary">
              Open watchlist
            </a>
          )}
        />
        <MarketTrendingGrid
          mode="trending"
          initialPayload={initialPayload}
          initialSmartWalletEvents={initialSmartWalletEvents}
        />
      </div>
    );
  } catch (error) {
    return (
      <EmptyState
        title="Trending unavailable"
        detail={error instanceof Error ? error.message : "Failed to load /api/operator/market/trending."}
      />
    );
  }
}
