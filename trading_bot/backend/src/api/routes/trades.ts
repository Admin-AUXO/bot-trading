import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";

export function tradesRouter() {
  const router = Router();

  router.get("/", cacheMiddleware(10_000), async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const strategy = req.query.strategy as string | undefined;
    const side = req.query.side as string | undefined;
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;

    const tradeSide = side === "BUY" || side === "SELL" ? side : undefined;

    const where: Record<string, unknown> = {};
    if (strategy) where.strategy = strategy;
    if (tradeSide) where.side = tradeSide;
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;

    const exitsWhere: Record<string, unknown> = {
      ...where,
      side: tradeSide && tradeSide !== "SELL" ? tradeSide : "SELL",
    };

    const [trades, total, exitTotal, wins, losses, pnlAggregate, feeAggregate, lastTrade] = await Promise.all([
      db.trade.findMany({
        where,
        omit: { metadata: true },
        orderBy: { executedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.trade.count({ where }),
      db.trade.count({ where: exitsWhere }),
      db.trade.count({
        where: {
          ...exitsWhere,
          pnlUsd: { gt: 0 },
        },
      }),
      db.trade.count({
        where: {
          ...exitsWhere,
          pnlUsd: { lte: 0 },
        },
      }),
      db.trade.aggregate({
        where: exitsWhere,
        _sum: { pnlUsd: true },
      }),
      db.trade.aggregate({
        where,
        _sum: { gasFee: true, jitoTip: true },
      }),
      db.trade.findFirst({
        where,
        orderBy: { executedAt: "desc" },
        select: { executedAt: true },
      }),
    ]);

    const totalFeesSol = Number(feeAggregate._sum.gasFee ?? 0) + Number(feeAggregate._sum.jitoTip ?? 0);

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
        totalExits: exitTotal,
        wins,
        losses,
        netPnlUsd: Number(pnlAggregate._sum?.pnlUsd ?? 0),
        totalFeesSol,
        lastExecutedAt: lastTrade?.executedAt ?? null,
      },
    });
  });

  router.get("/signals", cacheMiddleware(30_000), async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const strategy = req.query.strategy as string | undefined;
    const mode = req.query.mode as string | undefined;
    const profile = req.query.profile as string | undefined;

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
