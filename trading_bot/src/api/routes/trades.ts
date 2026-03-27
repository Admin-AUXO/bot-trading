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

    const where: Record<string, unknown> = {};
    if (strategy) where.strategy = strategy;
    if (side) where.side = side;
    if (mode) where.mode = mode;
    if (profile) where.configProfile = profile;

    const [trades, total] = await Promise.all([
      db.trade.findMany({
        where,
        omit: { metadata: true },
        orderBy: { executedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.trade.count({ where }),
    ]);

    res.json({
      data: trades.map((t) => ({
        ...t,
        amountSol: Number(t.amountSol),
        amountToken: Number(t.amountToken),
        priceUsd: Number(t.priceUsd),
        priceSol: Number(t.priceSol),
        pnlUsd: Number(t.pnlUsd ?? 0),
        pnlPercent: Number(t.pnlPercent ?? 0),
        gasFee: Number(t.gasFee),
        jitoTip: Number(t.jitoTip),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  });

  router.get("/signals", cacheMiddleware(30_000), async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const strategy = req.query.strategy as string | undefined;

    const where: Record<string, unknown> = {};
    if (strategy) where.strategy = strategy;

    const skipped = req.query.skipped === "true";
    if (skipped) {
      where.passed = false;
      where.rejectReason = "MAX_POSITIONS";
    }

    const [signals, total] = await Promise.all([
      db.signal.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.signal.count({ where }),
    ]);

    res.json({
      data: signals.map((s) => ({
        ...s,
        tokenLiquidity: s.tokenLiquidity ? Number(s.tokenLiquidity) : null,
        tokenMcap: s.tokenMcap ? Number(s.tokenMcap) : null,
        tokenVolume5m: s.tokenVolume5m ? Number(s.tokenVolume5m) : null,
        buyPressure: s.buyPressure ? Number(s.buyPressure) : null,
        priceAtSignal: s.priceAtSignal ? Number(s.priceAtSignal) : null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  });

  return router;
}
