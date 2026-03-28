import { parentPort } from "node:worker_threads";
import type { ApiService, MarketRegime, Strategy, TradeMode } from "@prisma/client";
import { config } from "../config/index.js";
import { createPrismaClient } from "../db/client.js";

const db = createPrismaClient();
export const TOTAL_SERIES_KEY = "ALL" as const;
const DAY_MS = 86_400_000;

interface StatsTask {
  date?: string;
}

interface StatsResult {
  success: boolean;
  date: string;
}

export function resolveSeriesKey(strategy: Strategy | null): string {
  return strategy ?? TOTAL_SERIES_KEY;
}

export function carryForwardCapital(
  previousCapitalEnd: number | null,
  netPnlUsd: number,
  fallbackCapitalUsd: number = config.capital.startingUsd,
): { capitalStart: number; capitalEnd: number } {
  const capitalStart = previousCapitalEnd ?? fallbackCapitalUsd;
  return {
    capitalStart,
    capitalEnd: capitalStart + netPnlUsd,
  };
}

export function chooseHistoricalRegime(
  snapshots: Array<{ regime: MarketRegime; snappedAt: Date }>,
  fallback: MarketRegime = "NORMAL",
): MarketRegime {
  if (snapshots.length === 0) return fallback;
  return [...snapshots].sort((a, b) => b.snappedAt.getTime() - a.snappedAt.getTime())[0].regime;
}

async function aggregateDailyStats(date: Date): Promise<void> {
  const dateStr = date.toISOString().slice(0, 10);
  const dayStart = new Date(dateStr);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const strategies = ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"] as const;
  const modes = ["LIVE", "DRY_RUN"] as const;

  const profiles = await db.configProfile.findMany({ select: { name: true } });
  const profileNames = [...new Set(["default", ...profiles.map((p) => p.name)])];

  const slices: Array<{
    dayStart: Date;
    dayEnd: Date;
    strategy: Strategy | null;
    mode: TradeMode;
    configProfile: string;
    seriesKey: string;
  }> = [];

  for (const mode of modes) {
    for (const profileName of profileNames) {
      for (const strategy of [...strategies, null]) {
        slices.push({
          dayStart,
          dayEnd,
          strategy,
          mode,
          configProfile: profileName,
          seriesKey: resolveSeriesKey(strategy),
        });
      }
    }
  }

  await Promise.all(slices.map((s) => aggregateForSlice(s)));

  await aggregateApiUsage(dayStart);
}

