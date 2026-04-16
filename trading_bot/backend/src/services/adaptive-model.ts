import type {
  AdaptiveDecisionBand,
  AdaptiveModelState,
  AdaptiveTokenExplanation,
  AdaptiveWinnerCohort,
  BotSettings,
  LiveStrategySettings,
} from "../types/domain.js";
import type { DiscoveryLabRunDetail } from "./discovery-lab-service.js";

function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function maybeNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toGraduationAgeMin(record: Record<string, unknown>): number | null {
  const directMinutes = maybeNumber(record.timeSinceGraduationMin);
  if (directMinutes != null) return directMinutes;
  const seconds = maybeNumber(record.graduationAgeSeconds);
  return seconds == null ? null : seconds / 60;
}

function deriveCohortKey(input: { volume5mUsd: number | null; graduationAgeMin: number | null }): string {
  const volume = input.volume5mUsd ?? 0;
  const age = input.graduationAgeMin ?? Number.POSITIVE_INFINITY;
  if (age <= 10 && volume >= 200_000) return "fresh-high-volume";
  if (age <= 20 && volume >= 80_000) return "fresh-mid-volume";
  if (age > 20 && volume >= 120_000) return "late-high-liquidity";
  return "defensive-fade-risk";
}

function deriveCohortLabel(key: string): string {
  switch (key) {
    case "fresh-high-volume":
      return "Very fresh + high volume";
    case "fresh-mid-volume":
      return "Fresh + mid volume";
    case "late-high-liquidity":
      return "Later + high liquidity";
    default:
      return "Defensive fade risk";
  }
}

function deriveConfidenceLabel(winnerCount: number): string {
  if (winnerCount >= 8) return "High confidence";
  if (winnerCount >= 4) return "Medium confidence";
  return "Early signal";
}

type AdaptiveInputRow = {
  mint: string;
  score: number | null;
  volume5mUsd: number | null;
  graduationAgeMin: number | null;
};

