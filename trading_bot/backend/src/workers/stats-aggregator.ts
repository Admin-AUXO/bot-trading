import { parentPort } from "node:worker_threads";
import { Prisma, type ApiCallPurpose, type Strategy, type TradeMode } from "@prisma/client";
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

interface SellAggregateRow {
  sell_count: number;
  wins_count: number;
  losses_count: number;
  gross_pnl: unknown;
  sell_gas: unknown;
  sell_tips: unknown;
  gross_wins: unknown;
  gross_losses: unknown;
  avg_win: unknown;
  avg_loss: unknown;
  tranche1_count: number;
  tranche2_count: number;
  tranche3_count: number;
}

interface BuyAggregateRow {
  buy_count: number;
  buy_gas: unknown;
  buy_tips: unknown;
}

interface HoldAggregateRow {
  avg_hold_minutes: unknown;
}

interface DailyApiUsageRow {
  total_calls: number;
  total_credits: number;
  essential_calls: number;
  essential_credits: number;
  cached_calls: number;
  avg_latency_ms: unknown;
  error_count: number;
  monthly_credits_used: number;
  peak_rps: number;
}

interface EndpointAggregateRow {
  endpoint: string;
  strategy: Strategy | null;
  mode: TradeMode | null;
  config_profile: string | null;
  purpose: ApiCallPurpose;
  essential: boolean;
  total_calls: number;
  total_credits: number;
  cached_calls: number;
  error_count: number;
  avg_credits_per_call: unknown;
  avg_latency_ms: unknown;
  avg_batch_size: unknown;
}

const EMPTY_SELL_STATS: SellAggregateRow = {
  sell_count: 0,
  wins_count: 0,
  losses_count: 0,
  gross_pnl: 0,
  sell_gas: 0,
  sell_tips: 0,
  gross_wins: 0,
  gross_losses: 0,
  avg_win: 0,
  avg_loss: 0,
  tranche1_count: 0,
  tranche2_count: 0,
  tranche3_count: 0,
};

const EMPTY_BUY_STATS: BuyAggregateRow = {
  buy_count: 0,
  buy_gas: 0,
  buy_tips: 0,
};

const EMPTY_HOLD_STATS: HoldAggregateRow = {
  avg_hold_minutes: 0,
};

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

function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value);
}

async function querySingleRow<T>(query: Prisma.Sql): Promise<T | undefined> {
  const rows = await db.$queryRaw<T[]>(query);
  return rows[0];
}

function strategyClause(strategy: Strategy | null): Prisma.Sql {
  return strategy ? Prisma.sql`AND strategy = ${strategy}` : Prisma.empty;
}

