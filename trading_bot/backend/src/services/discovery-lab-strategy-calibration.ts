import type {
  BotSettings,
  LiveStrategySettings,
  StrategyPresetId,
  StrategyRecipeMode,
  StrategyThresholdOverrides,
} from "../types/domain.js";
import type { DiscoveryLabRunDetail } from "./discovery-lab-service.js";
import { buildAdaptiveDecisionBands, buildAdaptiveWinnerCohorts } from "./adaptive-model.js";
import { buildExitPlan } from "./strategy-exit.js";
import { derivePresetIdForPack, derivePresetIdFromRecipeMode } from "./strategy-presets.js";

type WinnerEvaluation = NonNullable<DiscoveryLabRunDetail["report"]>["deepEvaluations"][number];

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function inferWinnerMode(run: DiscoveryLabRunDetail, mint: string): StrategyRecipeMode | null {
  const evaluations = run.report?.deepEvaluations
    .filter((row) => row.mint === mint && row.pass)
    .sort((left, right) => right.playScore - left.playScore || right.entryScore - left.entryScore) ?? [];

  return evaluations[0]?.mode ?? null;
}

function inferDominantMode(run: DiscoveryLabRunDetail): StrategyRecipeMode | null {
  const counts = new Map<StrategyRecipeMode, number>([
    ["graduated", 0],
    ["pregrad", 0],
  ]);

  for (const winner of run.report?.winners ?? []) {
    const mode = inferWinnerMode(run, winner.address);
    if (!mode) {
      continue;
    }
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }

  const graduated = counts.get("graduated") ?? 0;
  const pregrad = counts.get("pregrad") ?? 0;
  if (graduated === 0 && pregrad === 0) {
    return null;
  }
  return pregrad > graduated ? "pregrad" : "graduated";
}

function inferPackMode(run: DiscoveryLabRunDetail): StrategyRecipeMode | null {
  const modes = new Set(run.packSnapshot.recipes.map((recipe) => recipe.mode));
  if (modes.size === 0) {
    return null;
  }
  if (modes.size === 1) {
    return modes.has("pregrad") ? "pregrad" : "graduated";
  }
  return inferDominantMode(run);
}

function deriveProfile(avgWinnerScore: number | null): "scalp" | "balanced" | "runner" | null {
  if (avgWinnerScore === null) {
    return null;
  }
  if (avgWinnerScore >= 0.92) {
    return "runner";
  }
  if (avgWinnerScore >= 0.74) {
    return "balanced";
  }
  return "scalp";
}

function normalizeScore(score: number | null): number {
  if (score === null) {
    return 0.5;
  }
  return clamp((score - 0.55) / 0.35, 0, 1);
}

function normalizeVolume(volume5mUsd: number | null): number {
  if (volume5mUsd === null || volume5mUsd <= 0) {
    return 0.35;
  }
  const logVolume = Math.log10(volume5mUsd);
  return clamp((logVolume - 3.2) / 1.7, 0, 1);
}

function normalizeFreshness(
  dominantMode: StrategyRecipeMode | null,
  avgWinnerTimeSinceGraduationMin: number | null,
): number {
  if (dominantMode === "pregrad") {
    return 0.9;
  }
  if (avgWinnerTimeSinceGraduationMin === null) {
    return 0.5;
  }
  return clamp(1 - (avgWinnerTimeSinceGraduationMin / 45), 0, 1);
}

function normalizeSocialStrength(avgSocialCount: number | null): number {
  if (avgSocialCount === null) {
    return 0.25;
  }
  return clamp(avgSocialCount / 2.25, 0, 1);
}

function normalizeStructureStrength(
  avgTop10HolderPercent: number | null,
  avgLargestHolderPercent: number | null,
  avgSoftIssueCount: number | null,
): number {
  const top10Strength = avgTop10HolderPercent === null
    ? 0.45
    : clamp(1 - ((avgTop10HolderPercent - 22) / 26), 0, 1);
  const singleStrength = avgLargestHolderPercent === null
    ? 0.45
    : clamp(1 - ((avgLargestHolderPercent - 10) / 14), 0, 1);
  const issueStrength = avgSoftIssueCount === null
    ? 0.5
    : clamp(1 - (avgSoftIssueCount / 2.5), 0, 1);
  return clamp((top10Strength * 0.45) + (singleStrength * 0.35) + (issueStrength * 0.2), 0, 1);
}

