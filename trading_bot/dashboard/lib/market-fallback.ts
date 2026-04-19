import type { DiscoveryLabMarketStatsPayload } from "@/lib/types";

export function buildDegradedMarketStatsPayload(
  detail: string,
  options?: {
    scope?: "trending" | "watchlist";
    cacheState?: "empty" | "degraded";
  },
): DiscoveryLabMarketStatsPayload {
  const generatedAt = new Date().toISOString();
  const scope = options?.scope ?? "trending";

  return {
    generatedAt,
    meta: {
      refreshMode: "manual",
      scope,
      cacheState: options?.cacheState ?? "degraded",
      lastRefreshedAt: null,
      staleMinutes: null,
      warnings: [detail],
      focusMint: null,
      focusTokenCachedAt: null,
      sources: [],
    },
    tokenUniverseSize: 0,
    marketPulse: {
      advancingSharePercent: 0,
      cautionSharePercent: 0,
      medianPriceChange5mPercent: null,
      medianLiquidityUsd: null,
      medianVolume24hUsd: null,
      medianRugScoreNormalized: null,
      trackedOpenPositions: 0,
    },
    sourceMix: {
      birdeyeRecentCount: 0,
      birdeyeMomentumCount: 0,
      rugcheckRecentCount: 0,
      rugcheckVerifiedCount: 0,
      watchlistCount: 0,
    },
    providerCoverage: {
      dexscreenerPairCount: 0,
      rugcheckSummaryCount: 0,
      trackedPositionCount: 0,
    },
    tokens: [],
    focusToken: null,
  };
}
