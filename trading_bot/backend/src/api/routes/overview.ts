import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import type { ApiBudgetManager } from "../../core/api-budget-manager.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { RegimeDetector } from "../../core/regime-detector.js";

export function overviewRouter(deps: { riskManager: unknown; regimeDetector: unknown; apiBudgetManager?: ApiBudgetManager }) {
  const router = Router();
  const riskManager = deps.riskManager as RiskManager;
  const regimeDetector = deps.regimeDetector as RegimeDetector;
  const apiBudgetManager = deps.apiBudgetManager;

  router.get("/", cacheMiddleware(5_000), async (req, res) => {
    const snapshot = riskManager.getSnapshot();
    const regime = regimeDetector.getState();
    const requestedMode = req.query.mode as string | undefined;
    const requestedProfile = req.query.profile as string | undefined;
    if ((requestedMode && requestedMode !== snapshot.scope.mode) || (requestedProfile && requestedProfile !== snapshot.scope.configProfile)) {
      return res.status(400).json({ error: "overview is only available for the active execution scope", scope: snapshot.scope });
    }

    const laneWhere = {
      mode: snapshot.scope.mode,
      configProfile: snapshot.scope.configProfile,
    };

    const todayTrades = await db.trade.count({
      where: { executedAt: { gte: new Date(new Date().toISOString().slice(0, 10)) }, ...laneWhere },
    });

    const todaySells = await db.trade.findMany({
      where: {
        executedAt: { gte: new Date(new Date().toISOString().slice(0, 10)) },
        side: "SELL",
        ...laneWhere,
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
      mode: snapshot.scope.mode,
      configProfile: snapshot.scope.configProfile,
    });
  });

  router.get("/api-usage", cacheMiddleware(30_000), async (_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const usage = apiBudgetManager
      ? apiBudgetManager.getSnapshots()
      : await db.apiUsageDaily.findMany({
          where: { date: new Date(today) },
        });

    const monthStart = new Date(today.slice(0, 7) + "-01");
    const [monthlyUsage, topEndpoints] = await Promise.all([
      db.apiUsageDaily.groupBy({
        by: ["service"],
        where: { date: { gte: monthStart } },
        _sum: { totalCredits: true, totalCalls: true, errorCount: true },
      }),
      db.apiEndpointDaily.findMany({
        where: { date: new Date(today) },
        orderBy: [{ totalCredits: "desc" }, { totalCalls: "desc" }],
        take: 12,
      }),
    ]);

    res.json({
      current: apiBudgetManager?.getSnapshots() ?? null,
      daily: usage,
      monthly: monthlyUsage,
      topEndpoints: topEndpoints.map((entry) => ({
        ...entry,
        avgCreditsPerCall: Number(entry.avgCreditsPerCall),
        avgBatchSize: Number(entry.avgBatchSize),
      })),
    });
  });

  return router;
}
