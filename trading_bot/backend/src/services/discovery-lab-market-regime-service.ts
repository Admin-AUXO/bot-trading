import { logger } from "../utils/logger.js";
import type {
  DiscoveryLabRunDetail,
  DiscoveryLabThresholdOverrides,
} from "./discovery-lab-service.js";

const CACHE_TTL_MS = 30_000;
const DEX_BATCH_SIZE = 30;
const DEX_REQUEST_TIMEOUT_MS = 4_500;

export type DiscoveryLabMarketRegime = "RISK_ON" | "CHOP" | "RISK_OFF";

export type DiscoveryLabMarketRegimeResponse = {
  runId: string;
  asOf: string;
  stale: boolean;
  regime: DiscoveryLabMarketRegime;
  confidencePercent: number;
  fetchDiagnostics: {
    queryCount: number;
    returnedCount: number;
    selectedCount: number;
    goodCount: number;
    rejectCount: number;
    selectionRatePercent: number | null;
    passRatePercent: number | null;
    winnerHitRatePercent: number | null;
    strongestQueries: Array<{
      key: string;
      source: string;
      recipeName: string;
      returnedCount: number;
      goodCount: number;
      rejectCount: number;
      winnerHitRatePercent: number | null;
    }>;
  };
  factors: {
    cohort: {
      source: "winners" | "pass" | "query-good" | "selected" | "fallback";
      tokenCount: number;
      winnerCount: number;
      passCount: number;
      evaluationCount: number;
      dexCoveragePercent: number;
    };
    momentum: {
      score: number;
      medianPriceChange5mPercent: number | null;
      medianPriceChange1hPercent: number | null;
      advancingSharePercent: number | null;
      runPassMomentum5mPercent: number | null;
    };
    breadth: {
      score: number;
      passRatePercent: number | null;
      winnerRatePercent: number | null;
      advancingSharePercent: number | null;
      dexCoveragePercent: number;
    };
    buyPressureProxy: {
      score: number;
      medianBuyToSellRatio5m: number | null;
      buyDominantSharePercent: number | null;
      runPassBuySellRatio: number | null;
    };
    participationLiquidityQuality: {
      score: number;
      medianLiquidityUsd: number | null;
      medianVolume24hUsd: number | null;
      runPassVolume5mUsd: number | null;
      runPassUniqueWallets5m: number | null;
    };
  };
  suggestedThresholdOverrides: DiscoveryLabThresholdOverrides;
  optimizationSuggestions: Array<{
    id: string;
    label: string;
    objective: "expand" | "balance" | "tighten";
    summary: string;
    thresholdOverrides: DiscoveryLabThresholdOverrides;
  }>;
};

type DiscoveryLabMarketRegimeServiceDeps = {
  getRun: (runId: string) => Promise<DiscoveryLabRunDetail | null>;
};

type CacheEntry = {
  expiresAt: number;
  value: DiscoveryLabMarketRegimeResponse;
};

type Cohort = {
  source: "winners" | "pass" | "query-good" | "selected" | "fallback";
  tokens: string[];
};

type RunSignalMetrics = {
  winnerCount: number;
  passCount: number;
  evaluationCount: number;
  passRatePercent: number | null;
  winnerRatePercent: number | null;
  passMomentum5mPercent: number | null;
  passBuySellRatio: number | null;
  passVolume5mUsd: number | null;
  passUniqueWallets5m: number | null;
  fetchDiagnostics: DiscoveryLabMarketRegimeResponse["fetchDiagnostics"];
};

type DexTokenSignal = {
  token: string;
  priceChange5mPercent: number | null;
  priceChange1hPercent: number | null;
  buys5m: number | null;
  sells5m: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
};

type DexTokenSignalWithRank = DexTokenSignal & {
  liquidityRank: number;
  volumeRank: number;
};

