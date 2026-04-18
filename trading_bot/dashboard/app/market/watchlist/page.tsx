import { CompactPageHeader, EmptyState } from "@/components/dashboard-primitives";
import { MarketTrendingGrid } from "@/components/market-trending-grid";
import { serverFetch } from "@/lib/server-api";
import { marketRoutes } from "@/lib/dashboard-routes";
import type { DiscoveryLabMarketStatsPayload, SmartWalletActivityPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketWatchlistPage() {
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
          title="Watchlist"
          description="Token watchlist currently uses local browser storage in this repo snapshot."
          actions={(
            <a href={marketRoutes.trending} className="text-xs text-text-secondary hover:text-text-primary">
              Open trending board
            </a>
          )}
        />
        <MarketTrendingGrid
          mode="watchlist"
          initialPayload={initialPayload}
          initialSmartWalletEvents={initialSmartWalletEvents}
        />
      </div>
    );
  } catch (error) {
    return (
      <EmptyState
        title="Watchlist unavailable"
        detail={error instanceof Error ? error.message : "Failed to load watchlist dependencies."}
      />
    );
  }
}
