import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";

function parseDays(value: unknown, fallback: number, max: number): number {
  return Math.min(Number(value) || fallback, max);
}

export function analyticsRouter() {
  const router = Router();

  router.get("/daily", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 30, 90);
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;
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
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;
    const tradeSource = req.query.tradeSource as string | undefined;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = {
      strategy: { in: ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"] },
      side: "SELL",
      executedAt: { gte: since },
    };
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;
    if (tradeSource) where.tradeSource = tradeSource;

    const trades = await db.trade.findMany({
      where,
      select: { strategy: true, pnlUsd: true, gasFee: true, jitoTip: true },
    });

    const byStrategy = trades.reduce(
      (acc, t) => {
        (acc[t.strategy] ??= []).push(t);
        return acc;
      },
      {} as Record<string, typeof trades>
    );

    const results = [];
    for (const strategy of ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"]) {
      const sells = byStrategy[strategy] ?? [];
      const wins = sells.filter((t) => Number(t.pnlUsd ?? 0) > 0);
      const losses = sells.filter((t) => Number(t.pnlUsd ?? 0) <= 0);

      results.push({
        strategy,
        totalExits: sells.length,
        wins: wins.length,
        losses: losses.length,
        winRate: sells.length > 0 ? wins.length / sells.length : 0,
        totalPnlUsd: sells.reduce((s, t) => s + Number(t.pnlUsd ?? 0), 0),
        avgWinUsd: wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnlUsd ?? 0), 0) / wins.length : 0,
        avgLossUsd: losses.length > 0 ? losses.reduce((s, t) => s + Math.abs(Number(t.pnlUsd ?? 0)), 0) / losses.length : 0,
        totalFeesSol: sells.reduce((s, t) => s + Number(t.gasFee) + Number(t.jitoTip), 0),
      });
    }

    res.json(results);
  });

  router.get("/capital-curve", cacheMiddleware(60_000), async (req, res) => {
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;

    const where: Record<string, unknown> = { strategy: null };
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
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;
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
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;
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

  return router;
}