export class DiscoveryLabMarketRegimeService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly deps: DiscoveryLabMarketRegimeServiceDeps) {}

  async getMarketRegime(runId: string): Promise<DiscoveryLabMarketRegimeResponse> {
    const normalizedRunId = runId.trim();
    if (normalizedRunId.length === 0) {
      throw new Error("runId is required");
    }

    const now = Date.now();
    const cached = this.cache.get(normalizedRunId);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const run = await this.deps.getRun(normalizedRunId);
    if (!run) {
      throw new Error("discovery lab run not found");
    }

    const cohort = selectRunCohort(run);
    const runSignals = extractRunSignals(run);
    const staleFromRunState = run.status === "RUNNING" || cohort.tokens.length === 0;

    const { dexSignals, hadFetchErrors } = await this.fetchDexSignals(cohort.tokens);
    if (hadFetchErrors && dexSignals.size === 0 && cached) {
      const fallback = {
        ...cached.value,
        stale: true,
      };
      this.setCache(normalizedRunId, fallback);
      return fallback;
    }

    const result = buildMarketRegimeResponse({
      run,
      cohort,
      runSignals,
      dexSignals,
      stale: staleFromRunState || hadFetchErrors || (cohort.tokens.length > 0 && dexSignals.size === 0),
    });

    this.setCache(normalizedRunId, result);
    return result;
  }

  private setCache(runId: string, value: DiscoveryLabMarketRegimeResponse): void {
    this.cache.set(runId, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });
    if (this.cache.size <= 100) {
      return;
    }
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private async fetchDexSignals(tokens: string[]): Promise<{
    dexSignals: Map<string, DexTokenSignal>;
    hadFetchErrors: boolean;
  }> {
    const uniqueTokens = dedupeAddresses(tokens);
    if (uniqueTokens.length === 0) {
      return { dexSignals: new Map(), hadFetchErrors: false };
    }

    const merged = new Map<string, DexTokenSignalWithRank>();
    let hadFetchErrors = false;

    for (const batch of chunk(uniqueTokens, DEX_BATCH_SIZE)) {
      try {
        const batchSignals = await this.fetchDexBatch(batch);
        for (const [token, signal] of batchSignals.entries()) {
          const current = merged.get(token);
          if (!current || isBetterDexSignal(signal, current)) {
            merged.set(token, signal);
          }
        }
      } catch (error) {
        hadFetchErrors = true;
        logger.warn(
          {
            err: error,
            tokenCount: batch.length,
          },
          "discovery-lab market regime: DexScreener batch fetch failed",
        );
      }
    }

    const dexSignals = new Map<string, DexTokenSignal>();
    for (const [token, signal] of merged.entries()) {
      dexSignals.set(token, {
        token,
        priceChange5mPercent: signal.priceChange5mPercent,
        priceChange1hPercent: signal.priceChange1hPercent,
        buys5m: signal.buys5m,
        sells5m: signal.sells5m,
        liquidityUsd: signal.liquidityUsd,
        volume24hUsd: signal.volume24hUsd,
      });
    }

    return { dexSignals, hadFetchErrors };
  }

  private async fetchDexBatch(tokens: string[]): Promise<Map<string, DexTokenSignalWithRank>> {
    const url = new URL(`https://api.dexscreener.com/latest/dex/tokens/${tokens.join(",")}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEX_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DexScreener tokens endpoint failed with ${response.status}`);
      }

      const payload = await response.json() as unknown;
      return parseDexSignals(payload, tokens);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildMarketRegimeResponse(input: {
  run: DiscoveryLabRunDetail;
  cohort: Cohort;
  runSignals: RunSignalMetrics;
  dexSignals: Map<string, DexTokenSignal>;
  stale: boolean;
}): DiscoveryLabMarketRegimeResponse {
  const { run, cohort, runSignals, dexSignals, stale } = input;
  const cohortSignals = cohort.tokens
    .map((token) => dexSignals.get(token))
    .filter((value): value is DexTokenSignal => Boolean(value));

  const coveragePercent = cohort.tokens.length > 0
    ? round((cohortSignals.length / cohort.tokens.length) * 100, 1)
    : 0;

  const medianPriceChange5m = median(
    cohortSignals.map((signal) => signal.priceChange5mPercent).filter((value): value is number => value !== null),
  );
  const medianPriceChange1h = median(
    cohortSignals.map((signal) => signal.priceChange1hPercent).filter((value): value is number => value !== null),
  );
  const advancingSharePercent = sharePercent(
    cohortSignals.map((signal) => signal.priceChange5mPercent).filter((value): value is number => value !== null),
    (value) => value > 0,
  );

  const buySellRatios = cohortSignals
    .filter((signal) => signal.buys5m !== null && signal.sells5m !== null)
    .map((signal) => (signal.buys5m as number + 1) / (signal.sells5m as number + 1));
  const medianBuyToSellRatio5m = median(buySellRatios);
  const buyDominantSharePercent = sharePercent(buySellRatios, (value) => value > 1);

  const medianLiquidityUsd = median(
    cohortSignals.map((signal) => signal.liquidityUsd).filter((value): value is number => value !== null),
  );
  const medianVolume24hUsd = median(
    cohortSignals.map((signal) => signal.volume24hUsd).filter((value): value is number => value !== null),
  );

  const momentumScore = factorScore([
    normalizedPercent(medianPriceChange5m, -12, 12),
    normalizedPercent(medianPriceChange1h, -20, 20),
    normalizedPercent(runSignals.passMomentum5mPercent, -10, 10),
    advancingSharePercent,
  ], 40);
  const breadthScore = factorScore([
    runSignals.passRatePercent,
    normalizedPercent(runSignals.winnerRatePercent, 5, 40),
    advancingSharePercent,
    coveragePercent,
  ], 38);
  const buyPressureScore = factorScore([
    normalizedPercent(medianBuyToSellRatio5m, 0.8, 1.8),
    buyDominantSharePercent,
    normalizedPercent(runSignals.passBuySellRatio, 0.9, 1.6),
  ], 36);
  const participationScore = factorScore([
    normalizedPercent(medianLiquidityUsd, 8_000, 200_000),
    normalizedPercent(medianVolume24hUsd, 20_000, 500_000),
    normalizedPercent(runSignals.passVolume5mUsd, 500, 15_000),
    normalizedPercent(runSignals.passUniqueWallets5m, 8, 90),
  ], 35);

  const compositeScore = Math.round(
    (momentumScore * 0.35)
    + (breadthScore * 0.25)
    + (buyPressureScore * 0.2)
    + (participationScore * 0.2),
  );

  const regime: DiscoveryLabMarketRegime = compositeScore >= 62
    ? "RISK_ON"
    : compositeScore < 42
      ? "RISK_OFF"
      : "CHOP";

  const sampleConfidence = normalizedUnit(cohort.tokens.length, 3, 25);
  const coverageConfidence = coveragePercent / 100;
  const signalStrengthConfidence = Math.min(1, Math.abs(compositeScore - 50) / 35);
  const completenessConfidence = [
    medianPriceChange5m,
    medianPriceChange1h,
    medianBuyToSellRatio5m,
    medianLiquidityUsd,
    runSignals.passRatePercent,
    runSignals.passBuySellRatio,
  ].filter((value) => value !== null).length / 6;

  const confidenceRaw = 30
    + (sampleConfidence * 20)
    + (coverageConfidence * 25)
    + (signalStrengthConfidence * 15)
    + (completenessConfidence * 15)
    - (stale ? 20 : 0);
  const confidencePercent = clamp(Math.round(confidenceRaw), 12, 95);

  return {
    runId: run.id,
    asOf: new Date().toISOString(),
    stale,
    regime,
    confidencePercent,
    fetchDiagnostics: runSignals.fetchDiagnostics,
    factors: {
      cohort: {
        source: cohort.source,
        tokenCount: cohort.tokens.length,
        winnerCount: runSignals.winnerCount,
        passCount: runSignals.passCount,
        evaluationCount: runSignals.evaluationCount,
        dexCoveragePercent: coveragePercent,
      },
      momentum: {
        score: momentumScore,
        medianPriceChange5mPercent: roundNullable(medianPriceChange5m, 2),
        medianPriceChange1hPercent: roundNullable(medianPriceChange1h, 2),
        advancingSharePercent: roundNullable(advancingSharePercent, 1),
        runPassMomentum5mPercent: roundNullable(runSignals.passMomentum5mPercent, 2),
      },
      breadth: {
        score: breadthScore,
        passRatePercent: roundNullable(runSignals.passRatePercent, 1),
        winnerRatePercent: roundNullable(runSignals.winnerRatePercent, 1),
        advancingSharePercent: roundNullable(advancingSharePercent, 1),
        dexCoveragePercent: coveragePercent,
      },
      buyPressureProxy: {
        score: buyPressureScore,
        medianBuyToSellRatio5m: roundNullable(medianBuyToSellRatio5m, 3),
        buyDominantSharePercent: roundNullable(buyDominantSharePercent, 1),
        runPassBuySellRatio: roundNullable(runSignals.passBuySellRatio, 3),
      },
      participationLiquidityQuality: {
        score: participationScore,
        medianLiquidityUsd: roundNullable(medianLiquidityUsd, 0),
        medianVolume24hUsd: roundNullable(medianVolume24hUsd, 0),
        runPassVolume5mUsd: roundNullable(runSignals.passVolume5mUsd, 0),
        runPassUniqueWallets5m: roundNullable(runSignals.passUniqueWallets5m, 1),
      },
    },
    suggestedThresholdOverrides: deriveSuggestedOverrides(run.thresholdOverrides ?? {}, regime),
    optimizationSuggestions: deriveOptimizationSuggestions({
      existing: run.thresholdOverrides ?? {},
      regime,
      diagnostics: runSignals.fetchDiagnostics,
    }),
  };
}

