import { CompactPageHeader, InlineNotice } from "@/components/dashboard-primitives";
import { MarketTrendingGrid } from "@/components/market-trending-grid";
import { buildDegradedMarketStatsPayload } from "@/lib/market-fallback";
import type { DiscoveryLabMarketStatsPayload, SmartWalletActivityPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketWatchlistPage() {
  const initialPayload: DiscoveryLabMarketStatsPayload = buildDegradedMarketStatsPayload(
    "Watchlist loads from your pinned mints after the browser syncs local storage.",
    { scope: "watchlist", cacheState: "empty" },
  );
  const initialSmartWalletEvents: SmartWalletActivityPayload[] = [];

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Market intel"
        title="Watchlist"
        description="Pinned tokens only. This board refreshes from your local watchlist and uses the lighter market path first."
      />
      <InlineNotice tone="warning">
        Your watchlist is stored in browser-local storage only. Clearing browser data or using a different browser will result in loss of your pinned tokens.
      </InlineNotice>
      <MarketTrendingGrid
        mode="watchlist"
        initialPayload={initialPayload}
        initialSmartWalletEvents={initialSmartWalletEvents}
      />
    </div>
  );
}