function deriveCalibrationConfidence(input: {
  avgWinnerScore: number | null;
  avgWinnerVolume5mUsd: number | null;
  dominantMode: StrategyRecipeMode | null;
  avgWinnerTimeSinceGraduationMin: number | null;
  avgSocialCount: number | null;
  avgTop10HolderPercent: number | null;
  avgLargestHolderPercent: number | null;
  avgSoftIssueCount: number | null;
}): {
  scoreStrength: number;
  volumeStrength: number;
  graduationFreshness: number;
  socialStrength: number;
  structureStrength: number;
  confidence: number;
} {
  const scoreStrength = normalizeScore(input.avgWinnerScore);
  const volumeStrength = normalizeVolume(input.avgWinnerVolume5mUsd);
  const graduationFreshness = normalizeFreshness(input.dominantMode, input.avgWinnerTimeSinceGraduationMin);
  const socialStrength = normalizeSocialStrength(input.avgSocialCount);
  const structureStrength = normalizeStructureStrength(
    input.avgTop10HolderPercent,
    input.avgLargestHolderPercent,
    input.avgSoftIssueCount,
  );
  const confidence = clamp(
    (scoreStrength * 0.34)
      + (volumeStrength * 0.22)
      + (graduationFreshness * 0.2)
      + (structureStrength * 0.16)
      + (socialStrength * 0.08),
    0,
    1,
  );

  return {
    scoreStrength,
    volumeStrength,
    graduationFreshness,
    socialStrength,
    structureStrength,
    confidence,
  };
}

function deriveCapitalModifierPercent(input: {
  confidence: number;
  avgRecipeOverlap: number | null;
  profile: "scalp" | "balanced" | "runner" | null;
  avgWinnerTimeSinceGraduationMin: number | null;
  avgWinnerMarketCapUsd: number | null;
  winnerCount: number;
  socialStrength: number;
  structureStrength: number;
}): number {
  let modifier = 68 + (input.confidence * 48);

  if (input.avgRecipeOverlap !== null) {
    modifier += clamp((input.avgRecipeOverlap - 1) * 8, 0, 14);
  }

  if (input.profile === "runner") {
    modifier += 5;
  } else if (input.profile === "scalp") {
    modifier -= 4;
  }

  modifier += (input.socialStrength - 0.45) * 12;
  modifier += (input.structureStrength - 0.5) * 14;

  if ((input.avgWinnerMarketCapUsd ?? Number.POSITIVE_INFINITY) < 750_000) {
    modifier -= 7;
  }
  if ((input.avgWinnerTimeSinceGraduationMin ?? Number.POSITIVE_INFINITY) <= 30) {
    modifier -= 6;
  }
  if (input.winnerCount <= 2) {
    modifier -= 10;
  }

  const upperBound = (input.avgWinnerTimeSinceGraduationMin ?? Number.POSITIVE_INFINITY) <= 30 ? 112 : 135;
  return Math.round(clamp(modifier, 55, upperBound));
}

