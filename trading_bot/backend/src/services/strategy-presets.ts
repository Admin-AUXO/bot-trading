import type { BotSettings, StrategyPresetId } from "../types/domain.js";

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
      minLastTradeSeconds: 120,
      minTrades1m: 18,
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
  return {
    ...settings,
    filters: {
      ...settings.filters,
      ...preset.filterOverrides,
    },
    exits: {
      ...settings.exits,
      ...preset.exitOverrides,
    },
  };
}
