import { Prisma } from "@prisma/client";
import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { RuntimeState } from "../../core/runtime-state.js";

export function tradesRouter(deps?: { runtimeState?: RuntimeState }) {
  const router = Router();
  const defaultScope = () => deps?.runtimeState?.scope;

  interface TradeSummaryRow {
    totalTrades: number;
    totalExits: number;
    wins: number;
    losses: number;
    netPnlUsd: unknown;
    totalGasFee: unknown;
    totalJitoTip: unknown;
    lastExecutedAt: Date | null;
  }

  router.get("/", cacheMiddleware(10_000), async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const strategy = req.query.strategy as string | undefined;
    const side = req.query.side as string | undefined;
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;
    const tradeSource = req.query.tradeSource as string | undefined;

    const tradeSide = side === "BUY" || side === "SELL" ? side : undefined;

    const where: Record<string, unknown> = {};
    if (strategy) where.strategy = strategy;
    if (tradeSide) where.side = tradeSide;
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;
    if (tradeSource) where.tradeSource = tradeSource;

    const summarySide = tradeSide && tradeSide !== "SELL" ? tradeSide : "SELL";

    const [trades, summaryRows] = await Promise.all([
      db.trade.findMany({
        where,
        omit: { metadata: true },
        orderBy: { executedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.$queryRaw<TradeSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "totalTrades",
          COUNT(*) FILTER (WHERE side = ${summarySide})::int AS "totalExits",
          COUNT(*) FILTER (WHERE side = ${summarySide} AND "pnlUsd" > 0)::int AS wins,
          COUNT(*) FILTER (WHERE side = ${summarySide} AND "pnlUsd" <= 0)::int AS losses,
          COALESCE(SUM("pnlUsd") FILTER (WHERE side = ${summarySide}), 0) AS "netPnlUsd",
          COALESCE(SUM("gasFee"), 0) AS "totalGasFee",
          COALESCE(SUM("jitoTip"), 0) AS "totalJitoTip",
          MAX("executedAt") AS "lastExecutedAt"
        FROM "Trade"
        WHERE (${strategy ?? null}::text IS NULL OR strategy = ${strategy ?? null})
          AND (${tradeSide ?? null}::text IS NULL OR side = ${tradeSide ?? null})
          AND (${mode ?? null}::text IS NULL OR mode = ${mode ?? null})
          AND (${profile ?? null}::text IS NULL OR "configProfile" = ${profile ?? null})
          AND (${tradeSource ?? null}::text IS NULL OR "tradeSource" = ${tradeSource ?? null})
      `),
    ]);
    const summary = summaryRows[0];
    const total = Number(summary?.totalTrades ?? 0);
    const totalFeesSol = Number(summary?.totalGasFee ?? 0) + Number(summary?.totalJitoTip ?? 0);

    res.json({
      data: trades.map((trade) => ({
        ...trade,
        amountSol: Number(trade.amountSol),
        amountToken: Number(trade.amountToken),
        priceUsd: Number(trade.priceUsd),
        priceSol: Number(trade.priceSol),
        pnlUsd: Number(trade.pnlUsd ?? 0),
        pnlPercent: Number(trade.pnlPercent ?? 0),
        gasFee: Number(trade.gasFee),
        jitoTip: Number(trade.jitoTip),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalTrades: total,
        totalExits: Number(summary?.totalExits ?? 0),
        wins: Number(summary?.wins ?? 0),
        losses: Number(summary?.losses ?? 0),
        netPnlUsd: Number(summary?.netPnlUsd ?? 0),
        totalFeesSol,
        lastExecutedAt: summary?.lastExecutedAt ?? null,
      },
    });
  });

  router.get("/signals", cacheMiddleware(30_000), async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const strategy = req.query.strategy as string | undefined;
    const scope = defaultScope();
    const mode = (req.query.mode as string | undefined) ?? scope?.mode;
    const profile = (req.query.profile as string | undefined) ?? scope?.configProfile;

    const where: Record<string, unknown> = {};
    if (strategy) where.strategy = strategy;
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;

    const skipped = req.query.skipped === "true";
    if (skipped) {
      where.passed = false;
      where.rejectReason = "MAX_POSITIONS";
    }

    const [signals, total, passed, rejected, rejectReasonGroups, lastSignal] = await Promise.all([
      db.signal.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.signal.count({ where }),
      db.signal.count({ where: { ...where, passed: true } }),
      db.signal.count({ where: { ...where, passed: false } }),
      db.signal.groupBy({
        by: ["rejectReason"],
        where: { ...where, passed: false },
        _count: { rejectReason: true },
        orderBy: {
          _count: {
            rejectReason: "desc",
          },
        },
        take: 1,
      }),
      db.signal.findFirst({
        where,
        orderBy: { detectedAt: "desc" },
        select: { detectedAt: true },
      }),
    ]);

    const topReject = rejectReasonGroups[0];

    res.json({
      data: signals.map((signal) => ({
        ...signal,
        tokenLiquidity: signal.tokenLiquidity ? Number(signal.tokenLiquidity) : null,
        tokenMcap: signal.tokenMcap ? Number(signal.tokenMcap) : null,
        tokenVolume5m: signal.tokenVolume5m ? Number(signal.tokenVolume5m) : null,
        buyPressure: signal.buyPressure ? Number(signal.buyPressure) : null,
        priceAtSignal: signal.priceAtSignal ? Number(signal.priceAtSignal) : null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalSignals: total,
        passed,
        rejected,
        passRate: total > 0 ? passed / total : 0,
        topRejectReason: topReject?.rejectReason ?? null,
        topRejectCount: topReject?._count.rejectReason ?? 0,
        lastDetectedAt: lastSignal?.detectedAt ?? null,
      },
    });
  });

  return router;
}
