import { CompactPageHeader } from "@/components/dashboard-primitives";
import { MarketStrategyIdeasPanel } from "@/components/market-strategy-ideas-panel";
import { MarketTrendingGrid } from "@/components/market-trending-grid";
import { serverFetch } from "@/lib/server-api";
import { buildDegradedMarketStatsPayload } from "@/lib/market-fallback";
import { formatTimestamp } from "@/lib/format";
import type {
  DiscoveryLabMarketStatsPayload,
  DiscoveryLabStrategySuggestionsPayload,
  SmartWalletActivityPayload,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketTrendingPage() {
  const [payloadResult, ideasResult] = await Promise.all([
    Promise.allSettled([
      serverFetch<DiscoveryLabMarketStatsPayload>("/api/operator/market/trending?limit=50"),
    ]),
    Promise.allSettled([
      serverFetch<DiscoveryLabStrategySuggestionsPayload>("/api/operator/market/strategy-suggestions"),
    ]),
  ]);
  const initialPayload = payloadResult[0]?.status === "fulfilled"
    ? payloadResult[0].value
    : buildDegradedMarketStatsPayload(
      payloadResult[0]?.reason instanceof Error ? payloadResult[0].reason.message : "Failed to load /api/operator/market/trending.",
      { scope: "trending" },
    );
  const initialIdeas = ideasResult[0]?.status === "fulfilled" ? ideasResult[0].value : null;
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
        description="Scan the paid-seeded board, pin what matters, and move conviction names into the lighter watchlist flow."
      >
        <div className="mt-2 text-xs text-text-muted">
          Last updated: {formatTimestamp(initialPayload.meta.lastRefreshedAt)}
        </div>
      </CompactPageHeader>
      <MarketStrategyIdeasPanel initialPayload={initialIdeas} />
      <MarketTrendingGrid
        mode="trending"
        initialPayload={initialPayload}
        initialSmartWalletEvents={initialSmartWalletEvents}
      />
    </div>
  );
}
