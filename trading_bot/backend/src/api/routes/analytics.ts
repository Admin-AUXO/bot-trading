import { Router } from "express";
import { Prisma, type Strategy } from "@prisma/client";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { RuntimeState } from "../../core/runtime-state.js";

const STRATEGIES: Strategy[] = ["S1_COPY", "S2_GRADUATION", "S3_MOMENTUM"];

function parseDays(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

function numberOrZero(value: unknown): number {
  return Number(value ?? 0);
}

function laneSqlFilters(options: {
  mode?: string;
  profile?: string;
  tradeSource?: string;
}): Prisma.Sql {
  const { mode, profile, tradeSource } = options;
  return Prisma.sql`
    ${mode ? Prisma.sql`AND "mode" = ${mode}` : Prisma.empty}
    ${profile ? Prisma.sql`AND "configProfile" = ${profile}` : Prisma.empty}
    ${tradeSource ? Prisma.sql`AND "tradeSource" = ${tradeSource}` : Prisma.empty}
  `;
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

    type StrategySummaryRow = {
      strategy: Strategy;
      totalExits: bigint | number;
      wins: bigint | number;
      losses: bigint | number;
      totalPnlUsd: unknown;
      winningPnlUsd: unknown;
      losingPnlUsd: unknown;
      totalGasFee: unknown;
      totalJitoTip: unknown;
    };

    const rows = await db.$queryRaw<StrategySummaryRow[]>(Prisma.sql`
      SELECT
        "strategy",
        COUNT(*)::bigint AS "totalExits",
        COUNT(*) FILTER (WHERE "pnlUsd" > 0)::bigint AS wins,
        COUNT(*) FILTER (WHERE "pnlUsd" <= 0)::bigint AS losses,
        COALESCE(SUM("pnlUsd"), 0) AS "totalPnlUsd",
        COALESCE(SUM(CASE WHEN "pnlUsd" > 0 THEN "pnlUsd" ELSE 0 END), 0) AS "winningPnlUsd",
        COALESCE(SUM(CASE WHEN "pnlUsd" <= 0 THEN "pnlUsd" ELSE 0 END), 0) AS "losingPnlUsd",
        COALESCE(SUM("gasFee"), 0) AS "totalGasFee",
        COALESCE(SUM("jitoTip"), 0) AS "totalJitoTip"
      FROM "Trade"
      WHERE "strategy" IN (${Prisma.join(STRATEGIES)})
        AND "side" = 'SELL'
        AND "executedAt" >= ${since}
        ${laneSqlFilters({ mode, profile, tradeSource })}
      GROUP BY "strategy"
    `);

    const rowsByStrategy = new Map(rows.map((row) => [row.strategy, row]));

    res.json(STRATEGIES.map((strategy) => {
      const summary = rowsByStrategy.get(strategy);
      const totalExits = Number(summary?.totalExits ?? 0);
      const winCount = Number(summary?.wins ?? 0);
      const lossCount = Number(summary?.losses ?? 0);

      return {
        strategy,
        totalExits,
        wins: winCount,
        losses: lossCount,
        winRate: totalExits > 0 ? winCount / totalExits : 0,
        totalPnlUsd: numberOrZero(summary?.totalPnlUsd),
        avgWinUsd: winCount > 0 ? numberOrZero(summary?.winningPnlUsd) / winCount : 0,
        avgLossUsd: lossCount > 0 ? Math.abs(numberOrZero(summary?.losingPnlUsd)) / lossCount : 0,
        totalFeesSol: numberOrZero(summary?.totalGasFee) + numberOrZero(summary?.totalJitoTip),
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

    type ExecutionTradeRow = {
      strategy: Strategy;
      totalTrades: bigint | number;
      buyCount: bigint | number;
      sellCount: bigint | number;
      totalGasFee: unknown;
      totalJitoTip: unknown;
      buySlippageBpsTotal: unknown;
      sellSlippageBpsTotal: unknown;
      manualTrades: bigint | number;
      avgCopyLeadMs: unknown;
    };
    type ExecutionPositionRow = {
      strategy: Strategy;
      positionCount: bigint | number;
      entrySlippageBpsTotal: unknown;
      avgEntryLatencyMs: unknown;
    };

    const [tradeRows, positionRows] = await Promise.all([
      db.$queryRaw<ExecutionTradeRow[]>(Prisma.sql`
        SELECT
          "strategy",
          COUNT(*)::bigint AS "totalTrades",
          COUNT(*) FILTER (WHERE "side" = 'BUY')::bigint AS "buyCount",
          COUNT(*) FILTER (WHERE "side" = 'SELL')::bigint AS "sellCount",
          COALESCE(SUM("gasFee"), 0) AS "totalGasFee",
          COALESCE(SUM("jitoTip"), 0) AS "totalJitoTip",
          COALESCE(SUM(CASE WHEN "side" = 'BUY' THEN "slippageBps" ELSE 0 END), 0) AS "buySlippageBpsTotal",
          COALESCE(SUM(CASE WHEN "side" = 'SELL' THEN "slippageBps" ELSE 0 END), 0) AS "sellSlippageBpsTotal",
          COUNT(*) FILTER (WHERE "tradeSource" = 'MANUAL')::bigint AS "manualTrades",
          AVG(CASE WHEN "tradeSource" = 'AUTO' AND "copyLeadMs" > 0 THEN "copyLeadMs" END) AS "avgCopyLeadMs"
        FROM "Trade"
        WHERE "executedAt" >= ${since}
          ${laneSqlFilters({ mode, profile, tradeSource })}
        GROUP BY "strategy"
      `),
      db.$queryRaw<ExecutionPositionRow[]>(Prisma.sql`
        SELECT
          "strategy",
          COUNT(*)::bigint AS "positionCount",
          COALESCE(SUM("entrySlippageBps"), 0) AS "entrySlippageBpsTotal",
          AVG(CASE WHEN "entryLatencyMs" > 0 THEN "entryLatencyMs" END) AS "avgEntryLatencyMs"
        FROM "Position"
        WHERE "openedAt" >= ${since}
          ${laneSqlFilters({ mode, profile, tradeSource })}
        GROUP BY "strategy"
      `),
    ]);

    const tradeRowsByStrategy = new Map(tradeRows.map((row) => [row.strategy, row]));
    const positionRowsByStrategy = new Map(positionRows.map((row) => [row.strategy, row]));

    res.json(STRATEGIES.map((strategy) => {
      const trades = tradeRowsByStrategy.get(strategy);
      const positions = positionRowsByStrategy.get(strategy);
      const totalTrades = Number(trades?.totalTrades ?? 0);
      const buyCount = Number(trades?.buyCount ?? 0);
      const sellCount = Number(trades?.sellCount ?? 0);
      const manualTrades = Number(trades?.manualTrades ?? 0);
      const positionCount = Number(positions?.positionCount ?? 0);
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
        sellCount,
        avgEntrySlippageBps: entrySlippageDenominator > 0
          ? (numberOrZero(positions?.entrySlippageBpsTotal) + numberOrZero(trades?.buySlippageBpsTotal)) / entrySlippageDenominator
          : 0,
        avgExitSlippageBps: sellCount > 0
          ? numberOrZero(trades?.sellSlippageBpsTotal) / sellCount
          : 0,
        avgFeeSol: totalTrades > 0
          ? (numberOrZero(trades?.totalGasFee) + numberOrZero(trades?.totalJitoTip)) / totalTrades
          : 0,
        avgEntryLatencyMs: numberOrZero(positions?.avgEntryLatencyMs),
        avgCopyLeadMs: numberOrZero(trades?.avgCopyLeadMs),
        manualShare,
      };
    }));
  });

  return router;
}