async function aggregateForSlice(params: {
  dayStart: Date;
  dayEnd: Date;
  strategy: Strategy | null;
  mode: TradeMode;
  configProfile: string;
  seriesKey: string;
}): Promise<void> {
  const { dayStart, dayEnd, strategy, mode, configProfile, seriesKey } = params;

  const tradeWhere: Record<string, unknown> = {
    side: "SELL",
    executedAt: { gte: dayStart, lt: dayEnd },
    mode,
    configProfile,
  };
  if (strategy) tradeWhere.strategy = strategy;

  const buyWhere: Record<string, unknown> = {
    side: "BUY",
    executedAt: { gte: dayStart, lt: dayEnd },
    mode,
    configProfile,
  };
  if (strategy) buyWhere.strategy = strategy;

  const positionWhere: Record<string, unknown> = {
    closedAt: { gte: dayStart, lt: dayEnd },
    mode,
    configProfile,
  };
  if (strategy) positionWhere.strategy = strategy;

  const [sells, buys, closedPositions, previousStats, snapshots] = await Promise.all([
    db.trade.findMany({ where: tradeWhere, select: { pnlUsd: true, gasFee: true, jitoTip: true, trancheNumber: true } }),
    db.trade.findMany({ where: buyWhere, select: { gasFee: true, jitoTip: true } }),
    db.position.findMany({ where: positionWhere, select: { openedAt: true, closedAt: true } }),
    db.dailyStats.findFirst({
      where: {
        date: { lt: dayStart },
        mode,
        configProfile,
        seriesKey,
      },
      orderBy: { date: "desc" },
      select: { capitalEnd: true },
    }),
    db.regimeSnapshot.findMany({
      where: { snappedAt: { lt: dayEnd } },
      orderBy: { snappedAt: "desc" },
      take: 5,
      select: { regime: true, snappedAt: true },
    }),
  ]);

  const wins = sells.filter((t) => Number(t.pnlUsd ?? 0) > 0);
  const losses = sells.filter((t) => Number(t.pnlUsd ?? 0) <= 0);
  const totalTrades = sells.length + buys.length;

  const grossPnl = sells.reduce((s, t) => s + Number(t.pnlUsd ?? 0), 0);
  const allTrades = [...sells, ...buys];
  const totalGas = allTrades.reduce((s, t) => s + Number(t.gasFee), 0);
  const totalTips = allTrades.reduce((s, t) => s + Number(t.jitoTip), 0);
  const netPnl = grossPnl - totalGas - totalTips;

  const avgWinUsd = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnlUsd ?? 0), 0) / wins.length : 0;
  const avgLossUsd = losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(Number(t.pnlUsd ?? 0)), 0) / losses.length : 0;

  const grossWins = wins.reduce((s, t) => s + Number(t.pnlUsd ?? 0), 0);
  const grossLosses = losses.reduce((s, t) => s + Math.abs(Number(t.pnlUsd ?? 0)), 0);
  const profitFactor = grossLosses === 0 ? (grossWins > 0 ? 9999 : 0) : grossWins / grossLosses;

  const winRate = sells.length > 0 ? wins.length / sells.length : 0;
  const lossRate = 1 - winRate;
  const expectancy = winRate * avgWinUsd - lossRate * avgLossUsd;

  const avgHoldMinutes =
    closedPositions.length > 0
      ? closedPositions.reduce((s, p) => {
          const holdMs = (p.closedAt as Date).getTime() - p.openedAt.getTime();
          return s + holdMs / 60_000;
        }, 0) / closedPositions.length
      : 0;

  const sellCount = sells.length;
  const trancheT1Pct = sellCount > 0 ? sells.filter((t) => t.trancheNumber === 1).length / sellCount : 0;
  const trancheT2Pct = sellCount > 0 ? sells.filter((t) => t.trancheNumber === 2).length / sellCount : 0;
  const trancheT3Pct = sellCount > 0 ? sells.filter((t) => t.trancheNumber === 3).length / sellCount : 0;

  const { capitalStart, capitalEnd } = carryForwardCapital(
    previousStats ? Number(previousStats.capitalEnd) : null,
    netPnl,
  );

  const data = {
    tradesTotal: totalTrades,
    tradesWon: wins.length,
    tradesLost: losses.length,
    winRate,
    grossPnlUsd: grossPnl,
    netPnlUsd: netPnl,
    totalGasFees: totalGas,
    totalJitoTips: totalTips,
    avgWinUsd,
    avgLossUsd,
    profitFactor,
    expectancy,
    avgHoldMinutes,
    trancheT1Pct,
    trancheT2Pct,
    trancheT3Pct,
    capitalStart,
    capitalEnd,
    regime: chooseHistoricalRegime(snapshots),
  };

  await db.dailyStats.upsert({
    where: {
      date_seriesKey_mode_configProfile: {
        date: dayStart,
        seriesKey,
        mode,
        configProfile,
      },
    },
    update: data,
    create: {
      date: dayStart,
      strategy,
      seriesKey,
      mode,
      configProfile,
      ...data,
    },
  });
}

