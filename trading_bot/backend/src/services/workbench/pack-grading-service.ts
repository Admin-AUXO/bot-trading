import { db } from "../../db/client.js";
import type {
  DiscoveryLabPackDraft,
  DiscoveryLabRunDetail,
  OperatorRunGradePayload,
  OperatorRunGradeSummary,
  OperatorRunTuningDelta,
  OperatorRunTuningPayload,
  StrategyThresholdOverrides,
} from "../../types/domain.js";
import { cleanThresholdOverrides, packToDraft } from "../discovery-lab-pack-types.js";
import { buildStrategyPackSnapshot } from "./discovery-lab-shared.js";
import type { PackRepo } from "./pack-repo.js";
import type { StrategyRunReadService } from "./strategy-run-read-service.js";

type PackGradingServiceDeps = {
  runReads: StrategyRunReadService;
  packs: PackRepo;
};

type RunEvaluation = NonNullable<DiscoveryLabRunDetail["report"]>["deepEvaluations"][number];

type RunAnalysis = {
  summary: OperatorRunGradeSummary;
  deltas: OperatorRunTuningDelta[];
  suggestedDraft: DiscoveryLabPackDraft | null;
};

const THRESHOLD_LABELS: Record<keyof StrategyThresholdOverrides, string> = {
  minLiquidityUsd: "Min liquidity",
  maxMarketCapUsd: "Max market cap",
  minHolders: "Min holders",
  minUniqueBuyers5m: "Min unique buyers 5m",
  minBuySellRatio: "Min buy/sell ratio",
  maxTop10HolderPercent: "Max top 10 holder %",
  maxSingleHolderPercent: "Max single holder %",
  maxGraduationAgeSeconds: "Max graduation age",
  minVolume5mUsd: "Min volume 5m",
  maxNegativePriceChange5mPercent: "Max negative price change 5m",
  securityCheckMinLiquidityUsd: "Security min liquidity",
  securityCheckVolumeMultiplier: "Security volume multiplier",
  maxTransferFeePercent: "Max transfer fee %",
};

export class PackGradingService {
  constructor(private readonly deps: PackGradingServiceDeps) {}

  async gradeRun(runId: string, options?: { persist?: boolean }): Promise<OperatorRunGradePayload> {
    const run = await this.loadCompletedRun(runId);
    const analysis = this.analyze(run);
    const persisted = options?.persist ? await this.persistGrade(run, analysis.summary.grade) : null;

    return {
      runId: run.id,
      packId: run.packId,
      packName: run.packName,
      generatedAt: new Date().toISOString(),
      summary: analysis.summary,
      persisted,
    };
  }

  async suggestTuning(
    runId: string,
    options?: { apply?: boolean },
  ): Promise<OperatorRunTuningPayload> {
    const run = await this.loadCompletedRun(runId);
    const analysis = this.analyze(run);
    let appliedPackId: string | null = null;
    let appliedPackName: string | null = null;

    if (options?.apply && analysis.suggestedDraft) {
      const savedPack = await this.deps.packs.savePack(analysis.suggestedDraft);
      appliedPackId = savedPack.id;
      appliedPackName = savedPack.name;
    }

    return {
      runId: run.id,
      packId: run.packId,
      packName: run.packName,
      generatedAt: new Date().toISOString(),
      summary: analysis.summary,
      deltas: analysis.deltas,
      suggestedDraft: analysis.suggestedDraft,
      appliedPackId,
      appliedPackName,
    };
  }

  private async loadCompletedRun(runId: string): Promise<DiscoveryLabRunDetail> {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      throw new Error("runId is required");
    }