function deriveThresholdOverrides(input: {
  baseSettings: BotSettings;
  run: DiscoveryLabRunDetail;
  winnerCount: number;
  dominantMode: StrategyRecipeMode | null;
  avgWinnerLiquidityUsd: number | null;
  avgWinnerVolume5mUsd: number | null;
  avgWinnerMarketCapUsd: number | null;
  avgWinnerTimeSinceGraduationMin: number | null;
  avgWinnerUniqueWallets5m: number | null;
  avgWinnerBuySellRatio: number | null;
  avgWinnerTop10HolderPercent: number | null;
  avgWinnerLargestHolderPercent: number | null;
  avgSocialCount: number | null;
  avgSoftIssueCount: number | null;
  structureStrength: number;
}): StrategyThresholdOverrides {
  const filters = input.baseSettings.filters;
  const sourceOverrides = input.run.thresholdOverrides;
  const freshMinutes = input.avgWinnerTimeSinceGraduationMin ?? 45;
  const microCapBias = (input.avgWinnerMarketCapUsd ?? filters.maxMarketCapUsd) < 900_000;
  const socialSupport = input.avgSocialCount ?? 0;
  const structureTightness = 1 - input.structureStrength;
  const securityBias = Math.min(input.avgSoftIssueCount ?? 0, 2) * 0.12;

  const minLiquidityUsd = round(clamp(
    Math.max(
      sourceOverrides.minLiquidityUsd ?? filters.minLiquidityUsd,
      (input.avgWinnerLiquidityUsd ?? filters.minLiquidityUsd) * (microCapBias ? 0.58 : 0.48),
    ),
    6_000,
    38_000,
  ), 0);
  const minVolume5mUsd = round(clamp(
    Math.max(
      sourceOverrides.minVolume5mUsd ?? filters.minVolume5mUsd,
      (input.avgWinnerVolume5mUsd ?? filters.minVolume5mUsd) * (freshMinutes <= 30 ? 0.64 : 0.52),
    ),
    1_000,
    22_000,
  ), 0);
  const minUniqueBuyers5m = Math.round(clamp(
    Math.max(
      sourceOverrides.minUniqueBuyers5m ?? filters.minUniqueBuyers5m,
      (input.avgWinnerUniqueWallets5m ?? filters.minUniqueBuyers5m) * (freshMinutes <= 30 ? 0.72 : 0.62),
    ),
    10,
    72,
  ));
  const minBuySellRatio = round(clamp(
    Math.max(
      sourceOverrides.minBuySellRatio ?? filters.minBuySellRatio,
      (input.avgWinnerBuySellRatio ?? filters.minBuySellRatio) * (freshMinutes <= 30 ? 0.9 : 0.84),
    ) + (socialSupport === 0 ? 0.05 : 0),
    1.02,
    1.75,
  ), 2);
  const maxTop10HolderPercent = round(clamp(
    Math.min(
      sourceOverrides.maxTop10HolderPercent ?? filters.maxTop10HolderPercent,
      (input.avgWinnerTop10HolderPercent ?? filters.maxTop10HolderPercent) + 5 - (securityBias * 10),
    ),
    20,
    42,
  ), 1);
  const maxSingleHolderPercent = round(clamp(
    Math.min(
      sourceOverrides.maxSingleHolderPercent ?? filters.maxSingleHolderPercent,
      (input.avgWinnerLargestHolderPercent ?? filters.maxSingleHolderPercent) + 3 - (securityBias * 6),
    ),
    8,
    22,
  ), 1);
  const maxMarketCapUsd = round(clamp(
    Math.min(
      sourceOverrides.maxMarketCapUsd ?? filters.maxMarketCapUsd,
      (input.avgWinnerMarketCapUsd ?? filters.maxMarketCapUsd) * (freshMinutes <= 15 ? 1.35 : freshMinutes <= 30 ? 1.55 : 1.9),
    ),
    180_000,
    3_200_000,
  ), 0);
  const maxGraduationAgeSeconds = Math.round(clamp(
    freshMinutes <= 15
      ? (freshMinutes * 60 * 1.55)
      : freshMinutes <= 30
        ? (freshMinutes * 60 * 1.45)
        : (freshMinutes * 60 * 1.85),
    input.dominantMode === "pregrad" ? 300 : 600,
    input.dominantMode === "pregrad" ? 1_800 : 5_400,
  ));
  const maxNegativePriceChange5mPercent = round(clamp(
    (sourceOverrides.maxNegativePriceChange5mPercent ?? filters.maxNegativePriceChange5mPercent)
      - (input.structureStrength * 2.2)
      + (socialSupport === 0 ? 1.2 : 0),
    6,
    16,
  ), 1);

  return {
    minLiquidityUsd,
    maxMarketCapUsd,
    minHolders: Math.round(clamp(
      Math.max(sourceOverrides.minHolders ?? filters.minHolders, filters.minHolders * (freshMinutes <= 30 ? 0.75 : 0.9)),
      30,
      180,
    )),
    minUniqueBuyers5m,
    minBuySellRatio,
    maxTop10HolderPercent,
    maxSingleHolderPercent,
    maxGraduationAgeSeconds,
    minVolume5mUsd,
    maxNegativePriceChange5mPercent,
    securityCheckMinLiquidityUsd: round(clamp(minLiquidityUsd * (freshMinutes <= 30 ? 0.7 : 0.6), 4_500, 24_000), 0),
    securityCheckVolumeMultiplier: round(clamp(1.12 + structureTightness * 0.22 + securityBias, 1.05, 1.55), 2),
    maxTransferFeePercent: round(clamp(4 - (input.structureStrength * 1.2) - (socialSupport >= 2 ? 0.4 : 0), 1.5, 5), 1),
  };
}