function extractRunSignals(run: DiscoveryLabRunDetail): RunSignalMetrics {
  const report = asRecord(run.report);
  const winners = asArray(report?.winners).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  const deepEvaluations = asArray(report?.deepEvaluations).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  const passRows = deepEvaluations.filter((row) => asBoolean(row.pass) === true);

  const evaluationCount = deepEvaluations.length > 0
    ? deepEvaluations.length
    : Number.isFinite(run.evaluationCount) && run.evaluationCount !== null
      ? run.evaluationCount
      : 0;
  const winnerCount = winners.length > 0
    ? winners.length
    : Number.isFinite(run.winnerCount) && run.winnerCount !== null
      ? run.winnerCount
      : 0;
  const passCount = passRows.length;

  const passRatePercent = evaluationCount > 0 ? (passCount / evaluationCount) * 100 : null;
  const winnerRatePercent = evaluationCount > 0 ? (winnerCount / evaluationCount) * 100 : null;
  const querySummaries = asArray(report?.querySummaries).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  const returnedCount = querySummaries.reduce((sum, row) => sum + (asNumber(row.returnedCount) ?? 0), 0);
  const selectedCount = querySummaries.reduce((sum, row) => sum + (asNumber(row.selectedCount) ?? 0), 0);
  const goodCount = querySummaries.reduce((sum, row) => sum + (asNumber(row.goodCount) ?? 0), 0);
  const rejectCount = querySummaries.reduce((sum, row) => {
    const selected = asNumber(row.selectedCount) ?? 0;
    const good = asNumber(row.goodCount) ?? 0;
    const reportedReject = asNumber(row.rejectCount);
    return sum + (reportedReject ?? Math.max(selected - good, 0));
  }, 0);
  const strongestQueries = [...querySummaries]
    .sort((left, right) => {
      const rightWinRate = asNumber(right.winnerHitRatePercent) ?? 0;
      const leftWinRate = asNumber(left.winnerHitRatePercent) ?? 0;
      return rightWinRate - leftWinRate
        || (asNumber(right.goodCount) ?? 0) - (asNumber(left.goodCount) ?? 0)
        || (asNumber(right.returnedCount) ?? 0) - (asNumber(left.returnedCount) ?? 0);
    })
    .slice(0, 4)
    .map((row) => ({
      key: asString(row.key) ?? "",
      source: asString(row.source) ?? "unknown",
      recipeName: asString(row.recipeName) ?? "unknown",
      returnedCount: asNumber(row.returnedCount) ?? 0,
      goodCount: asNumber(row.goodCount) ?? 0,
      rejectCount: asNumber(row.rejectCount) ?? Math.max((asNumber(row.selectedCount) ?? 0) - (asNumber(row.goodCount) ?? 0), 0),
      winnerHitRatePercent: asNumber(row.winnerHitRatePercent),
    }));

  return {
    winnerCount,
    passCount,
    evaluationCount,
    passRatePercent,
    winnerRatePercent,
    passMomentum5mPercent: median(passRows.map((row) => asNumber(row.priceChange5mPercent)).filter((value): value is number => value !== null)),
    passBuySellRatio: median(passRows.map((row) => asNumber(row.buySellRatio)).filter((value): value is number => value !== null)),
    passVolume5mUsd: median(passRows.map((row) => asNumber(row.volume5mUsd)).filter((value): value is number => value !== null)),
    passUniqueWallets5m: median(passRows.map((row) => asNumber(row.uniqueWallets5m)).filter((value): value is number => value !== null)),
    fetchDiagnostics: {
      queryCount: querySummaries.length,
      returnedCount,
      selectedCount,
      goodCount,
      rejectCount,
      selectionRatePercent: returnedCount > 0 ? round((selectedCount / returnedCount) * 100, 1) : null,
      passRatePercent: selectedCount > 0 ? round((goodCount / selectedCount) * 100, 1) : null,
      winnerHitRatePercent: returnedCount > 0 ? round((goodCount / returnedCount) * 100, 1) : null,
      strongestQueries,
    },
  };
}