async function aggregateDailyStats(date: Date): Promise<void> {
  const dateStr = date.toISOString().slice(0, 10);
  const dayStart = new Date(dateStr);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const strategies = ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"] as const;
  const modes = ["LIVE", "DRY_RUN"] as const;

  const [profiles, activeProfiles] = await Promise.all([
    db.$queryRaw<Array<{ configProfile: string }>>(Prisma.sql`
      SELECT DISTINCT "configProfile"
      FROM "Trade"
      WHERE "executedAt" >= ${dayStart}
        AND "executedAt" < ${dayEnd}
      UNION
      SELECT DISTINCT "configProfile"
      FROM "Position"
      WHERE "closedAt" >= ${dayStart}
        AND "closedAt" < ${dayEnd}
    `),
    db.configProfile.findMany({
      where: { isActive: true },
      select: { name: true },
    }),
  ]);
  const profileNames = [...new Set([
    "default",
    ...activeProfiles.map((profile) => profile.name),
    ...profiles.map((profile) => profile.configProfile),
  ])];

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

  await Promise.all(slices.map((slice) => aggregateForSlice(slice)));
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
  const extraStrategy = strategyClause(strategy);

  const [sellStats = EMPTY_SELL_STATS, buyStats = EMPTY_BUY_STATS, holdStats = EMPTY_HOLD_STATS, previousStats, latestSnapshot] = await Promise.all([
    querySingleRow<SellAggregateRow>(Prisma.sql`
      SELECT
        COUNT(*)::int AS sell_count,
        COUNT(*) FILTER (WHERE "pnlUsd" > 0)::int AS wins_count,
        COUNT(*) FILTER (WHERE "pnlUsd" <= 0)::int AS losses_count,
        COALESCE(SUM("pnlUsd"), 0) AS gross_pnl,
        COALESCE(SUM("gasFee"), 0) AS sell_gas,
        COALESCE(SUM("jitoTip"), 0) AS sell_tips,
        COALESCE(SUM("pnlUsd") FILTER (WHERE "pnlUsd" > 0), 0) AS gross_wins,
        COALESCE(SUM(ABS("pnlUsd")) FILTER (WHERE "pnlUsd" <= 0), 0) AS gross_losses,
        COALESCE(AVG("pnlUsd") FILTER (WHERE "pnlUsd" > 0), 0) AS avg_win,
        COALESCE(AVG(ABS("pnlUsd")) FILTER (WHERE "pnlUsd" <= 0), 0) AS avg_loss,
        COUNT(*) FILTER (WHERE "trancheNumber" = 1)::int AS tranche1_count,
        COUNT(*) FILTER (WHERE "trancheNumber" = 2)::int AS tranche2_count,
        COUNT(*) FILTER (WHERE "trancheNumber" = 3)::int AS tranche3_count
      FROM "Trade"
      WHERE side = 'SELL'
        AND "executedAt" >= ${dayStart}
        AND "executedAt" < ${dayEnd}
        AND mode = ${mode}
        AND "configProfile" = ${configProfile}
        ${extraStrategy}
    `),
    querySingleRow<BuyAggregateRow>(Prisma.sql`
      SELECT
        COUNT(*)::int AS buy_count,
        COALESCE(SUM("gasFee"), 0) AS buy_gas,
        COALESCE(SUM("jitoTip"), 0) AS buy_tips
      FROM "Trade"
      WHERE side = 'BUY'
        AND "executedAt" >= ${dayStart}
        AND "executedAt" < ${dayEnd}
        AND mode = ${mode}
        AND "configProfile" = ${configProfile}
        ${extraStrategy}
    `),
    querySingleRow<HoldAggregateRow>(Prisma.sql`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM ("closedAt" - "openedAt")) / 60.0), 0) AS avg_hold_minutes
      FROM "Position"
      WHERE "closedAt" >= ${dayStart}
        AND "closedAt" < ${dayEnd}
        AND mode = ${mode}
        AND "configProfile" = ${configProfile}
        ${extraStrategy}
    `),
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
    db.regimeSnapshot.findFirst({
      where: { snappedAt: { lt: dayEnd } },
      orderBy: { snappedAt: "desc" },
      select: { regime: true },
    }),
  ]);

  const sellCount = Number(sellStats.sell_count ?? 0);
  const buyCount = Number(buyStats.buy_count ?? 0);
  const totalTrades = sellCount + buyCount;
  const grossPnl = toNumber(sellStats.gross_pnl);
  const totalGas = toNumber(sellStats.sell_gas) + toNumber(buyStats.buy_gas);
  const totalTips = toNumber(sellStats.sell_tips) + toNumber(buyStats.buy_tips);
  const netPnl = grossPnl - totalGas - totalTips;
  const grossWins = toNumber(sellStats.gross_wins);
  const grossLosses = toNumber(sellStats.gross_losses);
  const profitFactor = grossLosses === 0 ? (grossWins > 0 ? 9999 : 0) : grossWins / grossLosses;
  const winRate = sellCount > 0 ? Number(sellStats.wins_count ?? 0) / sellCount : 0;
  const lossRate = 1 - winRate;
  const avgWinUsd = toNumber(sellStats.avg_win);
  const avgLossUsd = toNumber(sellStats.avg_loss);
  const expectancy = winRate * avgWinUsd - lossRate * avgLossUsd;

  const { capitalStart, capitalEnd } = carryForwardCapital(
    previousStats ? Number(previousStats.capitalEnd) : null,
    netPnl,
  );

  const data = {
    tradesTotal: totalTrades,
    tradesWon: Number(sellStats.wins_count ?? 0),
    tradesLost: Number(sellStats.losses_count ?? 0),
    winRate,
    grossPnlUsd: grossPnl,
    netPnlUsd: netPnl,
    totalGasFees: totalGas,
    totalJitoTips: totalTips,
    avgWinUsd,
    avgLossUsd,
    profitFactor,
    expectancy,
    avgHoldMinutes: toNumber(holdStats.avg_hold_minutes),
    trancheT1Pct: sellCount > 0 ? Number(sellStats.tranche1_count ?? 0) / sellCount : 0,
    trancheT2Pct: sellCount > 0 ? Number(sellStats.tranche2_count ?? 0) / sellCount : 0,
    trancheT3Pct: sellCount > 0 ? Number(sellStats.tranche3_count ?? 0) / sellCount : 0,
    capitalStart,
    capitalEnd,
    regime: latestSnapshot?.regime ?? "NORMAL",
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
    const [summary, endpointRows] = await Promise.all([
      querySingleRow<DailyApiUsageRow>(Prisma.sql`
        WITH daily AS (
          SELECT
            COUNT(*)::int AS total_calls,
            COALESCE(SUM(credits), 0)::int AS total_credits,
            COUNT(*) FILTER (WHERE essential)::int AS essential_calls,
            COALESCE(SUM(credits) FILTER (WHERE essential), 0)::int AS essential_credits,
            COUNT(*) FILTER (WHERE "cacheHit")::int AS cached_calls,
            COALESCE(AVG("latencyMs") FILTER (WHERE "latencyMs" > 0), 0) AS avg_latency_ms,
            COUNT(*) FILTER (WHERE COALESCE("statusCode", 0) >= 400)::int AS error_count
          FROM "ApiCall"
          WHERE service = ${service}
            AND "calledAt" >= ${date}
            AND "calledAt" < ${dayEnd}
        ),
        monthly AS (
          SELECT COALESCE(SUM(credits), 0)::int AS monthly_credits_used
          FROM "ApiCall"
          WHERE service = ${service}
            AND "calledAt" >= ${monthStart}
            AND "calledAt" < ${dayEnd}
        ),
        peak AS (
          SELECT COALESCE(MAX(calls_per_second), 0)::int AS peak_rps
          FROM (
            SELECT COUNT(*)::int AS calls_per_second
            FROM "ApiCall"
            WHERE service = ${service}
              AND "calledAt" >= ${date}
              AND "calledAt" < ${dayEnd}
            GROUP BY date_trunc('second', "calledAt")
          ) bucketed
        )
        SELECT
          daily.total_calls,
          daily.total_credits,
          daily.essential_calls,
          daily.essential_credits,
          daily.cached_calls,
          daily.avg_latency_ms,
          daily.error_count,
          monthly.monthly_credits_used,
          peak.peak_rps
        FROM daily, monthly, peak
      `),
      db.$queryRaw<EndpointAggregateRow[]>(Prisma.sql`
        SELECT
          endpoint,
          strategy,
          mode,
          "configProfile" AS config_profile,
          purpose,
          essential,
          COUNT(*)::int AS total_calls,
          COALESCE(SUM(credits), 0)::int AS total_credits,
          COUNT(*) FILTER (WHERE "cacheHit")::int AS cached_calls,
          COUNT(*) FILTER (WHERE COALESCE("statusCode", 0) >= 400)::int AS error_count,
          COALESCE(AVG(credits), 0) AS avg_credits_per_call,
          COALESCE(AVG("latencyMs") FILTER (WHERE "latencyMs" > 0), 0) AS avg_latency_ms,
          COALESCE(AVG("batchSize") FILTER (WHERE "batchSize" > 0), 0) AS avg_batch_size
        FROM "ApiCall"
        WHERE service = ${service}
          AND "calledAt" >= ${date}
          AND "calledAt" < ${dayEnd}
        GROUP BY endpoint, strategy, mode, "configProfile", purpose, essential
        ORDER BY total_credits DESC, total_calls DESC
      `),
    ]);

    const totalCalls = Number(summary?.total_calls ?? 0);
    const totalCredits = Number(summary?.total_credits ?? 0);
    const essentialCalls = Number(summary?.essential_calls ?? 0);
    const essentialCredits = Number(summary?.essential_credits ?? 0);
    const nonEssentialCredits = Math.max(0, totalCredits - essentialCredits);
    const cachedCalls = Number(summary?.cached_calls ?? 0);
    const avgLatencyMs = Math.round(toNumber(summary?.avg_latency_ms));
    const errorCount = Number(summary?.error_count ?? 0);
    const avgCreditsPerCall = totalCalls > 0 ? totalCredits / totalCalls : 0;
    const peakRps = Number(summary?.peak_rps ?? 0);
    const budgetTotal = service === "HELIUS" ? config.apiBudgets.helius.monthly : config.apiBudgets.birdeye.monthly;
    const monthlyCreditsUsed = Number(summary?.monthly_credits_used ?? 0);
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
        avgLatencyMs,
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
        avgLatencyMs,
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

    if (endpointRows.length > 0) {
      await db.apiEndpointDaily.createMany({
        data: endpointRows.map((row) => ({
          date,
          service,
          endpoint: row.endpoint,
          dimensionKey: [
            row.endpoint,
            row.strategy ?? "ALL",
            row.mode ?? "ALL",
            row.config_profile ?? "ALL",
            row.purpose,
            row.essential ? "1" : "0",
          ].join("|"),
          strategy: row.strategy,
          mode: row.mode,
          configProfile: row.config_profile,
          purpose: row.purpose,
          essential: row.essential,
          totalCalls: Number(row.total_calls ?? 0),
          totalCredits: Number(row.total_credits ?? 0),
          cachedCalls: Number(row.cached_calls ?? 0),
          avgCreditsPerCall: toNumber(row.avg_credits_per_call),
          avgLatencyMs: Math.round(toNumber(row.avg_latency_ms)),
          errorCount: Number(row.error_count ?? 0),
          avgBatchSize: toNumber(row.avg_batch_size),
        })),
      });
    }
  }
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
