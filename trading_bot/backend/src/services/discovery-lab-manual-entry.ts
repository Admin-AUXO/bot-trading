import { db } from "../db/client.js";
import type { ExecutionEngine } from "../engine/execution-engine.js";
import type { DiscoveryLabRunDetail } from "./discovery-lab-service.js";
import type { ExitPlan } from "./strategy-exit.js";
import { toJsonValue } from "../utils/json.js";

type DiscoveryLabEvaluation = NonNullable<DiscoveryLabRunDetail["report"]>["deepEvaluations"][number];

export type DiscoveryLabManualEntryRequest = {
  runId: string;
  mint: string;
  positionSizeUsd?: number;
  exitOverrides?: Partial<{
    stopLossPercent: number;
    tp1Percent: number;
    tp2Percent: number;
    tp1SellFractionPercent: number;
    tp2SellFractionPercent: number;
    postTp1RetracePercent: number;
    trailingStopPercent: number;
    timeStopMinutes: number;
    timeStopMinReturnPercent: number;
    timeLimitMinutes: number;
  }>;
};

export type DiscoveryLabManualEntryResult = {
  candidateId: string;
  positionId: string;
  symbol: string;
  entryPriceUsd: number;
  strategyPresetId: "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE";
};

function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readStrategyPresetId(
  mode: DiscoveryLabEvaluation["mode"],
): DiscoveryLabManualEntryResult["strategyPresetId"] {
  return mode === "pregrad"
    ? "LATE_CURVE_MIGRATION_SNIPE"
    : "FIRST_MINUTE_POSTGRAD_CONTINUATION";
}

function readExitProfile(entryScore: number): "scalp" | "balanced" | "runner" {
  if (entryScore >= 0.82) {
    return "runner";
  }
  if (entryScore >= 0.62) {
    return "balanced";
  }
  return "scalp";
}

function pickBestEvaluation(
  run: DiscoveryLabRunDetail,
  mint: string,
): DiscoveryLabEvaluation | null {
  const rows = run.report?.deepEvaluations.filter((evaluation) => evaluation.mint === mint) ?? [];
  if (rows.length === 0) {
    return null;
  }

  return [...rows].sort((left, right) => {
    if (left.pass !== right.pass) {
      return Number(right.pass) - Number(left.pass);
    }
    if (left.playScore !== right.playScore) {
      return right.playScore - left.playScore;
    }
    return right.entryScore - left.entryScore;
  })[0] ?? null;
}

function buildCandidateMetrics(
  run: DiscoveryLabRunDetail,
  evaluation: DiscoveryLabEvaluation,
  request: DiscoveryLabManualEntryRequest,
) {
  const strategyPresetId = readStrategyPresetId(evaluation.mode);
  const entryScore = Math.max(0, Math.min(1, evaluation.entryScore));
  const winner = run.report?.winners.find((row) => row.address === evaluation.mint) ?? null;
  const nowMs = Date.now();
  const runStartedAtMs = Date.parse(run.startedAt);
  const runCompletedAtMs = run.completedAt ? Date.parse(run.completedAt) : NaN;
  const reportGeneratedAtMs = run.report ? Date.parse(run.report.generatedAt) : NaN;
  const runAgeMsAtEntry = Number.isFinite(runStartedAtMs) ? Math.max(0, nowMs - runStartedAtMs) : null;
  const completionLagMsAtEntry = Number.isFinite(runCompletedAtMs) ? Math.max(0, nowMs - runCompletedAtMs) : null;
  const reportAgeMsAtEntry = Number.isFinite(reportGeneratedAtMs) ? Math.max(0, nowMs - reportGeneratedAtMs) : null;

  return {
    entryOrigin: "discovery_lab_manual_entry",
    manualEntry: true,
    discoveryLabRunId: run.id,
    discoveryLabPackId: run.packId,
    discoveryLabPackName: run.packName,
    discoveryLabProfile: run.profile,
    discoveryRecipeName: evaluation.recipeName,
    strategyPresetId,
    source: evaluation.source,
    mode: evaluation.mode,
    grade: evaluation.grade,
    pass: evaluation.pass,
    playScore: evaluation.playScore,
    entryScore,
    exitProfile: readExitProfile(entryScore),
    priceUsd: evaluation.priceUsd,
    liquidityUsd: evaluation.liquidityUsd,
    marketCapUsd: evaluation.marketCapUsd,
    holders: evaluation.holders,
    volume5mUsd: evaluation.volume5mUsd,
    volume30mUsd: evaluation.volume30mUsd,
    uniqueWallets5m: evaluation.uniqueWallets5m,
    buySellRatio: evaluation.buySellRatio,
    priceChange5mPercent: evaluation.priceChange5mPercent,
    priceChange30mPercent: evaluation.priceChange30mPercent,
    top10HolderPercent: evaluation.top10HolderPercent,
    largestHolderPercent: evaluation.largestHolderPercent,
    timeSinceGraduationMin: evaluation.timeSinceGraduationMin,
    timeSinceCreationMin: evaluation.timeSinceCreationMin,
    softIssues: evaluation.softIssues,
    notes: evaluation.notes,
    winnerScore: winner?.score ?? null,
    winnerRecipes: winner?.whichRecipes ?? [],
    manualTradeSettings: {
      positionSizeUsd: toPositiveNumber(request.positionSizeUsd),
      exitOverrides: request.exitOverrides ?? null,
    },
    discoveryLabRunAgeMsAtEntry: runAgeMsAtEntry,
    discoveryLabCompletionLagMsAtEntry: completionLagMsAtEntry,
    discoveryLabReportAgeMsAtEntry: reportAgeMsAtEntry,
  } satisfies Record<string, unknown>;
}

