import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { RegimeDetector } from "../../core/regime-detector.js";

export function overviewRouter(deps: { riskManager: unknown; regimeDetector: unknown }) {
  const router = Router();
  const riskManager = deps.riskManager as RiskManager;
  const regimeDetector = deps.regimeDetector as RegimeDetector;

  router.get("/", cacheMiddleware(5_000), async (req, res) => {
    const mode = (req.query.mode as string) ?? undefined;
    const snapshot = riskManager.getSnapshot();
    const regime = regimeDetector.getState();

    const modeFilter: Record<string, unknown> = {};
    if (mode) modeFilter.mode = mode;

    const todayTrades = await db.trade.count({
      where: { executedAt: { gte: new Date(new Date().toISOString().slice(0, 10)) }, ...modeFilter },
    });

    const todaySells = await db.trade.findMany({
      where: {
        executedAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
        side: "SELL",
        ...modeFilter,
      },
      select: { pnlUsd: true },
    });

    const todayPnl = todaySells.reduce((sum, t) => sum + Number(t.pnlUsd ?? 0), 0);
    const todayWins = todaySells.filter((t) => Number(t.pnlUsd ?? 0) > 0).length;

    res.json({
      ...snapshot,
      regime,
      todayTrades,
      todayPnl,
      todayWins,
      todayLosses: todaySells.length - todayWins,
      mode: mode ?? "ALL",
    });
  });

  router.get("/api-usage", cacheMiddleware(30_000), async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const usage = await db.apiUsageDaily.findMany({
      where: { date: new Date(today) },
    });

    const monthStart = new Date(today.slice(0, 7) + "-01");
    const monthlyUsage = await db.apiUsageDaily.groupBy({
      by: ["service"],
      where: { date: { gte: monthStart } },
      _sum: { totalCredits: true, totalCalls: true, errorCount: true },
    });

    res.json({ daily: usage, monthly: monthlyUsage });
  });

  return router;
}