function selectRunCohort(run: DiscoveryLabRunDetail): Cohort {
  const report = asRecord(run.report);
  const winners = dedupeAddresses(
    asArray(report?.winners)
      .map(asRecord)
      .map((row) => asString(row?.address))
      .filter((value): value is string => Boolean(value)),
  );
  if (winners.length > 0) {
    return { source: "winners", tokens: winners };
  }

  const deepEvaluations = asArray(report?.deepEvaluations).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  const pass = dedupeAddresses(
    deepEvaluations
      .filter((row) => asBoolean(row.pass) === true)
      .map((row) => asString(row.mint))
      .filter((value): value is string => Boolean(value)),
  );
  if (pass.length > 0) {
    return { source: "pass", tokens: pass };
  }

  const querySummaries = asArray(report?.querySummaries).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  const good = dedupeAddresses(
    querySummaries.flatMap((row) => asArray(row.goodMints).map((mint) => asString(mint)).filter((value): value is string => Boolean(value))),
  );
  if (good.length > 0) {
    return { source: "query-good", tokens: good };
  }

  const selected = dedupeAddresses(
    querySummaries.flatMap((row) => asArray(row.topSelectedTokens)
      .map(asRecord)
      .map((token) => asString(token?.mint))
      .filter((value): value is string => Boolean(value))),
  );
  if (selected.length > 0) {
    return { source: "selected", tokens: selected };
  }

  const fallback = dedupeAddresses(
    deepEvaluations
      .map((row) => asString(row.mint))
      .filter((value): value is string => Boolean(value)),
  );
  return { source: "fallback", tokens: fallback };
}

