import type { DiscoveryLabMarketStatsPayload } from "@/lib/types";

export function buildDegradedMarketStatsPayload(detail: string): DiscoveryLabMarketStatsPayload {
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    meta: {
      refreshMode: "manual",
      cacheState: "degraded",
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
    },
    tokens: [],
    focusToken: null,
  };
}