function buildManualExitPlanOverride(
  exitOverrides: DiscoveryLabManualEntryRequest["exitOverrides"],
): Partial<ExitPlan> | undefined {
  if (!exitOverrides) {
    return undefined;
  }
  const next: Partial<ExitPlan> = {};

  const stopLossPercent = toPositiveNumber(exitOverrides.stopLossPercent);
  if (stopLossPercent !== null) {
    next.stopLossPercent = stopLossPercent;
  }
  const tp1Percent = toPositiveNumber(exitOverrides.tp1Percent);
  if (tp1Percent !== null) {
    next.tp1Multiplier = 1 + (tp1Percent / 100);
  }
  const tp2Percent = toPositiveNumber(exitOverrides.tp2Percent);
  if (tp2Percent !== null) {
    next.tp2Multiplier = 1 + (tp2Percent / 100);
  }
  const tp1SellFractionPercent = toPositiveNumber(exitOverrides.tp1SellFractionPercent);
  if (tp1SellFractionPercent !== null) {
    next.tp1SellFraction = tp1SellFractionPercent / 100;
  }
  const tp2SellFractionPercent = toPositiveNumber(exitOverrides.tp2SellFractionPercent);
  if (tp2SellFractionPercent !== null) {
    next.tp2SellFraction = tp2SellFractionPercent / 100;
  }
  const postTp1RetracePercent = toPositiveNumber(exitOverrides.postTp1RetracePercent);
  if (postTp1RetracePercent !== null) {
    next.postTp1RetracePercent = postTp1RetracePercent;
  }
  const trailingStopPercent = toPositiveNumber(exitOverrides.trailingStopPercent);
  if (trailingStopPercent !== null) {
    next.trailingStopPercent = trailingStopPercent;
  }
  const timeStopMinutes = toPositiveNumber(exitOverrides.timeStopMinutes);
  if (timeStopMinutes !== null) {
    next.timeStopMinutes = timeStopMinutes;
  }
  const timeStopMinReturnPercent = toPositiveNumber(exitOverrides.timeStopMinReturnPercent);
  if (timeStopMinReturnPercent !== null) {
    next.timeStopMinReturnPercent = timeStopMinReturnPercent;
  }
  const timeLimitMinutes = toPositiveNumber(exitOverrides.timeLimitMinutes);
  if (timeLimitMinutes !== null) {
    next.timeLimitMinutes = timeLimitMinutes;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export class DiscoveryLabManualEntryService {
  constructor(
    private readonly discoveryLab: {
      getRun: (runId: string) => Promise<DiscoveryLabRunDetail | null>;
    },
    private readonly execution: ExecutionEngine,
  ) {}

  async enterFromRun(input: DiscoveryLabManualEntryRequest): Promise<DiscoveryLabManualEntryResult> {
    const runId = toTrimmedString(input.runId);
    const mint = toTrimmedString(input.mint);

    if (!runId) {
      throw new Error("runId is required");
    }
    if (!mint) {
      throw new Error("mint is required");
    }

    const run = await this.discoveryLab.getRun(runId);
    if (!run) {
      throw new Error("discovery-lab run not found");
    }
    if (!run.report) {
      throw new Error("discovery-lab run does not have a completed report yet");
    }

    const evaluation = pickBestEvaluation(run, mint);
    if (!evaluation) {
      throw new Error("selected token was not found in the discovery-lab report");
    }
    if (!evaluation.pass) {
      throw new Error("cannot enter a manual trade from a rejected discovery-lab token");
    }

    const entryPriceUsd = toPositiveNumber(evaluation.priceUsd)
      ?? toPositiveNumber(run.report.winners.find((row) => row.address === mint)?.priceUsd);
    if (!entryPriceUsd) {
      throw new Error("selected token does not have a usable entry price");
    }

    const existingOpen = await db.position.findFirst({
      where: {
        mint,
        status: "OPEN",
      },
      select: { id: true },
    });
    if (existingOpen) {
      throw new Error(`open position already exists for ${mint}`);
    }

    const strategyPresetId = readStrategyPresetId(evaluation.mode);
    const symbol = toTrimmedString(evaluation.symbol)
      ?? toTrimmedString(run.report.winners.find((row) => row.address === mint)?.tokenName)
      ?? mint;
    const metrics = buildCandidateMetrics(run, evaluation, input);
    const manualExitPlanOverride = buildManualExitPlanOverride(input.exitOverrides);
    const now = new Date();

    const candidate = await db.candidate.create({
      data: {
        mint,
        symbol,
        name: symbol,
        source: evaluation.source,
        strategyPresetId,
        discoveryRecipeName: evaluation.recipeName,
        status: "ACCEPTED",
        discoveredAt: now,
        scheduledEvaluationAt: now,
        lastEvaluatedAt: now,
        acceptedAt: now,
        priceUsd: evaluation.priceUsd,
        liquidityUsd: evaluation.liquidityUsd,
        marketCapUsd: evaluation.marketCapUsd,
        holders: evaluation.holders,
        volume5mUsd: evaluation.volume5mUsd,
        volume30mUsd: evaluation.volume30mUsd,
        uniqueWallets5m: evaluation.uniqueWallets5m,
        buySellRatio: evaluation.buySellRatio,
        priceChange5mPercent: evaluation.priceChange5mPercent,
        priceChange30mPercent: evaluation.priceChange30mPercent,
        top10HolderPercent: evaluation.top10HolderPercent,
        largestHolderPercent: evaluation.largestHolderPercent,
        metadata: toJsonValue({
          entryOrigin: "discovery_lab_manual_entry",
          manualEntry: true,
          discoveryLab: {
            runId: run.id,
            packId: run.packId,
            packName: run.packName,
            profile: run.profile,
            createdAt: run.createdAt,
            completedAt: run.completedAt,
            reportGeneratedAt: run.report.generatedAt,
          },
          selectedEvaluation: {
            recipeName: evaluation.recipeName,
            mode: evaluation.mode,
            source: evaluation.source,
            grade: evaluation.grade,
            pass: evaluation.pass,
            rejectReason: evaluation.rejectReason,
            playScore: evaluation.playScore,
            entryScore: evaluation.entryScore,
            softIssues: evaluation.softIssues,
            notes: evaluation.notes,
          },
          requestedTradeSettings: {
            positionSizeUsd: toPositiveNumber(input.positionSizeUsd),
            exitOverrides: input.exitOverrides ?? null,
          },
        }),
        metrics: toJsonValue(metrics),
      },
    });

    try {
      const positionId = await this.execution.openPosition({
        candidateId: candidate.id,
        mint,
        symbol,
        entryPriceUsd,
        metrics,
        positionSizeUsd: toPositiveNumber(input.positionSizeUsd) ?? undefined,
        exitPlanOverride: manualExitPlanOverride,
      });

      return {
        candidateId: candidate.id,
        positionId,
        symbol,
        entryPriceUsd,
        strategyPresetId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "manual discovery-lab entry failed";
      await db.candidate.update({
        where: { id: candidate.id },
        data: {
          status: "ERROR",
          rejectReason: message,
          lastEvaluatedAt: new Date(),
          metadata: toJsonValue({
            entryOrigin: "discovery_lab_manual_entry",
            manualEntry: true,
            error: message,
            discoveryLab: {
              runId: run.id,
              packId: run.packId,
              packName: run.packName,
              profile: run.profile,
            },
          }),
        },
      });
      throw error;
    }
  }
}
