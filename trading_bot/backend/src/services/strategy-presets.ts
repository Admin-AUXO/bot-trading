import type { BotSettings, StrategyPackRecipe, StrategyPresetId, StrategyRecipeMode } from "../types/domain.js";

export type StrategyDiscoveryMode = "graduated" | "pregrad";

export type StrategyDiscoveryRecipe = {
  name: string;
  mode: StrategyDiscoveryMode;
  description: string;
  sortBy: string;
  sortType: "asc" | "desc";
  graduatedWithinSeconds?: number;
  minProgressPercent?: number;
  minLastTradeSeconds?: number;
  minLiquidityUsd?: number;
  minTrades1m?: number;
  minTrades5m?: number;
  limit?: number;
};

export type StrategyPreset = {
  id: StrategyPresetId;
  label: string;
  summary: string;
  discovery: StrategyDiscoveryRecipe;
  requiresHeliusWatcher: boolean;
  filterOverrides: Partial<BotSettings["filters"]>;
  exitOverrides: Partial<BotSettings["exits"]>;
};

export const STRATEGY_PRESETS: Record<StrategyPresetId, StrategyPreset> = {
  // ── 30-60% SCALP PRESET ──────────────────────────────────────────────
  // Tuned for fast momentum scalp: TP1 at ~28%, TP2 at ~50%, tight SL, short
  // time window. Momentum extension can push TP1 to ~34% on strong acceleration.
  SCALP_30_60_FAST: {
    id: "SCALP_30_60_FAST",
    label: "Scalp 30-60% Fast Momentum",
    summary: "Tight-freshness scalp preset: graduated <15 min, live 1m/5m tape, TP1 at 28%, TP2 at 50%. Momentum extension can push TP1 to 34% on strong acceleration.",
    discovery: {
      name: "scalp_30_60_grad_15m",
      mode: "graduated",
      description: "Graduated tokens within 15 minutes with strong live tape and momentum signals, tuned for 30-60% fast scalp exits.",
      sortBy: "last_trade_unix_time",
      sortType: "desc",
      graduatedWithinSeconds: 900,
      minLastTradeSeconds: 120,
      minTrades1m: 15,
      minLiquidityUsd: 15_000,
      limit: 120,
    },
    requiresHeliusWatcher: false,
    filterOverrides: {
      minLiquidityUsd: 15_000,
      maxMarketCapUsd: 1_200_000,
      minHolders: 45,
      minUniqueBuyers5m: 16,
      minBuySellRatio: 1.12,
      maxTop10HolderPercent: 40,
      maxSingleHolderPercent: 20,
      maxGraduationAgeSeconds: 900,
      minVolume5mUsd: 2_500,
      maxNegativePriceChange5mPercent: 10,
      securityCheckMinLiquidityUsd: 12_000,
      securityCheckVolumeMultiplier: 1,
      maxTransferFeePercent: 5,
    },
    // Calibrated for 30-60% scalp target:
    //   TP1 1.28 → 28% hit (momentum extension can push to ~34%)
    //   TP2 1.50 → 50% hit
    //   SL  10%  → tight stop for fast scalp
    //   Partial SL at -6% loss threshold (sell 50% on shallow losses)
    //   Time stop at 3 min / hard limit 6 min — scalp profile
    exitOverrides: {
      stopLossPercent: 10,
      tp1Multiplier: 1.28,
      tp2Multiplier: 1.50,
      tp1SellFraction: 0.55,
      tp2SellFraction: 0.30,
      postTp1RetracePercent: 8,
      trailingStopPercent: 10,
      timeStopMinutes: 3,
      timeStopMinReturnPercent: 5,
      timeLimitMinutes: 6,
    },
  },

  FIRST_MINUTE_POSTGRAD_CONTINUATION: {
    id: "FIRST_MINUTE_POSTGRAD_CONTINUATION",
    label: "First-Minute Post-Grad Continuation",
    summary: "Safer live preset: wait for graduation, then buy the first continuation while still taking real profit at 2x.",
    discovery: {
      name: "grad_10m_trade1m_continuation",
      mode: "graduated",
      description: "Fresh graduates ranked by 1m tape so the desk can react to real continuation instead of stale graduates.",
      sortBy: "trade_1m_count",
      sortType: "desc",
      graduatedWithinSeconds: 600,
      minLastTradeSeconds: 180,
      minTrades1m: 12,
      minLiquidityUsd: 10_000,
      limit: 120,
    },
    requiresHeliusWatcher: true,
    filterOverrides: {
      minLiquidityUsd: 12_000,
      maxMarketCapUsd: 5_000_000,
      minHolders: 50,
      minUniqueBuyers5m: 18,
      minBuySellRatio: 1.08,
      maxTop10HolderPercent: 42,
      maxSingleHolderPercent: 22,
      maxGraduationAgeSeconds: 900,
      minVolume5mUsd: 2_500,
      maxNegativePriceChange5mPercent: 8,
      securityCheckMinLiquidityUsd: 10_000,
      securityCheckVolumeMultiplier: 1,
      maxTransferFeePercent: 5,
    },
    exitOverrides: {
      stopLossPercent: 14,
      tp1Multiplier: 1.3,
      tp2Multiplier: 2.0,
      tp1SellFraction: 0.5,
      tp2SellFraction: 0.2,
      postTp1RetracePercent: 9,
      trailingStopPercent: 12,
      timeStopMinutes: 4,
      timeStopMinReturnPercent: 5,
      timeLimitMinutes: 8,
    },
  },
  LATE_CURVE_MIGRATION_SNIPE: {
    id: "LATE_CURVE_MIGRATION_SNIPE",
    label: "Late-Curve Migration Snipe",
    summary: "Aggressive research preset: buy near the finish line, take real money at 2x, and let a smaller remainder trail.",
    discovery: {
      name: "pregrad_985_trade1m_migration",
      mode: "pregrad",
      description: "Near-graduation names ranked by 1m trade count with only enough Birdeye filters to stay inside the endpoint ceiling.",
      sortBy: "trade_1m_count",
      sortType: "desc",
      minProgressPercent: 98.5,
      minLastTradeSeconds: 120,
      minTrades1m: 20,
      minLiquidityUsd: 6_000,
      limit: 120,
    },
    requiresHeliusWatcher: false,
    filterOverrides: {
      minLiquidityUsd: 8_000,
      maxMarketCapUsd: 7_000_000,
      minHolders: 30,
      minUniqueBuyers5m: 12,
      minBuySellRatio: 1.05,
      maxTop10HolderPercent: 45,
      maxSingleHolderPercent: 24,
      maxGraduationAgeSeconds: 180,
      minVolume5mUsd: 1_800,
      maxNegativePriceChange5mPercent: 6,
      securityCheckMinLiquidityUsd: 6_000,
      securityCheckVolumeMultiplier: 1,
      maxTransferFeePercent: 5,
    },
    exitOverrides: {
      stopLossPercent: 16,
      tp1Multiplier: 1.4,
      tp2Multiplier: 2.0,
      tp1SellFraction: 0.55,
      tp2SellFraction: 0.25,
      postTp1RetracePercent: 10,
      trailingStopPercent: 14,
      timeStopMinutes: 3,
      timeStopMinReturnPercent: 6,
      timeLimitMinutes: 6,
    },
  },
};