function deriveSuggestedOverrides(
  existing: DiscoveryLabThresholdOverrides,
  regime: DiscoveryLabMarketRegime,
): DiscoveryLabThresholdOverrides {
  const baseline = buildThresholdBaseline(existing);

  if (regime === "RISK_ON") {
    return {
      minLiquidityUsd: Math.max(4_000, Math.round(baseline.minLiquidityUsd * 0.9)),
      maxMarketCapUsd: Math.round(baseline.maxMarketCapUsd * 1.15),
      minHolders: Math.max(25, Math.round(baseline.minHolders * 0.9)),
      minVolume5mUsd: Math.max(800, Math.round(baseline.minVolume5mUsd * 0.9)),
      minUniqueBuyers5m: Math.max(8, Math.round(baseline.minUniqueBuyers5m * 0.9)),
      minBuySellRatio: round(Math.max(1, baseline.minBuySellRatio - 0.03), 2),
      maxTop10HolderPercent: Math.min(60, Math.round(baseline.maxTop10HolderPercent * 1.05)),
      maxSingleHolderPercent: Math.min(35, Math.round(baseline.maxSingleHolderPercent * 1.05)),
      maxNegativePriceChange5mPercent: Math.min(30, Math.round(baseline.maxNegativePriceChange5mPercent * 1.15)),
    };
  }

  if (regime === "RISK_OFF") {
    return {
      minLiquidityUsd: Math.round(baseline.minLiquidityUsd * 1.25),
      maxMarketCapUsd: Math.max(500_000, Math.round(baseline.maxMarketCapUsd * 0.85)),
      minHolders: Math.round(baseline.minHolders * 1.2),
      minVolume5mUsd: Math.round(baseline.minVolume5mUsd * 1.4),
      minUniqueBuyers5m: Math.round(baseline.minUniqueBuyers5m * 1.35),
      minBuySellRatio: round(baseline.minBuySellRatio + 0.08, 2),
      maxTop10HolderPercent: Math.max(20, Math.round(baseline.maxTop10HolderPercent - 5)),
      maxSingleHolderPercent: Math.max(12, Math.round(baseline.maxSingleHolderPercent - 3)),
      maxNegativePriceChange5mPercent: Math.max(6, Math.round(baseline.maxNegativePriceChange5mPercent * 0.7)),
    };
  }

  return {
    minLiquidityUsd: Math.round(baseline.minLiquidityUsd * 1.05),
    maxMarketCapUsd: baseline.maxMarketCapUsd,
    minHolders: Math.round(baseline.minHolders * 1.05),
    minVolume5mUsd: Math.round(baseline.minVolume5mUsd * 1.1),
    minUniqueBuyers5m: Math.round(baseline.minUniqueBuyers5m * 1.1),
    minBuySellRatio: round(baseline.minBuySellRatio + 0.03, 2),
    maxTop10HolderPercent: Math.max(25, Math.round(baseline.maxTop10HolderPercent - 2)),
    maxSingleHolderPercent: Math.max(14, Math.round(baseline.maxSingleHolderPercent - 1)),
    maxNegativePriceChange5mPercent: Math.max(8, Math.round(baseline.maxNegativePriceChange5mPercent * 0.9)),
  };
}