function deriveExitOverrides(input: {
  exitPlan: ReturnType<typeof buildExitPlan>;
  confidence: number;
  volumeStrength: number;
  graduationFreshness: number;
  structureStrength: number;
  socialStrength: number;
}) {
  const convictionDrift = input.confidence - 0.5;
  const volumeDrag = 1 - input.volumeStrength;
  const freshnessCompression = input.graduationFreshness * 1.4;
  const fragility = 1 - ((input.structureStrength * 0.72) + (input.socialStrength * 0.28));

  const stopLossPercent = clamp(
    input.exitPlan.stopLossPercent
      + (0.5 - input.confidence) * 3
      + (fragility * 1.4)
      - (freshnessCompression * 0.8),
    8,
    20,
  );
  const tp1Multiplier = clamp(
    input.exitPlan.tp1Multiplier
      + (convictionDrift * 0.14)
      + (input.volumeStrength * 0.05)
      - (fragility * 0.08),
    1.15,
    1.8,
  );
  const tp2Multiplier = clamp(
    Math.max(
      input.exitPlan.tp2Multiplier
        + (convictionDrift * 0.24)
        + (input.volumeStrength * 0.08)
        - (fragility * 0.12),
      tp1Multiplier + 0.18,
    ),
    tp1Multiplier + 0.18,
    2.9,
  );
  let tp1SellFraction = clamp(
    input.exitPlan.tp1SellFraction
      - (convictionDrift * 0.12)
      + (fragility * 0.12)
      + (freshnessCompression * 0.03),
    0.28,
    0.76,
  );
  let tp2SellFraction = clamp(
    input.exitPlan.tp2SellFraction
      - (convictionDrift * 0.06)
      - (fragility * 0.04),
    0.08,
    0.34,
  );

  if (tp1SellFraction + tp2SellFraction > 0.95) {
    const scale = 0.95 / (tp1SellFraction + tp2SellFraction);
    tp1SellFraction *= scale;
    tp2SellFraction *= scale;
  }

  const timeStopMinutes = clamp(
    input.exitPlan.timeStopMinutes
      + (0.5 - input.confidence) * 1.4
      + (volumeDrag * 0.9)
      + (fragility * 1.2)
      - freshnessCompression,
    2,
    10,
  );
  const timeLimitMinutes = Math.max(
    clamp(
      input.exitPlan.timeLimitMinutes
        + (0.5 - input.confidence) * 1.8
        + (fragility * 1.3)
        - (freshnessCompression * 1.2),
      4,
      18,
    ),
    timeStopMinutes + 1,
  );

  return {
    stopLossPercent: round(stopLossPercent),
    tp1Multiplier: round(tp1Multiplier, 4),
    tp2Multiplier: round(tp2Multiplier, 4),
    tp1SellFraction: round(tp1SellFraction, 4),
    tp2SellFraction: round(tp2SellFraction, 4),
    postTp1RetracePercent: round(clamp(input.exitPlan.postTp1RetracePercent - (freshnessCompression * 1.6) - (fragility * 1.5), 5, 14)),
    trailingStopPercent: round(clamp(input.exitPlan.trailingStopPercent - (freshnessCompression * 1.9) - (fragility * 1.2), 7, 16)),
    timeStopMinutes: round(timeStopMinutes, 1),
    timeStopMinReturnPercent: round(clamp(
      input.exitPlan.timeStopMinReturnPercent
        + (convictionDrift * 1.7)
        + (input.volumeStrength * 1.2)
        + (freshnessCompression * 0.6),
      2,
      12,
    )),
    timeLimitMinutes: round(timeLimitMinutes, 1),
  };
}