    const run = await this.deps.runReads.getRun(normalizedRunId);
    if (!run) {
      throw new Error("run not found");
    }
    if (run.status !== "COMPLETED") {
      throw new Error("run must be completed before grading");
    }
    if (!run.report) {
      throw new Error("completed run has no report to grade");
    }
    return run;
  }

  private analyze(run: DiscoveryLabRunDetail): RunAnalysis {
    const report = run.report;
    if (!report) {
      throw new Error("run report is required");
    }

    const evaluations = dedupeEvaluations(report.deepEvaluations);
    const winnerMints = new Set(report.winners.map((winner) => winner.address));
    const passRows = evaluations.filter((row) => row.pass);
    const winnerRows = passRows.filter((row) => winnerMints.has(row.mint));
    const rejectedRows = evaluations.filter((row) => !row.pass);
    const nonWinnerPassRows = passRows.filter((row) => !winnerMints.has(row.mint));

    const evaluationCount = evaluations.length;
    const passCount = passRows.length;
    const winnerCount = winnerRows.length;
    const passRate = ratio(passCount, evaluationCount);
    const winnerRate = ratio(winnerCount, passCount);
    const falsePositiveRate = passCount > 0 ? ratio(passCount - winnerCount, passCount) : 1;
    const calibrationConfidence = normalizeCalibrationConfidence(run.strategyCalibration?.calibrationSummary?.calibrationConfidence);
    const overallScore = calculateOverallScore({
      evaluationCount,
      passRate,
      winnerRate,
      falsePositiveRate,
      calibrationConfidence,
    });

    const summary: OperatorRunGradeSummary = {
      grade: gradeFromScore(overallScore),
      overallScorePercent: roundTo(overallScore * 100, 1),
      evaluationCount,
      passCount,
      winnerCount,
      passRatePercent: roundTo(passRate * 100, 1),
      winnerRatePercent: roundTo(winnerRate * 100, 1),
      falsePositiveRatePercent: roundTo(falsePositiveRate * 100, 1),
      avgPassPlayScore: average(passRows.map((row) => row.playScore)),
      avgWinnerPlayScore: average(winnerRows.map((row) => row.playScore)),
      avgRejectedPlayScore: average(rejectedRows.map((row) => row.playScore)),
      calibrationConfidencePercent: calibrationConfidence == null ? null : roundTo(calibrationConfidence * 100, 1),
    };

    const deltas = buildTuningDeltas({
      run,
      evaluations,
      passRows,
      winnerRows,
      nonWinnerPassRows,
      summary,
    });
    const suggestedDraft = deltas.length > 0
      ? buildSuggestedDraft(run, deltas)
      : null;

    return {
      summary,
      deltas,
      suggestedDraft,
    };
  }

  private async persistGrade(
    run: DiscoveryLabRunDetail,
    grade: OperatorRunGradeSummary["grade"],
  ): Promise<OperatorRunGradePayload["persisted"]> {
    const snapshot = buildStrategyPackSnapshot(run.packSnapshot);
    const currentPack = await db.strategyPack.findUnique({
      where: { id: run.packId },
      select: { status: true },
    });
    const nextStatus = currentPack?.status === "LIVE" || currentPack?.status === "RETIRED"
      ? currentPack.status
      : "GRADED";

    await db.strategyPack.upsert({
      where: { id: run.packId },
      update: {
        name: run.packName,
        status: nextStatus,
        grade,
      },
      create: {
        id: run.packId,
        name: run.packName,
        version: 1,
        status: nextStatus,
        grade,
        recipe: snapshot.recipe,
        baseFilters: snapshot.baseFilters,
        baseExits: snapshot.baseExits,
        adaptiveAxes: snapshot.adaptiveAxes,
        capitalModifier: snapshot.capitalModifier,
        sortColumn: snapshot.sortColumn,
        sortOrder: snapshot.sortOrder,
        createdBy: snapshot.createdBy,
      },
    });

    return {
      packStatus: nextStatus,
      packGrade: grade,
    };
  }
}