export function buildAdaptiveWinnerCohorts(run: DiscoveryLabRunDetail): AdaptiveWinnerCohort[] {
  const winnerRows: AdaptiveInputRow[] = (run.report?.winners ?? []).map((winner) => ({
    mint: winner.address,
    score: winner.score,
    volume5mUsd: winner.volume5mUsd,
    graduationAgeMin: winner.timeSinceGraduationMin,
  }));

  const passRows: AdaptiveInputRow[] = (run.report?.deepEvaluations ?? [])
    .filter((row) => row.pass)
    .map((row) => ({
      mint: row.mint,
      score: row.playScore,
      volume5mUsd: row.volume5mUsd,
      graduationAgeMin: row.timeSinceGraduationMin,
    }));

  const grouped = new Map<string, { winners: AdaptiveInputRow[]; passMints: Set<string> }>();
  for (const row of winnerRows) {
    const key = deriveCohortKey({ volume5mUsd: row.volume5mUsd, graduationAgeMin: row.graduationAgeMin });
    const current = grouped.get(key) ?? { winners: [], passMints: new Set<string>() };
    current.winners.push(row);
    current.passMints.add(row.mint);
    grouped.set(key, current);
  }
  for (const row of passRows) {
    const key = deriveCohortKey({ volume5mUsd: row.volume5mUsd, graduationAgeMin: row.graduationAgeMin });
    const current = grouped.get(key) ?? { winners: [], passMints: new Set<string>() };
    current.passMints.add(row.mint);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .map(([key, value], index) => {
      const avgWinnerScore = average(value.winners.map((row) => row.score));
      const avgWinnerVolume5mUsd = average(value.winners.map((row) => row.volume5mUsd));
      const avgWinnerAgeMin = average(value.winners.map((row) => row.graduationAgeMin));
      return {
        id: `cohort-${index + 1}`,
        key,
        label: deriveCohortLabel(key),
        tokenCount: value.passMints.size > 0 ? value.passMints.size : value.winners.length,
        winnerCount: value.winners.length,
        avgWinnerScore: avgWinnerScore == null ? null : round(avgWinnerScore, 4),
        avgWinnerVolume5mUsd: avgWinnerVolume5mUsd == null ? null : round(avgWinnerVolume5mUsd),
        avgWinnerAgeMin: avgWinnerAgeMin == null ? null : round(avgWinnerAgeMin, 2),
      };
    })
    .sort((left, right) => right.winnerCount - left.winnerCount || right.tokenCount - left.tokenCount)
    .slice(0, 6);
}

export function buildAdaptiveDecisionBands(cohorts: AdaptiveWinnerCohort[]): AdaptiveDecisionBand[] {
  return cohorts.map((cohort, index) => {
    const aggressive = (cohort.avgWinnerScore ?? 0) >= 0.82 && (cohort.avgWinnerVolume5mUsd ?? 0) >= 200_000;
    const defensive = (cohort.avgWinnerScore ?? 0) < 0.68 || (cohort.avgWinnerVolume5mUsd ?? 0) < 60_000;
    return {
      id: `band-${index + 1}`,
      cohortKey: cohort.key,
      label: `${cohort.label} band`,
      eligibility: `Match token profile near cohort ${cohort.label.toLowerCase()} with volume and freshness inside this cohort envelope.`,
      entryPosture: aggressive ? "Faster confirmation" : defensive ? "Strict confirmation" : "Balanced confirmation",
      sizePosture: aggressive ? "Expand toward cap" : defensive ? "Reduce toward floor" : "Base sizing with mild modifier",
      exitPosture: aggressive ? "Runner bias" : defensive ? "Scalp bias" : "Balanced exits",
      confidence: deriveConfidenceLabel(cohort.winnerCount),
      support: `${cohort.winnerCount} winner${cohort.winnerCount === 1 ? "" : "s"} across ${cohort.tokenCount} pass-grade tokens.`,
    };
  });
}

export function buildAdaptiveModelState(settings: BotSettings): AdaptiveModelState {
  const liveStrategy = settings.strategy.liveStrategy;
  const winnerCount = liveStrategy.calibrationSummary?.winnerCount ?? 0;
  const bandCount = liveStrategy.decisionBands.length;
  const confidence = liveStrategy.calibrationSummary?.calibrationConfidence ?? null;
  const staleWarning = !liveStrategy.updatedAt
    ? "No adaptive calibration has been staged yet."
    : Date.now() - Date.parse(liveStrategy.updatedAt) > 24 * 60 * 60 * 1000
      ? "Adaptive calibration is older than 24h."
      : null;
  const degradedWarning = !liveStrategy.enabled
    ? null
    : winnerCount <= 0
      ? "Adaptive logic is enabled without winner evidence."
      : winnerCount < 3
        ? "Adaptive model is running on a thin winner sample."
        : confidence != null && confidence < 0.55
          ? "Adaptive calibration confidence is below the healthy range."
          : bandCount === 0
            ? "Adaptive decision bands are unavailable."
            : null;

  const status = !liveStrategy.enabled
    ? "inactive"
    : staleWarning
      ? "stale"
      : degradedWarning
        ? "degraded"
        : "active";

  return {
    status,
    automationUsesAdaptive: settings.tradeMode === "LIVE" && liveStrategy.enabled,
    enabled: liveStrategy.enabled,
    sourceRunId: liveStrategy.sourceRunId,
    packId: liveStrategy.packId,
    packName: liveStrategy.packName,
    dominantMode: liveStrategy.dominantMode,
    dominantPresetId: liveStrategy.dominantPresetId,
    winnerCount,
    bandCount,
    calibrationConfidence: confidence,
    staleWarning,
    degradedWarning,
    warnings: [staleWarning, degradedWarning].filter((value): value is string => Boolean(value)),
    updatedAt: liveStrategy.updatedAt,
  };
}

export function buildAdaptiveTokenExplanation(input: {
  liveStrategy: LiveStrategySettings;
  filterState?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
}): AdaptiveTokenExplanation {
  const filterState = input.filterState ?? {};
  const metrics = input.metrics ?? {};
  const volume5mUsd = maybeNumber(filterState.volume5mUsd) ?? maybeNumber(metrics.volume5mUsd);
  const liquidityUsd = maybeNumber(filterState.liquidityUsd) ?? maybeNumber(metrics.liquidityUsd);
  const buySellRatio = maybeNumber(filterState.buySellRatio) ?? maybeNumber(metrics.buySellRatio);
  const graduationAgeMin = toGraduationAgeMin(filterState);
  const entryScore = maybeNumber(metrics.entryScore);

  if (!input.liveStrategy.enabled) {
    return {
      enabled: false,
      status: "inactive",
      matchedBandId: null,
      matchedBandLabel: null,
      entryPosture: null,
      sizePosture: null,
      exitPosture: null,
      capitalModifierPercent: null,
      dominantMode: null,
      entryScore,
      volume5mUsd,
      liquidityUsd,
      buySellRatio,
      graduationAgeMin,
      reasons: ["Adaptive live strategy is not enabled."],
    };
  }

  const cohortKey = deriveCohortKey({ volume5mUsd, graduationAgeMin });
  const matchedBand = input.liveStrategy.decisionBands.find((band) => band.cohortKey === cohortKey) ?? null;
  const reasons: string[] = [];
  if (matchedBand) {
    reasons.push(`Matched ${matchedBand.label.toLowerCase()}.`);
  }
  if (volume5mUsd != null) {
    reasons.push(`5m volume ${Math.round(volume5mUsd)} USD.`);
  } else {
    reasons.push("5m volume is unavailable.");
  }
  if (graduationAgeMin != null) {
    reasons.push(`Graduation age ${round(graduationAgeMin, 1)} min.`);
  }
  if (entryScore != null) {
    reasons.push(`Entry score ${round(entryScore, 3)}.`);
  }
  if (input.liveStrategy.capitalModifierPercent !== 100) {
    reasons.push(`Capital modifier ${input.liveStrategy.capitalModifierPercent}%.`);
  }

  const status = matchedBand
    ? "matched"
    : volume5mUsd != null || graduationAgeMin != null || entryScore != null
      ? "partial"
      : "unmatched";

  return {
    enabled: true,
    status,
    matchedBandId: matchedBand?.id ?? null,
    matchedBandLabel: matchedBand?.label ?? null,
    entryPosture: matchedBand?.entryPosture ?? null,
    sizePosture: matchedBand?.sizePosture ?? null,
    exitPosture: matchedBand?.exitPosture ?? null,
    capitalModifierPercent: input.liveStrategy.capitalModifierPercent,
    dominantMode: input.liveStrategy.dominantMode,
    entryScore,
    volume5mUsd,
    liquidityUsd,
    buySellRatio,
    graduationAgeMin,
    reasons,
  };
}
