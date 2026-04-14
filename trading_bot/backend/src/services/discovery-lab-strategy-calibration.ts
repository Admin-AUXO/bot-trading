import type { BotSettings, LiveStrategySettings, StrategyPresetId, StrategyRecipeMode } from "../types/domain.js";
import type { DiscoveryLabRunDetail } from "./discovery-lab-service.js";
import { buildExitPlan } from "./strategy-exit.js";
import { derivePresetIdFromRecipeMode } from "./strategy-presets.js";

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

function deriveProfile(avgWinnerScore: number | null): "scalp" | "balanced" | "runner" | null {
  if (avgWinnerScore === null) {
    return null;
  }
  if (avgWinnerScore >= 0.92) {
    return "runner";
  }
  if (avgWinnerScore >= 0.72) {
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
  return clamp((logVolume - 3.2) / 1.6, 0, 1);
}

function normalizeFreshness(
  dominantMode: StrategyRecipeMode | null,
  avgWinnerTimeSinceGraduationMin: number | null,
): number {
  if (dominantMode === "pregrad") {
    return 0.85;
  }
  if (avgWinnerTimeSinceGraduationMin === null) {
    return 0.5;
  }
  return clamp(1 - (avgWinnerTimeSinceGraduationMin / 30), 0, 1);
}

function deriveCalibrationConfidence(
  avgWinnerScore: number | null,
  avgWinnerVolume5mUsd: number | null,
  dominantMode: StrategyRecipeMode | null,
  avgWinnerTimeSinceGraduationMin: number | null,
): {
  scoreStrength: number;
  volumeStrength: number;
  graduationFreshness: number;
  confidence: number;
} {
  const scoreStrength = normalizeScore(avgWinnerScore);
  const volumeStrength = normalizeVolume(avgWinnerVolume5mUsd);
  const graduationFreshness = normalizeFreshness(dominantMode, avgWinnerTimeSinceGraduationMin);
  const confidence = clamp(
    (scoreStrength * 0.5)
    + (volumeStrength * 0.3)
    + (graduationFreshness * 0.2),
    0,
    1,
  );

  return {
    scoreStrength,
    volumeStrength,
    graduationFreshness,
    confidence,
  };
}

function deriveCapitalModifierPercent(input: {
  confidence: number;
  avgRecipeOverlap: number | null;
  profile: "scalp" | "balanced" | "runner" | null;
}): number {
  let modifier = 70 + (input.confidence * 60);
  if (input.avgRecipeOverlap !== null) {
    modifier += clamp((input.avgRecipeOverlap - 1) * 10, 0, 18);
  }
  if (input.profile === "runner") {
    modifier += 6;
  } else if (input.profile === "scalp") {
    modifier -= 6;
  }
  return Math.round(clamp(modifier, 50, 145));
}

function deriveExitOverrides(input: {
  exitPlan: ReturnType<typeof buildExitPlan>;
  confidence: number;
  volumeStrength: number;
  graduationFreshness: number;
}) {
  const convictionDrift = input.confidence - 0.5;
  const freshnessDrag = 1 - input.graduationFreshness;
  const volumeDrag = 1 - input.volumeStrength;

  const stopLossPercent = clamp(
    input.exitPlan.stopLossPercent
    + (0.5 - input.confidence) * 4.2
    + freshnessDrag * 2.2
    + volumeDrag * 1.4,
    8,
    22,
  );

  const tp1Multiplier = clamp(
    input.exitPlan.tp1Multiplier
    + (convictionDrift * 0.18)
    + (input.volumeStrength * 0.06)
    - (freshnessDrag * 0.05),
    1.15,
    1.75,
  );

  const rawTp2Multiplier = clamp(
    input.exitPlan.tp2Multiplier
    + (convictionDrift * 0.5)
    + (input.volumeStrength * 0.2)
    - (freshnessDrag * 0.2),
    1.8,
    2.8,
  );
  const tp2Multiplier = Math.max(rawTp2Multiplier, tp1Multiplier + 0.18);

  let tp1SellFraction = clamp(
    input.exitPlan.tp1SellFraction
    - (convictionDrift * 0.16)
    + (freshnessDrag * 0.08),
    0.35,
    0.72,
  );
  let tp2SellFraction = clamp(
    input.exitPlan.tp2SellFraction
    - (convictionDrift * 0.09)
    + (freshnessDrag * 0.05),
    0.1,
    0.35,
  );

  if (tp1SellFraction + tp2SellFraction > 0.95) {
    const scale = 0.95 / (tp1SellFraction + tp2SellFraction);
    tp1SellFraction *= scale;
    tp2SellFraction *= scale;
  }

  const postTp1RetracePercent = clamp(
    input.exitPlan.postTp1RetracePercent
    + (0.5 - input.confidence) * 3
    + freshnessDrag * 1.5,
    6,
    16,
  );

  const trailingStopPercent = clamp(
    input.exitPlan.trailingStopPercent
    + (0.5 - input.confidence) * 2.6
    + volumeDrag * 1.8,
    8,
    18,
  );

  const timeStopMinutes = clamp(
    input.exitPlan.timeStopMinutes
    + (0.5 - input.confidence) * 2.3
    + freshnessDrag * 1.8
    + volumeDrag * 1.2,
    2,
    12,
  );

  const timeStopMinReturnPercent = clamp(
    input.exitPlan.timeStopMinReturnPercent
    + (convictionDrift * 2.2)
    + (input.volumeStrength * 1.5)
    - (freshnessDrag * 1.1),
    2,
    12,
  );

  const baseTimeLimit = clamp(
    input.exitPlan.timeLimitMinutes
    + (0.5 - input.confidence) * 2.5
    + freshnessDrag * 2,
    4,
    20,
  );
  const timeLimitMinutes = Math.max(baseTimeLimit, timeStopMinutes + 1);

  return {
    stopLossPercent: round(stopLossPercent),
    tp1Multiplier: round(tp1Multiplier, 4),
    tp2Multiplier: round(tp2Multiplier, 4),
    tp1SellFraction: round(tp1SellFraction, 4),
    tp2SellFraction: round(tp2SellFraction, 4),
    postTp1RetracePercent: round(postTp1RetracePercent),
    trailingStopPercent: round(trailingStopPercent),
    timeStopMinutes: round(timeStopMinutes, 1),
    timeStopMinReturnPercent: round(timeStopMinReturnPercent),
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

export function buildDiscoveryLabLiveStrategy(
  run: DiscoveryLabRunDetail,
  baseSettings: BotSettings,
): LiveStrategySettings {
  const winners = run.report?.winners ?? [];
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
  const avgWinnerTimeSinceGraduationMin = average(
    winners
      .map((winner) => winner.timeSinceGraduationMin)
      .filter((value): value is number => value !== null),
  );
  const avgRecipeOverlap = average(winners.map((winner) => winner.whichRecipes.length));
  const dominantMode = inferDominantMode(run);
  const dominantPresetId: StrategyPresetId | null = dominantMode
    ? derivePresetIdFromRecipeMode(dominantMode)
    : null;
  const derivedProfile = deriveProfile(avgWinnerScore);
  const calibration = deriveCalibrationConfidence(
    avgWinnerScore,
    avgWinnerVolume5mUsd,
    dominantMode,
    avgWinnerTimeSinceGraduationMin,
  );
  const confidenceForSizing = winnerCount > 0 ? calibration.confidence : 0.5;
  const capitalModifierPercent = winnerCount > 0
    ? deriveCapitalModifierPercent({
      confidence: confidenceForSizing,
      avgRecipeOverlap,
      profile: derivedProfile,
    })
    : 100;

  const baseStrategySettings = stripLiveStrategy({
    ...baseSettings,
    tradeMode: "LIVE",
  });
  const baseExitPlan = dominantPresetId
    ? buildExitPlan(baseStrategySettings, clamp(avgWinnerScore ?? 0.7, 0, 1), dominantPresetId)
    : null;

  return {
    enabled: true,
    sourceRunId: run.id,
    packId: run.packSnapshot.id,
    packName: run.packSnapshot.name,
    sources: run.sources,
    recipes: run.packSnapshot.recipes,
    thresholdOverrides: {
      ...run.thresholdOverrides,
    },
    exitOverrides: baseExitPlan
      ? deriveExitOverrides({
        exitPlan: baseExitPlan,
        confidence: confidenceForSizing,
        volumeStrength: winnerCount > 0 ? calibration.volumeStrength : 0.5,
        graduationFreshness: winnerCount > 0 ? calibration.graduationFreshness : 0.5,
      })
      : {},
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
    updatedAt: run.completedAt ?? run.startedAt,
  };
}