export function getStrategyPreset(id: StrategyPresetId): StrategyPreset {
  return STRATEGY_PRESETS[id];
}

export function getStrategyPresetForMode(
  settings: BotSettings,
  mode: "LIVE" | "DRY_RUN",
): StrategyPreset {
  const presetId = mode === "LIVE"
    ? settings.strategy.livePresetId
    : settings.strategy.dryRunPresetId;
  return getStrategyPreset(presetId);
}

export function applyStrategySettings(
  settings: BotSettings,
  presetId: StrategyPresetId,
): BotSettings {
  const preset = getStrategyPreset(presetId);
  const liveStrategy = settings.tradeMode === "LIVE" && settings.strategy.liveStrategy.enabled
    ? settings.strategy.liveStrategy
    : null;
  return {
    ...settings,
    filters: {
      ...settings.filters,
      ...preset.filterOverrides,
      ...(liveStrategy?.thresholdOverrides ?? {}),
    },
    exits: {
      ...settings.exits,
      ...preset.exitOverrides,
      ...(liveStrategy?.exitOverrides ?? {}),
    },
  };
}

export function hasLiveStrategy(settings: BotSettings): boolean {
  return settings.tradeMode === "LIVE"
    && settings.strategy.liveStrategy.enabled
    && settings.strategy.liveStrategy.recipes.length > 0;
}

export function getLiveStrategyRecipes(settings: BotSettings): StrategyPackRecipe[] {
  return hasLiveStrategy(settings)
    ? settings.strategy.liveStrategy.recipes
    : [];
}

export function derivePresetIdFromRecipeMode(mode: StrategyRecipeMode): StrategyPresetId {
  return mode === "pregrad"
    ? "LATE_CURVE_MIGRATION_SNIPE"
    : "FIRST_MINUTE_POSTGRAD_CONTINUATION";
}
