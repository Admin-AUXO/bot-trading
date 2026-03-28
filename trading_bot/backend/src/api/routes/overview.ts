import { Router } from "express";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { getLaneTodaySummary } from "../lane-summary.js";
import type { ApiBudgetManager } from "../../core/api-budget-manager.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { RegimeDetector } from "../../core/regime-detector.js";

function parseDays(value: unknown, fallback: number, max: number): number {
  return Math.min(Number(value) || fallback, max);
}

function serializeUsageRow(row: {
  date: Date;
  service: string;
  budgetTotal: number;
  monthlyCreditsUsed: number;
  monthlyCreditsRemaining: number;
  dailyBudget: number;
  totalCredits: number;
  dailyCreditsRemaining: number;
  essentialCredits: number;
  nonEssentialCredits: number;
  cachedCalls: number;
  totalCalls: number;
  avgCreditsPerCall: unknown;
  softLimitPct: unknown;
  hardLimitPct: unknown;
  quotaStatus: string;
  quotaSource: string;
  providerCycleStart: Date | null;
  providerCycleEnd: Date | null;
  providerReportedUsed: number | null;
  providerReportedRemaining: number | null;
  providerReportedOverage: number | null;
  providerReportedOverageCost: unknown;
  pauseReason: string | null;
}) {
  return {
    service: row.service,
    date: row.date.toISOString().slice(0, 10),
    budgetTotal: row.budgetTotal,
    monthlyUsed: row.monthlyCreditsUsed,
    monthlyRemaining: row.monthlyCreditsRemaining,
    dailyBudget: row.dailyBudget,
    dailyUsed: row.totalCredits,
    dailyRemaining: row.dailyCreditsRemaining,
    essentialCredits: row.essentialCredits,
    nonEssentialCredits: row.nonEssentialCredits,
    cachedCalls: row.cachedCalls,
    totalCalls: row.totalCalls,
    avgCreditsPerCall: Number(row.avgCreditsPerCall),
    softLimitPct: Number(row.softLimitPct),
    hardLimitPct: Number(row.hardLimitPct),
    quotaStatus: row.quotaStatus,
    quotaSource: row.quotaSource,
    providerCycleStart: row.providerCycleStart,
    providerCycleEnd: row.providerCycleEnd,
    providerReportedUsed: row.providerReportedUsed,
    providerReportedRemaining: row.providerReportedRemaining,
    providerReportedOverage: row.providerReportedOverage,
    providerReportedOverageCost: row.providerReportedOverageCost == null ? null : Number(row.providerReportedOverageCost),
    pauseReason: row.pauseReason,
  };
}

export function overviewRouter(deps: { riskManager: unknown; regimeDetector: unknown; apiBudgetManager?: ApiBudgetManager; dbClient?: typeof db }) {
  const router = Router();
  const riskManager = deps.riskManager as RiskManager;
  const regimeDetector = deps.regimeDetector as RegimeDetector;
  const apiBudgetManager = deps.apiBudgetManager;
  const database = deps.dbClient ?? db;

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
    const summary = await getLaneTodaySummary(database, laneWhere);

    res.json({
      ...snapshot,
      regime,
      todayTrades: summary.todayTrades,
      todayPnl: summary.todayPnl,
      todayWins: summary.todayWins,
      todayLosses: summary.todayLosses,
      mode: snapshot.scope.mode,
      configProfile: snapshot.scope.configProfile,
    });
  });

  router.get("/api-usage", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 14, 90);
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date();
    since.setDate(since.getDate() - Math.max(0, days - 1));
    const currentUsage = apiBudgetManager?.getSnapshots() ?? null;
    const persistedUsage = currentUsage
      ? null
      : await database.apiUsageDaily.findMany({
          where: { date: new Date(today) },
        });

    const monthStart = new Date(today.slice(0, 7) + "-01");
    const [monthlyUsage, history, topEndpoints] = await Promise.all([
      database.apiUsageDaily.groupBy({
        by: ["service"],
        where: { date: { gte: monthStart } },
        _sum: { totalCredits: true, totalCalls: true, errorCount: true },
      }),
      database.apiUsageDaily.findMany({
        where: { date: { gte: since } },
        orderBy: [{ date: "asc" }, { service: "asc" }],
      }),
      database.apiEndpointDaily.groupBy({
        by: ["service", "endpoint", "strategy", "mode", "configProfile", "purpose", "essential"],
        where: { date: { gte: since } },
        _sum: {
          totalCalls: true,
          totalCredits: true,
          cachedCalls: true,
          errorCount: true,
        },
        _avg: {
          avgCreditsPerCall: true,
          avgLatencyMs: true,
          avgBatchSize: true,
        },
        orderBy: {
          _sum: {
            totalCredits: "desc",
          },
        },
        take: 20,
      }),
    ]);

    res.json({
      current: currentUsage,
      daily: currentUsage ?? persistedUsage?.map((row) => serializeUsageRow(row)) ?? [],
      monthly: monthlyUsage.map((entry) => ({
        service: entry.service,
        totalCredits: Number(entry._sum.totalCredits ?? 0),
        totalCalls: Number(entry._sum.totalCalls ?? 0),
        totalErrors: Number(entry._sum.errorCount ?? 0),
      })),
      history: history.map((row) => serializeUsageRow(row)),
      topEndpoints: topEndpoints.map((entry) => ({
        service: entry.service,
        endpoint: entry.endpoint,
        strategy: entry.strategy,
        mode: entry.mode,
        configProfile: entry.configProfile,
        purpose: entry.purpose,
        essential: entry.essential,
        totalCalls: Number(entry._sum.totalCalls ?? 0),
        totalCredits: Number(entry._sum.totalCredits ?? 0),
        cachedCalls: Number(entry._sum.cachedCalls ?? 0),
        errorCount: Number(entry._sum.errorCount ?? 0),
        avgCreditsPerCall: Number(entry._avg.avgCreditsPerCall ?? 0),
        avgLatencyMs: Number(entry._avg.avgLatencyMs ?? 0),
        avgBatchSize: Number(entry._avg.avgBatchSize ?? 0),
      })),
      windowDays: days,
    });
  });

  return router;
}