function buildTuningDeltas(input: {
  run: DiscoveryLabRunDetail;
  evaluations: RunEvaluation[];
  passRows: RunEvaluation[];
  winnerRows: RunEvaluation[];
  nonWinnerPassRows: RunEvaluation[];
  summary: OperatorRunGradeSummary;
}): OperatorRunTuningDelta[] {
  const current = cleanThresholdOverrides(input.run.packSnapshot.thresholdOverrides);
  const deltas: OperatorRunTuningDelta[] = [];

  if (input.summary.evaluationCount === 0) {
    return deltas;
  }

  if (input.summary.passCount === 0) {
    maybePushDelta(deltas, "minLiquidityUsd", current.minLiquidityUsd, scaleDown(current.minLiquidityUsd, 0.85), "loosen",
      "Run produced zero pass-grade rows. Liquidity floor is choking everything.");
    maybePushDelta(deltas, "minVolume5mUsd", current.minVolume5mUsd, scaleDown(current.minVolume5mUsd, 0.8), "loosen",
      "No pass-grade rows survived. Ease the 5m volume gate before pretending the tape is dead.");
    maybePushDelta(deltas, "minUniqueBuyers5m", current.minUniqueBuyers5m, stepDown(current.minUniqueBuyers5m, 2, 1), "loosen",
      "Unique-buyer gate is likely overfitted for the current tape.");
    return dedupeAndLimit(deltas);
  }

  if (input.summary.falsePositiveRatePercent >= 70) {
    const winnerLiquidity = average(input.winnerRows.map((row) => row.liquidityUsd));
    const falseLiquidity = average(input.nonWinnerPassRows.map((row) => row.liquidityUsd));
    if (winnerLiquidity != null && falseLiquidity != null && winnerLiquidity > falseLiquidity * 1.12) {
      maybePushDelta(
        deltas,
        "minLiquidityUsd",
        current.minLiquidityUsd,
        midpointTighten(current.minLiquidityUsd, falseLiquidity, winnerLiquidity, 500),
        "tighten",
        "False-positive passes are weaker on liquidity than the actual winners.",
      );
    }

    const winnerVolume = average(input.winnerRows.map((row) => row.volume5mUsd));
    const falseVolume = average(input.nonWinnerPassRows.map((row) => row.volume5mUsd));
    if (winnerVolume != null && falseVolume != null && winnerVolume > falseVolume * 1.15) {
      maybePushDelta(
        deltas,
        "minVolume5mUsd",
        current.minVolume5mUsd,
        midpointTighten(current.minVolume5mUsd, falseVolume, winnerVolume, 250),
        "tighten",
        "Winner rows carry more real 5m volume than the pass-grade noise.",
      );
    }

    const winnerRatio = average(input.winnerRows.map((row) => row.buySellRatio));
    const falseRatio = average(input.nonWinnerPassRows.map((row) => row.buySellRatio));
    if (winnerRatio != null && falseRatio != null && winnerRatio > falseRatio * 1.08) {
      maybePushDelta(
        deltas,
        "minBuySellRatio",
        current.minBuySellRatio,
        midpointTighten(current.minBuySellRatio, falseRatio, winnerRatio, 0.05),
        "tighten",
        "Pass-grade losers are getting through on weaker buy pressure.",
      );
    }

    const winnerTop10 = average(input.winnerRows.map((row) => row.top10HolderPercent));
    const falseTop10 = average(input.nonWinnerPassRows.map((row) => row.top10HolderPercent));
    if (winnerTop10 != null && falseTop10 != null && falseTop10 > winnerTop10 * 1.08) {
      maybePushDelta(
        deltas,
        "maxTop10HolderPercent",
        current.maxTop10HolderPercent,
        midpointLoosenCap(current.maxTop10HolderPercent, winnerTop10, falseTop10, 1, false),
        "tighten",
        "Loser passes are more concentrated than the winner cohort.",
      );
    }

    const winnerSingle = average(input.winnerRows.map((row) => row.largestHolderPercent));
    const falseSingle = average(input.nonWinnerPassRows.map((row) => row.largestHolderPercent));
    if (winnerSingle != null && falseSingle != null && falseSingle > winnerSingle * 1.08) {
      maybePushDelta(
        deltas,
        "maxSingleHolderPercent",
        current.maxSingleHolderPercent,
        midpointLoosenCap(current.maxSingleHolderPercent, winnerSingle, falseSingle, 1, false),
        "tighten",
        "Single-holder concentration is uglier on the false positives.",
      );
    }

    const winnerAgeMinutes = average(input.winnerRows.map((row) => row.timeSinceGraduationMin));
    const falseAgeMinutes = average(input.nonWinnerPassRows.map((row) => row.timeSinceGraduationMin));
    if (winnerAgeMinutes != null && falseAgeMinutes != null && falseAgeMinutes > winnerAgeMinutes * 1.15) {
      maybePushDelta(
        deltas,
        "maxGraduationAgeSeconds",
        current.maxGraduationAgeSeconds,
        midpointAgeTighten(current.maxGraduationAgeSeconds, winnerAgeMinutes, falseAgeMinutes),
        "tighten",
        "Older graduates are inflating the pass-grade pile without paying for it.",
      );
    }
  }

  if (input.summary.passRatePercent < 4) {
    maybePushDelta(
      deltas,
      "minLiquidityUsd",
      current.minLiquidityUsd,
      scaleDown(current.minLiquidityUsd, 0.9),
      "loosen",
      "Acceptance rate is starved. Ease the liquidity floor slightly.",
    );
    maybePushDelta(
      deltas,
      "minVolume5mUsd",
      current.minVolume5mUsd,
      scaleDown(current.minVolume5mUsd, 0.9),
      "loosen",
      "The tape is too filtered to generate a useful review set.",
    );
  }

  return dedupeAndLimit(deltas);
}