async function aggregateApiUsage(date: Date): Promise<void> {
  const dayEnd = new Date(date.getTime() + DAY_MS);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

  for (const service of ["HELIUS", "BIRDEYE"] as const) {
    const [dailyCalls, monthlyAgg] = await Promise.all([
      db.apiCall.findMany({
        where: {
          service,
          calledAt: { gte: date, lt: dayEnd },
        },
        select: {
          endpoint: true,
          strategy: true,
          mode: true,
          configProfile: true,
          purpose: true,
          essential: true,
          cacheHit: true,
          credits: true,
          batchSize: true,
          latencyMs: true,
          statusCode: true,
          calledAt: true,
        },
      }),
      db.apiCall.aggregate({
        where: {
          service,
          calledAt: { gte: monthStart, lt: dayEnd },
        },
        _sum: { credits: true },
      }),
    ]);

    const totalCalls = dailyCalls.length;
    const totalCredits = dailyCalls.reduce((sum, call) => sum + call.credits, 0);
    const essentialCalls = dailyCalls.filter((call) => call.essential).length;
    const essentialCredits = dailyCalls.filter((call) => call.essential).reduce((sum, call) => sum + call.credits, 0);
    const nonEssentialCredits = Math.max(0, totalCredits - essentialCredits);
    const cachedCalls = dailyCalls.filter((call) => call.cacheHit).length;
    const avgLatencyMs = averageOf(dailyCalls.map((call) => call.latencyMs ?? 0).filter((latency) => latency > 0));
    const errorCount = dailyCalls.filter((call) => (call.statusCode ?? 0) >= 400).length;
    const avgCreditsPerCall = totalCalls > 0 ? totalCredits / totalCalls : 0;
    const peakRps = computePeakRps(dailyCalls.map((call) => call.calledAt));
    const budgetTotal = service === "HELIUS" ? config.apiBudgets.helius.monthly : config.apiBudgets.birdeye.monthly;
    const monthlyCreditsUsed = Number(monthlyAgg._sum.credits ?? 0);
    const monthlyCreditsRemaining = Math.max(0, budgetTotal - monthlyCreditsUsed);
    const reserveCredits = Math.floor(budgetTotal * config.apiBudgets.reservePct);
    const remainingDays = Math.max(1, Math.ceil((Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - dayEnd.getTime()) / DAY_MS));
    const dailyBudget = remainingDays > 0 ? Math.floor(Math.max(0, monthlyCreditsRemaining - reserveCredits) / remainingDays) : 0;
    const dailyCreditsRemaining = Math.max(0, dailyBudget - totalCredits);
    const budgetUsedPercent = budgetTotal > 0 ? (monthlyCreditsUsed / budgetTotal) * 100 : 0;
    const quotaStatus =
      monthlyCreditsRemaining <= 0
        ? "PAUSED"
        : dailyBudget > 0 && totalCredits >= dailyBudget
        ? "HARD_LIMIT"
        : dailyBudget > 0 && totalCredits >= Math.floor(dailyBudget * (config.apiBudgets.softLimitPct / 100))
        ? "SOFT_LIMIT"
        : "HEALTHY";

    await db.apiUsageDaily.upsert({
      where: { date_service: { date, service } },
      update: {
        totalCalls,
        totalCredits,
        budgetTotal,
        budgetUsedPercent,
        monthlyCreditsUsed,
        monthlyCreditsRemaining,
        dailyBudget,
        dailyCreditsRemaining,
        essentialCalls,
        essentialCredits,
        nonEssentialCredits,
        cachedCalls,
        avgCreditsPerCall,
        peakRps,
        avgLatencyMs: Math.round(avgLatencyMs),
        errorCount,
        softLimitPct: config.apiBudgets.softLimitPct,
        hardLimitPct: config.apiBudgets.hardLimitPct,
        quotaStatus,
        quotaSource: "INTERNAL",
      },
      create: {
        date,
        service,
        totalCalls,
        totalCredits,
        budgetTotal,
        budgetUsedPercent,
        monthlyCreditsUsed,
        monthlyCreditsRemaining,
        dailyBudget,
        dailyCreditsRemaining,
        essentialCalls,
        essentialCredits,
        nonEssentialCredits,
        cachedCalls,
        avgCreditsPerCall,
        peakRps,
        avgLatencyMs: Math.round(avgLatencyMs),
        errorCount,
        softLimitPct: config.apiBudgets.softLimitPct,
        hardLimitPct: config.apiBudgets.hardLimitPct,
        quotaStatus,
        quotaSource: "INTERNAL",
      },
    });

    await db.apiEndpointDaily.deleteMany({
      where: { date, service },
    });

    const endpointRows = dailyCalls.reduce((acc, call) => {
      const dimensionKey = [
        call.endpoint,
        call.strategy ?? "ALL",
        call.mode ?? "ALL",
        call.configProfile ?? "ALL",
        call.purpose,
        call.essential ? "1" : "0",
      ].join("|");

      const entry = acc.get(dimensionKey) ?? {
        endpoint: call.endpoint,
        strategy: call.strategy,
        mode: call.mode,
        configProfile: call.configProfile,
        purpose: call.purpose,
        essential: call.essential,
        totalCalls: 0,
        totalCredits: 0,
        cachedCalls: 0,
        errorCount: 0,
        latencyTotal: 0,
        latencyCount: 0,
        batchTotal: 0,
        batchCount: 0,
      };

      entry.totalCalls += 1;
      entry.totalCredits += call.credits;
      if (call.cacheHit) entry.cachedCalls += 1;
      if ((call.statusCode ?? 0) >= 400) entry.errorCount += 1;
      if (call.latencyMs && call.latencyMs > 0) {
        entry.latencyTotal += call.latencyMs;
        entry.latencyCount += 1;
      }
      if (call.batchSize && call.batchSize > 0) {
        entry.batchTotal += call.batchSize;
        entry.batchCount += 1;
      }

      acc.set(dimensionKey, entry);
      return acc;
    }, new Map<string, {
      endpoint: string;
      strategy: Strategy | null;
      mode: TradeMode | null;
      configProfile: string | null;
      purpose: typeof dailyCalls[number]["purpose"];
      essential: boolean;
      totalCalls: number;
      totalCredits: number;
      cachedCalls: number;
      errorCount: number;
      latencyTotal: number;
      latencyCount: number;
      batchTotal: number;
      batchCount: number;
    }>());

    if (endpointRows.size > 0) {
      await db.apiEndpointDaily.createMany({
        data: [...endpointRows.entries()].map(([dimensionKey, entry]) => ({
          date,
          service,
          endpoint: entry.endpoint,
          dimensionKey,
          strategy: entry.strategy,
          mode: entry.mode,
          configProfile: entry.configProfile,
          purpose: entry.purpose,
          essential: entry.essential,
          totalCalls: entry.totalCalls,
          totalCredits: entry.totalCredits,
          cachedCalls: entry.cachedCalls,
          avgCreditsPerCall: entry.totalCalls > 0 ? entry.totalCredits / entry.totalCalls : 0,
          avgLatencyMs: entry.latencyCount > 0 ? Math.round(entry.latencyTotal / entry.latencyCount) : 0,
          errorCount: entry.errorCount,
          avgBatchSize: entry.batchCount > 0 ? entry.batchTotal / entry.batchCount : 0,
        })),
      });
    }
  }
}

function averageOf(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function computePeakRps(timestamps: Date[]): number {
  if (timestamps.length === 0) return 0;
  const buckets = new Map<number, number>();
  for (const timestamp of timestamps) {
    const second = Math.floor(timestamp.getTime() / 1000);
    buckets.set(second, (buckets.get(second) ?? 0) + 1);
  }
  return Math.max(...buckets.values());
}

parentPort?.on("message", async (task: StatsTask) => {
  try {
    const date = task.date ? new Date(task.date) : new Date();
    await aggregateDailyStats(date);
    parentPort?.postMessage({ result: { success: true, date: date.toISOString().slice(0, 10) } satisfies StatsResult });
  } catch (err) {
    parentPort?.postMessage({ error: (err as Error).message });
  }
});

process.on("beforeExit", async () => {
  await db.$disconnect();
});
