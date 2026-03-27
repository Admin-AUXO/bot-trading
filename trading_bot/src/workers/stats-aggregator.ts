import { parentPort } from "node:worker_threads";
import { PrismaClient } from "@prisma/client";
import type { BotState, Strategy, TradeMode } from "@prisma/client";

const db = new PrismaClient();

interface StatsTask {
  date?: string;
}

interface StatsResult {
  success: boolean;
  date: string;
}

async function aggregateDailyStats(date: Date): Promise<void> {
  const dateStr = date.toISOString().slice(0, 10);
  const dayStart = new Date(dateStr);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const strategies = ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"] as const;
  const modes = ["LIVE", "DRY_RUN"] as const;

  const [profiles, botState] = await Promise.all([
    db.configProfile.findMany({ select: { name: true } }),
    db.botState.findUnique({ where: { id: "singleton" } }),
  ]);
  const profileNames = profiles.map((p) => p.name);

  const slices: Array<{
    dayStart: Date;
    dayEnd: Date;
    strategy: Strategy | null;
    mode: TradeMode;
    configProfile: string;
    botState: BotState | null;
  }> = [];

  for (const mode of modes) {
    for (const profileName of profileNames) {
      for (const strategy of [...strategies, null]) {
        slices.push({ dayStart, dayEnd, strategy, mode, configProfile: profileName, botState });
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
  botState: BotState | null;
}): Promise<void> {
  const { dayStart, dayEnd, strategy, mode, configProfile, botState } = params;

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

  const [sells, buys, closedPositions] = await Promise.all([
    db.trade.findMany({ where: tradeWhere, select: { pnlUsd: true, gasFee: true, jitoTip: true, trancheNumber: true } }),
    db.trade.findMany({ where: buyWhere, select: { gasFee: true, jitoTip: true } }),
    db.position.findMany({ where: positionWhere, select: { openedAt: true, closedAt: true } }),
  ]);

  const wins = sells.filter((t) => Number(t.pnlUsd ?? 0) > 0);
  const losses = sells.filter((t) => Number(t.pnlUsd ?? 0) <= 0);
  const totalTrades = sells.length + buys.length;

  if (totalTrades === 0) return;

  const grossPnl = sells.reduce((s, t) => s + Number(t.pnlUsd ?? 0), 0);
  const allTrades = [...sells, ...buys];
  const totalGas = allTrades.reduce((s, t) => s + Number(t.gasFee), 0);
  const totalTips = allTrades.reduce((s, t) => s + Number(t.jitoTip), 0);

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

  const data = {
    tradesTotal: totalTrades,
    tradesWon: wins.length,
    tradesLost: losses.length,
    winRate,
    grossPnlUsd: grossPnl,
    netPnlUsd: grossPnl - totalGas - totalTips,
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
    capitalEnd: Number(botState?.capitalUsd ?? 200),
    regime: botState?.regime ?? "NORMAL",
  };

  await db.dailyStats.upsert({
    where: {
      date_strategy_mode_configProfile: {
        date: dayStart,
        strategy: (strategy ?? "ALL") as Strategy,
        mode,
        configProfile,
      },
    },
    update: data,
    create: {
      date: dayStart,
      strategy: strategy ?? null,
      mode,
      configProfile,
      capitalStart: Number(botState?.capitalUsd ?? 200),
      ...data,
    },
  });
}

async function aggregateApiUsage(date: Date): Promise<void> {
  const dayEnd = new Date(date.getTime() + 86_400_000);

  for (const service of ["HELIUS", "BIRDEYE"] as const) {
    const calls = await db.apiCall.aggregate({
      where: {
        service,
        calledAt: { gte: date, lt: dayEnd },
      },
      _count: true,
      _sum: { credits: true },
      _avg: { latencyMs: true },
    });

    const errors = await db.apiCall.count({
      where: {
        service,
        calledAt: { gte: date, lt: dayEnd },
        statusCode: { gte: 400 },
      },
    });

    await db.apiUsageDaily.upsert({
      where: { date_service: { date, service } },
      update: {
        totalCalls: calls._count,
        totalCredits: calls._sum.credits ?? 0,
        avgLatencyMs: Math.round(calls._avg.latencyMs ?? 0),
        errorCount: errors,
        budgetTotal: service === "HELIUS" ? 10_000_000 : 1_500_000,
      },
      create: {
        date,
        service,
        totalCalls: calls._count,
        totalCredits: calls._sum.credits ?? 0,
        avgLatencyMs: Math.round(calls._avg.latencyMs ?? 0),
        errorCount: errors,
        budgetTotal: service === "HELIUS" ? 10_000_000 : 1_500_000,
      },
    });
  }
}

parentPort?.on("message", async (task: StatsTask) => {
  try {
    const date = task.date ? new Date(task.date) : new Date();
    await aggregateDailyStats(date);
    parentPort?.postMessage({ result: { success: true, date: date.toISOString().slice(0, 10) } });
  } catch (err) {
    parentPort?.postMessage({ error: (err as Error).message });
  }
});

process.on("beforeExit", async () => {
  await db.$disconnect();
});