function buildSuggestedDraft(
  run: DiscoveryLabRunDetail,
  deltas: OperatorRunTuningDelta[],
): DiscoveryLabPackDraft {
  const draft = packToDraft(run.packSnapshot);
  const nextThresholds = {
    ...(draft.thresholdOverrides ?? {}),
  };
  for (const delta of deltas) {
    nextThresholds[delta.field] = delta.suggestedValue;
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return {
    ...draft,
    id: undefined,
    name: `${draft.name} tuning ${timestamp}`.slice(0, 96),
    description: `${draft.description ?? ""}`.trim()
      ? `${draft.description?.trim()} | tuned from run ${run.id}`
      : `Tuned from run ${run.id}`,
    thresholdOverrides: cleanThresholdOverrides(nextThresholds),
  };
}

function calculateOverallScore(input: {
  evaluationCount: number;
  passRate: number;
  winnerRate: number;
  falsePositiveRate: number;
  calibrationConfidence: number | null;
}): number {
  const coverage = Math.min(input.evaluationCount / 40, 1);
  const confidence = input.calibrationConfidence ?? (input.evaluationCount > 0 ? 0.25 : 0);
  const passRateShape = 1 - Math.min(Math.abs(input.passRate - 0.1) / 0.12, 1);
  const falsePositiveQuality = 1 - Math.min(input.falsePositiveRate, 1);
  const raw = (input.winnerRate * 0.35)
    + (confidence * 0.25)
    + (passRateShape * 0.2)
    + (coverage * 0.1)
    + (falsePositiveQuality * 0.1);
  return Math.max(0, Math.min(raw, 1));
}

function gradeFromScore(score: number): OperatorRunGradeSummary["grade"] {
  if (score >= 0.85) {
    return "A";
  }
  if (score >= 0.7) {
    return "B";
  }
  if (score >= 0.55) {
    return "C";
  }
  if (score >= 0.4) {
    return "D";
  }
  return "F";
}

function normalizeCalibrationConfidence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value > 1) {
    return Math.max(0, Math.min(value / 100, 1));
  }
  return Math.max(0, Math.min(value, 1));
}

function average(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (filtered.length === 0) {
    return null;
  }
  return roundTo(filtered.reduce((sum, value) => sum + value, 0) / filtered.length, 4);
}

