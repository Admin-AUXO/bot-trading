import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { RuntimeState } from "../../core/runtime-state.js";

const STRATEGIES = ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"] as const;

function parseDays(value: unknown, fallback: number, max: number): number {
  return Math.min(Number(value) || fallback, max);
}

function numberOrZero(value: unknown): number {
  return Number(value ?? 0);
}

export function analyticsRouter(deps?: { runtimeState?: RuntimeState }) {
  const router = Router();
  const defaultScope = () => deps?.runtimeState?.scope;

  router.get("/daily", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 30, 90);
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = { date: { gte: since } };
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;

    const stats = await db.dailyStats.findMany({
      where,
      orderBy: { date: "asc" },
      take: 500,
    });

    res.json(stats.map((s) => ({
      ...s,
      grossPnlUsd: Number(s.grossPnlUsd),
      netPnlUsd: Number(s.netPnlUsd),
      winRate: Number(s.winRate),
      avgWinUsd: Number(s.avgWinUsd),
      avgLossUsd: Number(s.avgLossUsd),
      capitalEnd: Number(s.capitalEnd),
      maxDrawdownUsd: Number(s.maxDrawdownUsd),
    })));
  });

  router.get("/strategy", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 30, 90);
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const tradeSource = req.query.tradeSource as string | undefined;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      strategy: { in: STRATEGIES },
      side: "SELL",
      executedAt: { gte: since },
      ...(mode ? { mode: mode as "LIVE" | "DRY_RUN" } : {}),
      ...(profile ? { configProfile: profile } : {}),
      ...(tradeSource ? { tradeSource: tradeSource as "AUTO" | "MANUAL" } : {}),
    };

    const [exitStats, winStats, lossStats] = await Promise.all([
      db.trade.groupBy({
        by: ["strategy"],
        where,
        _count: { _all: true },
        _sum: { pnlUsd: true, gasFee: true, jitoTip: true },
      }),
      db.trade.groupBy({
        by: ["strategy"],
        where: { ...where, pnlUsd: { gt: 0 } },
        _count: { _all: true },
        _sum: { pnlUsd: true },
      }),
      db.trade.groupBy({
        by: ["strategy"],
        where: { ...where, pnlUsd: { lte: 0 } },
        _count: { _all: true },
        _sum: { pnlUsd: true },
      }),
    ]);

    const exitStatsByStrategy = new Map(exitStats.map((row) => [row.strategy, row]));
    const winStatsByStrategy = new Map(winStats.map((row) => [row.strategy, row]));
    const lossStatsByStrategy = new Map(lossStats.map((row) => [row.strategy, row]));

    res.json(STRATEGIES.map((strategy) => {
      const exits = exitStatsByStrategy.get(strategy);
      const wins = winStatsByStrategy.get(strategy);
      const losses = lossStatsByStrategy.get(strategy);
      const totalExits = exits?._count._all ?? 0;
      const winCount = wins?._count._all ?? 0;
      const lossCount = losses?._count._all ?? 0;

      return {
        strategy,
        totalExits,
        wins: winCount,
        losses: lossCount,
        winRate: totalExits > 0 ? winCount / totalExits : 0,
        totalPnlUsd: numberOrZero(exits?._sum.pnlUsd),
        avgWinUsd: winCount > 0 ? numberOrZero(wins?._sum.pnlUsd) / winCount : 0,
        avgLossUsd: lossCount > 0 ? Math.abs(numberOrZero(losses?._sum.pnlUsd)) / lossCount : 0,
        totalFeesSol: numberOrZero(exits?._sum.gasFee) + numberOrZero(exits?._sum.jitoTip),
      };
    }));
  });

  router.get("/capital-curve", cacheMiddleware(60_000), async (req, res) => {
    const days = parseDays(req.query.days, 30, 365);
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = {
      strategy: null,
      date: { gte: since },
    };
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;

    const stats = await db.dailyStats.findMany({
      where,
      orderBy: { date: "asc" },
      select: { date: true, capitalEnd: true, netPnlUsd: true },
      take: 365,
    });

    let cumulative = 0;
    const curve = stats.map((s) => {
      cumulative += Number(s.netPnlUsd);
      return {
        date: s.date,
        capital: Number(s.capitalEnd),
        dailyPnl: Number(s.netPnlUsd),
        cumulativePnl: cumulative,
      };
    });

    res.json(curve);
  });

  router.get("/regime-history", cacheMiddleware(30_000), async (_req, res) => {
    const snapshots = await db.regimeSnapshot.findMany({
      orderBy: { snappedAt: "desc" },
      take: 288,
    });

    res.json(snapshots.map((s) => ({
      ...s,
      solPrice: Number(s.solPrice),
      solChange5m: Number(s.solChange5m),
      solChange1h: Number(s.solChange1h),
      rollingWinRate: Number(s.rollingWinRate),
    })));
  });

  router.get("/would-have-won", cacheMiddleware(60_000), async (req, res) => {
    const days = parseDays(req.query.days, 7, 30);
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rejected = await db.signal.findMany({
      where: {
        passed: false,
        detectedAt: { gte: since },
        wouldHaveWon: { not: null },
        ...(mode ? { mode: mode as "LIVE" | "DRY_RUN" } : {}),
        ...(profile ? { configProfile: profile } : {}),
      },
      orderBy: { detectedAt: "desc" },
      take: 100,
      select: {
        id: true,
        strategy: true,
        tokenSymbol: true,
        tokenAddress: true,
        rejectReason: true,
        wouldHaveWon: true,
        priceAtSignal: true,
        priceAfter5m: true,
        priceAfter15m: true,
        priceAfter1h: true,
        detectedAt: true,
      },
    });

    const total = rejected.length;
    const wouldWon = rejected.filter((s) => s.wouldHaveWon === true).length;

    res.json({
      total,
      wouldHaveWon: wouldWon,
      wouldHaveWonRate: total > 0 ? wouldWon / total : 0,
      signals: rejected.map((s) => ({
        ...s,
        priceAtSignal: s.priceAtSignal ? Number(s.priceAtSignal) : null,
        priceAfter5m: s.priceAfter5m ? Number(s.priceAfter5m) : null,
        priceAfter15m: s.priceAfter15m ? Number(s.priceAfter15m) : null,
        priceAfter1h: s.priceAfter1h ? Number(s.priceAfter1h) : null,
      })),
    });
  });

  router.get("/wallet-activity", cacheMiddleware(30_000), async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const activity = await db.walletActivity.findMany({
      orderBy: { detectedAt: "desc" },
      take: limit,
    });

    res.json(activity.map((a) => ({
      ...a,
      amountSol: Number(a.amountSol),
      amountToken: a.amountToken ? Number(a.amountToken) : null,
      priceAtTrade: a.priceAtTrade ? Number(a.priceAtTrade) : null,
      priceAfter1m: a.priceAfter1m ? Number(a.priceAfter1m) : null,
      priceAfter5m: a.priceAfter5m ? Number(a.priceAfter5m) : null,
      priceAfter15m: a.priceAfter15m ? Number(a.priceAfter15m) : null,
      priceAfter1h: a.priceAfter1h ? Number(a.priceAfter1h) : null,
      peakPriceAfter: a.peakPriceAfter ? Number(a.peakPriceAfter) : null,
    })));
  });

  router.get("/graduation-stats", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 30, 90);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const events = await db.graduationEvent.findMany({
      where: { graduatedAt: { gte: since } },
    });

    const byPlatform: Record<string, { total: number; traded: number; rugged: number }> = {};
    for (const e of events) {
      const p = e.platform || "unknown";
      if (!byPlatform[p]) byPlatform[p] = { total: 0, traded: 0, rugged: 0 };
      byPlatform[p].total++;
      if (e.wasTraded) byPlatform[p].traded++;
      if (e.rugDetected) byPlatform[p].rugged++;
    }

    res.json({
      totalEvents: events.length,
      byPlatform,
    });
  });

  router.get("/pnl-distribution", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 30, 90);
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const tradeSource = req.query.tradeSource as string | undefined;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = {
      side: "SELL",
      executedAt: { gte: since },
    };
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;
    if (tradeSource) where.tradeSource = tradeSource;

    const sells = await db.trade.findMany({
      where,
      select: {
        pnlUsd: true,
        pnlPercent: true,
        strategy: true,
        exitReason: true,
      },
      orderBy: { executedAt: "asc" },
      take: 500,
    });

    res.json(sells.map((t) => ({
      pnlUsd: Number(t.pnlUsd ?? 0),
      pnlPercent: Number(t.pnlPercent ?? 0),
      strategy: t.strategy,
      exitReason: t.exitReason,
    })));
  });

  router.get("/execution-quality", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 14, 90);
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const tradeSource = req.query.tradeSource as string | undefined;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const tradeWhere = {
      executedAt: { gte: since },
      ...(mode ? { mode: mode as "LIVE" | "DRY_RUN" } : {}),
      ...(profile ? { configProfile: profile } : {}),
      ...(tradeSource ? { tradeSource: tradeSource as "AUTO" | "MANUAL" } : {}),
    };
    const positionWhere = {
      openedAt: { gte: since },
      ...(mode ? { mode: mode as "LIVE" | "DRY_RUN" } : {}),
      ...(profile ? { configProfile: profile } : {}),
      ...(tradeSource ? { tradeSource: tradeSource as "AUTO" | "MANUAL" } : {}),
    };
    const manualTradeCountsPromise = tradeSource === "AUTO"
      ? Promise.resolve([] as Array<{ strategy: (typeof STRATEGIES)[number]; _count: { _all: number } }>)
      : db.trade.groupBy({
          by: ["strategy"],
          where: { ...tradeWhere, tradeSource: "MANUAL" },
          _count: { _all: true },
        });

    const [
      tradeTotals,
      buyStats,
      sellStats,
      manualTradeCounts,
      autoCopyLeadStats,
      entryPositionStats,
      entryLatencyStats,
    ] = await Promise.all([
      db.trade.groupBy({
        by: ["strategy"],
        where: tradeWhere,
        _count: { _all: true },
        _sum: { gasFee: true, jitoTip: true },
      }),
      db.trade.groupBy({
        by: ["strategy"],
        where: { ...tradeWhere, side: "BUY" },
        _count: { _all: true },
        _sum: { slippageBps: true },
      }),
      db.trade.groupBy({
        by: ["strategy"],
        where: { ...tradeWhere, side: "SELL" },
        _count: { _all: true },
        _sum: { slippageBps: true },
      }),
      manualTradeCountsPromise,
      db.trade.groupBy({
        by: ["strategy"],
        where: { ...tradeWhere, tradeSource: "AUTO", copyLeadMs: { gt: 0 } },
        _avg: { copyLeadMs: true },
      }),
      db.position.groupBy({
        by: ["strategy"],
        where: positionWhere,
        _count: { _all: true },
        _sum: { entrySlippageBps: true },
      }),
      db.position.groupBy({
        by: ["strategy"],
        where: { ...positionWhere, entryLatencyMs: { gt: 0 } },
        _avg: { entryLatencyMs: true },
      }),
    ]);

    const tradeTotalsByStrategy = new Map(tradeTotals.map((row) => [row.strategy, row]));
    const buyStatsByStrategy = new Map(buyStats.map((row) => [row.strategy, row]));
    const sellStatsByStrategy = new Map(sellStats.map((row) => [row.strategy, row]));
    const manualCountsByStrategy = new Map(manualTradeCounts.map((row) => [row.strategy, row]));
    const autoCopyLeadByStrategy = new Map(autoCopyLeadStats.map((row) => [row.strategy, row]));
    const entryPositionsByStrategy = new Map(entryPositionStats.map((row) => [row.strategy, row]));
    const entryLatencyByStrategy = new Map(entryLatencyStats.map((row) => [row.strategy, row]));

    res.json(STRATEGIES.map((strategy) => {
      const totals = tradeTotalsByStrategy.get(strategy);
      const buys = buyStatsByStrategy.get(strategy);
      const sells = sellStatsByStrategy.get(strategy);
      const manualTrades = manualCountsByStrategy.get(strategy)?._count._all ?? 0;
      const entryPositions = entryPositionsByStrategy.get(strategy);
      const totalTrades = totals?._count._all ?? 0;
      const buyCount = buys?._count._all ?? 0;
      const positionCount = entryPositions?._count._all ?? 0;
      const entrySlippageDenominator = buyCount + positionCount;
      const manualShare = tradeSource === "AUTO"
        ? 0
        : tradeSource === "MANUAL"
          ? (totalTrades > 0 ? 1 : 0)
          : totalTrades > 0
            ? manualTrades / totalTrades
            : 0;

      return {
        strategy,
        buyCount,
        sellCount: sells?._count._all ?? 0,
        avgEntrySlippageBps: entrySlippageDenominator > 0
          ? (numberOrZero(entryPositions?._sum.entrySlippageBps) + numberOrZero(buys?._sum.slippageBps)) / entrySlippageDenominator
          : 0,
        avgExitSlippageBps: (sells?._count._all ?? 0) > 0
          ? numberOrZero(sells?._sum.slippageBps) / (sells?._count._all ?? 1)
          : 0,
        avgFeeSol: totalTrades > 0
          ? (numberOrZero(totals?._sum.gasFee) + numberOrZero(totals?._sum.jitoTip)) / totalTrades
          : 0,
        avgEntryLatencyMs: numberOrZero(entryLatencyByStrategy.get(strategy)?._avg.entryLatencyMs),
        avgCopyLeadMs: numberOrZero(autoCopyLeadByStrategy.get(strategy)?._avg.copyLeadMs),
        manualShare,
      };
    }));
  });

  return router;
}