function deriveOptimizationSuggestions(input: {
  existing: DiscoveryLabThresholdOverrides;
  regime: DiscoveryLabMarketRegime;
  diagnostics: DiscoveryLabMarketRegimeResponse["fetchDiagnostics"];
}): DiscoveryLabMarketRegimeResponse["optimizationSuggestions"] {
  const baseline = buildThresholdBaseline(input.existing);
  const { diagnostics, regime } = input;
  const veryThinFetch = diagnostics.returnedCount < 40;
  const weakHitRate = (diagnostics.winnerHitRatePercent ?? 0) < 8;
  const noisySelection = (diagnostics.passRatePercent ?? 100) < 28;
  const strongHitRate = (diagnostics.winnerHitRatePercent ?? 0) >= 18;

  const expand = {
    minLiquidityUsd: Math.max(4_000, Math.round(baseline.minLiquidityUsd * (veryThinFetch ? 0.82 : 0.9))),
    maxMarketCapUsd: Math.round(baseline.maxMarketCapUsd * (regime === "RISK_ON" ? 1.2 : 1.1)),
    minHolders: Math.max(24, Math.round(baseline.minHolders * 0.88)),
    minVolume5mUsd: Math.max(750, Math.round(baseline.minVolume5mUsd * (veryThinFetch ? 0.78 : 0.88))),
    minUniqueBuyers5m: Math.max(8, Math.round(baseline.minUniqueBuyers5m * 0.9)),
    minBuySellRatio: round(Math.max(1, baseline.minBuySellRatio - 0.04), 2),
    maxTop10HolderPercent: Math.min(60, Math.round(baseline.maxTop10HolderPercent + 3)),
    maxSingleHolderPercent: Math.min(35, Math.round(baseline.maxSingleHolderPercent + 2)),
    maxNegativePriceChange5mPercent: Math.min(30, Math.round(baseline.maxNegativePriceChange5mPercent * 1.12)),
  };
  const balance = weakHitRate || noisySelection
    ? {
      minLiquidityUsd: Math.round(baseline.minLiquidityUsd * 1.08),
      maxMarketCapUsd: Math.round(baseline.maxMarketCapUsd * 0.96),
      minHolders: Math.round(baseline.minHolders * 1.08),
      minVolume5mUsd: Math.round(baseline.minVolume5mUsd * 1.12),
      minUniqueBuyers5m: Math.round(baseline.minUniqueBuyers5m * 1.1),
      minBuySellRatio: round(baseline.minBuySellRatio + 0.04, 2),
      maxTop10HolderPercent: Math.max(24, Math.round(baseline.maxTop10HolderPercent - 2)),
      maxSingleHolderPercent: Math.max(12, Math.round(baseline.maxSingleHolderPercent - 1)),
      maxNegativePriceChange5mPercent: Math.max(7, Math.round(baseline.maxNegativePriceChange5mPercent * 0.92)),
    }
    : deriveSuggestedOverrides(input.existing, regime);
  const tighten = {
    minLiquidityUsd: Math.round(baseline.minLiquidityUsd * (strongHitRate ? 1.18 : 1.25)),
    maxMarketCapUsd: Math.max(600_000, Math.round(baseline.maxMarketCapUsd * 0.84)),
    minHolders: Math.round(baseline.minHolders * 1.2),
    minVolume5mUsd: Math.round(baseline.minVolume5mUsd * 1.3),
    minUniqueBuyers5m: Math.round(baseline.minUniqueBuyers5m * 1.22),
    minBuySellRatio: round(baseline.minBuySellRatio + 0.08, 2),
    maxTop10HolderPercent: Math.max(20, Math.round(baseline.maxTop10HolderPercent - 5)),
    maxSingleHolderPercent: Math.max(10, Math.round(baseline.maxSingleHolderPercent - 3)),
    maxNegativePriceChange5mPercent: Math.max(5, Math.round(baseline.maxNegativePriceChange5mPercent * 0.75)),
  };

  return [
    {
      id: "expand-recall",
      label: "More tokens",
      objective: "expand",
      summary: `Use when fetch volume is thin and you want to widen the initial discovery net. Targets more returned rows while keeping the pack viable for 50% to 100% setups.`,
      thresholdOverrides: expand,
    },
    {
      id: "balanced-winners",
      label: "Balanced winners",
      objective: "balance",
      summary: `Use when you want a middle path between row count and quality. It reacts to winner-hit rate and reject pressure instead of only the broad market regime.`,
      thresholdOverrides: balance,
    },
    {
      id: "tighten-quality",
      label: "Better quality",
      objective: "tighten",
      summary: `Use when the run returned enough names but too many were rejects. It raises participation and holder quality to push toward cleaner higher-conviction continuations.`,
      thresholdOverrides: tighten,
    },
  ];
}