function ratio(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function scaleDown(value: number | null | undefined, factor: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return roundTo(value * factor, value >= 100 ? 0 : 2);
}

function stepDown(value: number | null | undefined, amount: number, minimum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(minimum, roundTo(value - amount, 0));
}

function midpointTighten(
  currentValue: number | null | undefined,
  loserAverage: number,
  winnerAverage: number,
  minimumStep: number,
): number | null {
  if (!Number.isFinite(winnerAverage) || !Number.isFinite(loserAverage) || winnerAverage <= loserAverage) {
    return null;
  }
  const midpoint = loserAverage + ((winnerAverage - loserAverage) * 0.45);
  const base = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? Math.max(currentValue, midpoint)
    : midpoint;
  return roundTo(Math.max(base, minimumStep), base >= 100 ? 0 : 2);
}

function midpointLoosenCap(
  currentValue: number | null | undefined,
  winnerAverage: number,
  loserAverage: number,
  minimumStep: number,
  allowLoosen: boolean,
): number | null {
  if (!Number.isFinite(winnerAverage) || !Number.isFinite(loserAverage) || loserAverage <= winnerAverage) {
    return null;
  }
  const midpoint = winnerAverage + ((loserAverage - winnerAverage) * 0.45);
  const next = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? allowLoosen
      ? midpoint
      : Math.min(currentValue, midpoint)
    : midpoint;
  return roundTo(Math.max(next, minimumStep), next >= 100 ? 0 : 2);
}

function midpointAgeTighten(
  currentValue: number | null | undefined,
  winnerAverageMinutes: number,
  loserAverageMinutes: number,
): number | null {
  if (!Number.isFinite(winnerAverageMinutes) || !Number.isFinite(loserAverageMinutes) || loserAverageMinutes <= winnerAverageMinutes) {
    return null;
  }
  const midpointSeconds = (winnerAverageMinutes + ((loserAverageMinutes - winnerAverageMinutes) * 0.45)) * 60;
  if (!Number.isFinite(midpointSeconds) || midpointSeconds <= 0) {
    return null;
  }
  if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
    return Math.round(Math.min(currentValue, midpointSeconds));
  }
  return Math.round(midpointSeconds);
}

function maybePushDelta(
  deltas: OperatorRunTuningDelta[],
  field: keyof StrategyThresholdOverrides,
  currentValue: number | null | undefined,
  suggestedValue: number | null,
  direction: OperatorRunTuningDelta["direction"],
  reason: string,
): void {
  if (suggestedValue == null || !Number.isFinite(suggestedValue)) {
    return;
  }
  const current = typeof currentValue === "number" && Number.isFinite(currentValue) ? currentValue : null;
  if (current != null && roundTo(current, 4) === roundTo(suggestedValue, 4)) {
    return;
  }
  deltas.push({
    field,
    label: THRESHOLD_LABELS[field],
    direction,
    currentValue: current,
    suggestedValue: roundTo(suggestedValue, suggestedValue >= 100 ? 0 : 4),
    reason,
  });
}

function dedupeAndLimit(deltas: OperatorRunTuningDelta[]): OperatorRunTuningDelta[] {
  const byField = new Map<keyof StrategyThresholdOverrides, OperatorRunTuningDelta>();
  for (const delta of deltas) {
    if (!byField.has(delta.field)) {
      byField.set(delta.field, delta);
    }
  }
  return [...byField.values()].slice(0, 4);
}

function dedupeEvaluations(rows: RunEvaluation[]): RunEvaluation[] {
  const byMint = new Map<string, RunEvaluation>();
  for (const row of rows) {
    const current = byMint.get(row.mint);
    if (!current) {
      byMint.set(row.mint, row);
      continue;
    }

    const currentScore = current.playScore ?? Number.NEGATIVE_INFINITY;
    const nextScore = row.playScore ?? Number.NEGATIVE_INFINITY;
    if (row.pass && !current.pass) {
      byMint.set(row.mint, row);
      continue;
    }
    if (row.pass === current.pass && nextScore > currentScore) {
      byMint.set(row.mint, row);
    }
  }
  return [...byMint.values()];
}