function stripLiveStrategy(settings: BotSettings): BotSettings {
  return {
    ...settings,
    strategy: {
      ...settings.strategy,
      liveStrategy: {
        ...settings.strategy.liveStrategy,
        enabled: false,
      },
    },
  };
}

function getWinnerEvaluations(run: DiscoveryLabRunDetail): WinnerEvaluation[] {
  const winnerMints = new Set(run.report?.winners.map((winner) => winner.address) ?? []);
  const bestRows = new Map<string, WinnerEvaluation>();

  for (const row of run.report?.deepEvaluations ?? []) {
    if (!winnerMints.has(row.mint) || !row.pass) {
      continue;
    }
    const current = bestRows.get(row.mint);
    if (!current || row.playScore > current.playScore || (row.playScore === current.playScore && row.entryScore > current.entryScore)) {
      bestRows.set(row.mint, row);
    }
  }

  return [...bestRows.values()];
}

export function buildDiscoveryLabLiveStrategy(
  run: DiscoveryLabRunDetail,
  baseSettings: BotSettings,
): LiveStrategySettings {
  const winners = run.report?.winners ?? [];
  const winnerRows = getWinnerEvaluations(run);
  const winnerCount = winners.length;
  const avgWinnerScore = average(winners.map((winner) => winner.score));
  const avgWinnerVolume5mUsd = average(
    winners
      .map((winner) => winner.volume5mUsd)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerMarketCapUsd = average(
    winners
      .map((winner) => winner.marketCapUsd)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerLiquidityUsd = average(
    winnerRows
      .map((winner) => winner.liquidityUsd)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerTimeSinceGraduationMin = average(
    winners
      .map((winner) => winner.timeSinceGraduationMin)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerUniqueWallets5m = average(
    winnerRows
      .map((winner) => winner.uniqueWallets5m)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerBuySellRatio = average(
    winnerRows
      .map((winner) => winner.buySellRatio)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerTop10HolderPercent = average(
    winnerRows
      .map((winner) => winner.top10HolderPercent)
      .filter((value): value is number => value !== null),
  );
  const avgWinnerLargestHolderPercent = average(
    winnerRows
      .map((winner) => winner.largestHolderPercent)
      .filter((value): value is number => value !== null),
  );
  const avgSocialCount = average(
    winnerRows
      .map((winner) => winner.socials?.count)
      .filter((value): value is number => value !== null && value !== undefined),
  );
  const avgSoftIssueCount = average(winnerRows.map((winner) => winner.softIssues.length));
  const avgRecipeOverlap = average(winners.map((winner) => winner.whichRecipes.length));
  const dominantMode = inferDominantMode(run);
  const packMode = inferPackMode(run);
  const dominantPresetId: StrategyPresetId = dominantMode
    ? derivePresetIdFromRecipeMode(dominantMode)
    : derivePresetIdForPack({
      mode: packMode,
      profile: run.packSnapshot.defaultProfile,
    });
  const derivedProfile = deriveProfile(avgWinnerScore);
  const winnerCohorts = buildAdaptiveWinnerCohorts(run);
  const decisionBands = buildAdaptiveDecisionBands(winnerCohorts);
  const calibration = deriveCalibrationConfidence({
    avgWinnerScore,
    avgWinnerVolume5mUsd,
    dominantMode,
    avgWinnerTimeSinceGraduationMin,
    avgSocialCount,
    avgTop10HolderPercent: avgWinnerTop10HolderPercent,
    avgLargestHolderPercent: avgWinnerLargestHolderPercent,
    avgSoftIssueCount,
  });
  const confidenceForSizing = winnerCount > 0 ? calibration.confidence : 0.5;
  const capitalModifierPercent = winnerCount > 0
    ? deriveCapitalModifierPercent({
      confidence: confidenceForSizing,
      avgRecipeOverlap,
      profile: derivedProfile,
      avgWinnerTimeSinceGraduationMin,
      avgWinnerMarketCapUsd,
      winnerCount,
      socialStrength: calibration.socialStrength,
      structureStrength: calibration.structureStrength,
    })
    : 100;

  const thresholdOverrides = winnerCount > 0
    ? deriveThresholdOverrides({
      baseSettings,
      run,
      winnerCount,
      dominantMode,
      avgWinnerLiquidityUsd,
      avgWinnerVolume5mUsd,
      avgWinnerMarketCapUsd,
      avgWinnerTimeSinceGraduationMin,
      avgWinnerUniqueWallets5m,
      avgWinnerBuySellRatio,
      avgWinnerTop10HolderPercent,
      avgWinnerLargestHolderPercent,
      avgSocialCount,
      avgSoftIssueCount,
      structureStrength: calibration.structureStrength,
    })
    : { ...run.thresholdOverrides };

  const baseStrategySettings = stripLiveStrategy({
    ...baseSettings,
    tradeMode: "LIVE",
  });
  const baseExitPlan = buildExitPlan(
    baseStrategySettings,
    clamp(
      avgWinnerScore
        ?? (run.packSnapshot.defaultProfile === "scalp" ? 0.58 : 0.68),
      0,
      1,
    ),
    dominantPresetId,
    {
      marketCapUsd: avgWinnerMarketCapUsd,
      timeSinceGraduationMin: avgWinnerTimeSinceGraduationMin,
      top10HolderPercent: avgWinnerTop10HolderPercent,
      largestHolderPercent: avgWinnerLargestHolderPercent,
      socialCount: avgSocialCount,
      softIssueCount: avgSoftIssueCount,
    },
  );

  return {
    enabled: true,
    sourceRunId: run.id,
    packId: run.packSnapshot.id,
    packName: run.packSnapshot.name,
    sources: run.sources,
    recipes: run.packSnapshot.recipes,
    thresholdOverrides,
    exitOverrides: deriveExitOverrides({
      exitPlan: baseExitPlan,
      confidence: confidenceForSizing,
      volumeStrength: winnerCount > 0 ? calibration.volumeStrength : 0.5,
      graduationFreshness: winnerCount > 0 ? calibration.graduationFreshness : 0.5,
      structureStrength: winnerCount > 0 ? calibration.structureStrength : 0.5,
      socialStrength: winnerCount > 0 ? calibration.socialStrength : 0.4,
    }),
    capitalModifierPercent,
    dominantMode,
    dominantPresetId,
    calibrationSummary: {
      winnerCount,
      avgWinnerScore: avgWinnerScore === null ? null : round(avgWinnerScore, 4),
      avgWinnerVolume5mUsd: avgWinnerVolume5mUsd === null ? null : round(avgWinnerVolume5mUsd),
      avgWinnerMarketCapUsd: avgWinnerMarketCapUsd === null ? null : round(avgWinnerMarketCapUsd),
      avgWinnerTimeSinceGraduationMin: avgWinnerTimeSinceGraduationMin === null ? null : round(avgWinnerTimeSinceGraduationMin, 2),
      avgRecipeOverlap: avgRecipeOverlap === null ? null : round(avgRecipeOverlap, 2),
      volumeStrength: winnerCount > 0 ? round(calibration.volumeStrength, 4) : null,
      graduationFreshness: winnerCount > 0 ? round(calibration.graduationFreshness, 4) : null,
      calibrationConfidence: winnerCount > 0 ? round(calibration.confidence, 4) : null,
      dominantMode,
      derivedProfile,
    },
    winnerCohorts,
    decisionBands,
    updatedAt: run.completedAt ?? run.startedAt,
  };
}