function buildThresholdBaseline(existing: DiscoveryLabThresholdOverrides) {
  return {
    minLiquidityUsd: existing.minLiquidityUsd ?? 8_000,
    maxMarketCapUsd: existing.maxMarketCapUsd ?? 2_000_000,
    minHolders: existing.minHolders ?? 35,
    minVolume5mUsd: existing.minVolume5mUsd ?? 1_500,
    minUniqueBuyers5m: existing.minUniqueBuyers5m ?? 12,
    minBuySellRatio: existing.minBuySellRatio ?? 1.05,
    maxTop10HolderPercent: existing.maxTop10HolderPercent ?? 45,
    maxSingleHolderPercent: existing.maxSingleHolderPercent ?? 25,
    maxNegativePriceChange5mPercent: existing.maxNegativePriceChange5mPercent ?? 18,
  };
}

function parseDexSignals(payload: unknown, requestedTokens: string[]): Map<string, DexTokenSignalWithRank> {
  const requested = new Set(dedupeAddresses(requestedTokens));
  const pairs = asArray(asRecord(payload)?.pairs).map(asRecord).filter((value): value is Record<string, unknown> => Boolean(value));
  const results = new Map<string, DexTokenSignalWithRank>();

  for (const pair of pairs) {
    const baseAddress = normalizeAddress(asString(asRecord(pair.baseToken)?.address));
    const quoteAddress = normalizeAddress(asString(asRecord(pair.quoteToken)?.address));
    const matchedTokens = [baseAddress, quoteAddress]
      .filter((token): token is string => typeof token === "string" && requested.has(token));
    if (matchedTokens.length === 0) {
      continue;
    }

    const priceChange = asRecord(pair.priceChange);
    const txns5m = asRecord(asRecord(pair.txns)?.m5);
    const liquidityUsd = asNumber(asRecord(pair.liquidity)?.usd);
    const volume24hUsd = asNumber(asRecord(pair.volume)?.h24);
    const candidate: DexTokenSignalWithRank = {
      token: matchedTokens[0],
      priceChange5mPercent: asNumber(priceChange?.m5),
      priceChange1hPercent: asNumber(priceChange?.h1),
      buys5m: asNumber(txns5m?.buys),
      sells5m: asNumber(txns5m?.sells),
      liquidityUsd,
      volume24hUsd,
      liquidityRank: liquidityUsd ?? -1,
      volumeRank: volume24hUsd ?? -1,
    };

    for (const token of matchedTokens) {
      const existing = results.get(token);
      const forToken = { ...candidate, token };
      if (!existing || isBetterDexSignal(forToken, existing)) {
        results.set(token, forToken);
      }
    }
  }

  return results;
}

function isBetterDexSignal(left: DexTokenSignalWithRank, right: DexTokenSignalWithRank): boolean {
  if (left.liquidityRank !== right.liquidityRank) {
    return left.liquidityRank > right.liquidityRank;
  }
  return left.volumeRank > right.volumeRank;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function factorScore(values: Array<number | null>, fallback: number): number {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return fallback;
  }
  return Math.round(present.reduce((sum, value) => sum + value, 0) / present.length);
}

function normalizedPercent(value: number | null, min: number, max: number): number | null {
  if (value === null) {
    return null;
  }
  return round(normalizedUnit(value, min, max) * 100, 1);
}

function normalizedUnit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0;
  if (value <= min) return 0;
  if (value >= max) return 1;
  return (value - min) / (max - min);
}

function sharePercent(values: number[], predicate: (value: number) => boolean): number | null {
  if (values.length === 0) {
    return null;
  }
  const matched = values.filter((value) => predicate(value)).length;
  return (matched / values.length) * 100;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundNullable(value: number | null, decimals: number): number | null {
  if (value === null) {
    return null;
  }
  return round(value, decimals);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dedupeAddresses(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeAddress(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeAddress(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
