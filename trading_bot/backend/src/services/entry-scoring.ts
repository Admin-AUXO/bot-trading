import { clamp } from "../utils/types.js";

export type EntryScoringThresholds = {
  minLiquidityUsd: number;
  minVolume5mUsd: number;
  minBuySellRatio: number;
  minUniqueBuyers5m: number;
  minHolders: number;
  maxTop10HolderPercent: number;
  maxSingleHolderPercent: number;
  maxNegativePriceChange5mPercent: number;
  maxGraduationAgeSeconds: number;
};

export type EntryScoringSignal = {
  liquidityUsd: number | null | undefined;
  volume5mUsd: number | null | undefined;
  buySellRatio: number | null | undefined;
  priceChange5mPercent: number | null | undefined;
  uniqueWallets5m: number | null | undefined;
  holders: number | null | undefined;
  top10HolderPercent: number | null | undefined;
  largestHolderPercent: number | null | undefined;
  ageSeconds: number;
  priceChangeSinceDiscoveryPercent?: number | null | undefined;
  source?: string | null | undefined;
  statusAdjustment?: number;
};

export type ExitProfile = "scalp" | "balanced" | "runner";

export function deriveExitProfile(entryScore: number): ExitProfile {
  if (entryScore >= 0.82) {
    return "runner";
  }
  if (entryScore >= 0.62) {
    return "balanced";
  }
  return "scalp";
}

export function buildSignalConfidence(input: {
  entryScore: number;
  playScore?: number | null;
  winnerScore?: number | null;
}): number {
  const entryScore = clamp(input.entryScore, 0, 1);
  const playScore = clamp(input.playScore ?? input.winnerScore ?? entryScore, 0, 1);
  const winnerScore = clamp(input.winnerScore ?? playScore, 0, 1);
  return round(clamp((entryScore * 0.65) + (playScore * 0.2) + (winnerScore * 0.15), 0, 1), 4);
}

export function scoreEntrySignal(
  signal: EntryScoringSignal,
  thresholds: EntryScoringThresholds,
): number {
  const ageScore = clamp(1 - (signal.ageSeconds / Math.max(thresholds.maxGraduationAgeSeconds, 1)), 0, 1);
  const volumeScore = logScore(signal.volume5mUsd ?? 0, thresholds.minVolume5mUsd);
  const ratioScore = clamp(
    ((signal.buySellRatio ?? 0) - thresholds.minBuySellRatio) / Math.max(thresholds.minBuySellRatio, 1),
    0,
    1,
  );
  const priceScore = clamp(
    ((signal.priceChange5mPercent ?? 0) + thresholds.maxNegativePriceChange5mPercent)
      / Math.max(thresholds.maxNegativePriceChange5mPercent + 20, 1),
    0,
    1,
  );
  const momentumScore = (volumeScore * 0.45) + (ratioScore * 0.35) + (priceScore * 0.2);

  const uniqueBuyerScore = clamp((signal.uniqueWallets5m ?? 0) / Math.max(thresholds.minUniqueBuyers5m * 2, 1), 0, 1);
  const holderScore = clamp((signal.holders ?? 0) / Math.max(thresholds.minHolders * 2, 1), 0, 1);
  const top10Score = clamp(
    1 - ((signal.top10HolderPercent ?? thresholds.maxTop10HolderPercent) / Math.max(thresholds.maxTop10HolderPercent, 1)),
    0,
    1,
  );
  const largestHolderScore = clamp(
    1 - ((signal.largestHolderPercent ?? thresholds.maxSingleHolderPercent) / Math.max(thresholds.maxSingleHolderPercent, 1)),
    0,
    1,
  );
  const structureScore = (uniqueBuyerScore * 0.5) + (holderScore * 0.25) + (top10Score * 0.15) + (largestHolderScore * 0.1);

  const liquidityScore = logScore(signal.liquidityUsd ?? 0, thresholds.minLiquidityUsd);
  const exitabilityScore = (liquidityScore * 0.75) + (ageScore * 0.25);

  // Fair value bonus: buying below or near discovery price is structural quality.
  // Penalty for buying significantly above discovery price.
  // Range: -0.08 (paying 8%+ premium) to +0.08 (buying at a discount).
  const priceDelta = signal.priceChangeSinceDiscoveryPercent;
  const priceQualityBonus = priceDelta != null
    ? clamp(-priceDelta / 100 / 2.5, -0.08, 0.08)
    : 0;

  const sourceBoost = signal.source === "pump_dot_fun" ? 0.03 : 0;
  return round(
    clamp(
      (momentumScore * 0.35)
        + (structureScore * 0.35)
        + (exitabilityScore * 0.3)
        + sourceBoost
        + priceQualityBonus
        + (signal.statusAdjustment ?? 0),
      0,
      1.2,
    ),
    6,
  );
}

export function logScore(value: number, floor: number): number {
  const safeValue = Math.max(Number(value) || 0, 0);
  const safeFloor = Math.max(Number(floor) || 1, 1);
  if (safeValue <= 0) {
    return 0;
  }
  const normalized = Math.log10(safeValue + 1) / Math.log10((safeFloor * 10) + 1);
  return clamp(normalized, 0, 1);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
