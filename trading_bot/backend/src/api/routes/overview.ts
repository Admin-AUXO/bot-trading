import { Router } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../../db/client.js";
import { cacheMiddleware } from "../middleware/cache.js";
import { serializeOpenPosition } from "../serializers/position.js";
import { getLaneActivity } from "../lane-activity.js";
import { getLaneTodaySummary } from "../lane-summary.js";
import type { ApiBudgetManager } from "../../core/api-budget-manager.js";
import type { RiskManager } from "../../core/risk-manager.js";
import type { RegimeDetector } from "../../core/regime-detector.js";

function parseDays(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
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

function isSameDay(left: Date, right: Date): boolean {
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

type MonthlyUsageSummary = {
  service: string;
  totalCredits: number;
  totalCalls: number;
  totalErrors: number;
};

function summarizeMonthlyUsage(rows: Array<{
  date: Date;
  service: string;
  totalCredits: number;
  totalCalls: number;
  errorCount: number;
}>): MonthlyUsageSummary[] {
  const byService = new Map<string, MonthlyUsageSummary>();
  for (const row of rows) {
    const current = byService.get(row.service) ?? {
      service: row.service,
      totalCredits: 0,
      totalCalls: 0,
      totalErrors: 0,
    };
    current.totalCredits += row.totalCredits;
    current.totalCalls += row.totalCalls;
    current.totalErrors += row.errorCount;
    byService.set(row.service, current);
  }
  return [...byService.values()].sort((left, right) => right.totalCredits - left.totalCredits);
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
    const [summary, laneActivity] = await Promise.all([
      getLaneTodaySummary(database, laneWhere),
      getLaneActivity(database, laneWhere),
    ]);

    res.json({
      ...snapshot,
      openPositions: snapshot.openPositions.map((position) => serializeOpenPosition(position)),
      regime,
      lastTradeAt: laneActivity.lastTradeAt,
      lastSignalAt: laneActivity.lastSignalAt,
      todayTrades: summary.todayTrades,
      todayPnl: summary.todayPnl,
      todayWins: summary.todayWins,
      todayLosses: summary.todayLosses,
      mode: snapshot.scope.mode,
      configProfile: snapshot.scope.configProfile,
      quotaSnapshots: apiBudgetManager?.getSnapshots() ?? null,
    });
  });

  router.get("/api-usage", cacheMiddleware(30_000), async (req, res) => {
    const days = parseDays(req.query.days, 14, 90);
    const endpointMode = req.query.mode as string | undefined;
    const endpointProfile = req.query.profile as string | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date();
    since.setDate(since.getDate() - Math.max(0, days - 1));
    const currentUsage = apiBudgetManager?.getSnapshots() ?? null;
    const monthStart = new Date(today.slice(0, 7) + "-01");
    const fetchStart = since < monthStart ? since : monthStart;
    const todayDate = new Date(today);

    type TopEndpointRow = {
      service: string;
      endpoint: string;
      strategy: string | null;
      mode: string | null;
      configProfile: string | null;
      purpose: string;
      essential: boolean;
      totalCalls: bigint | number;
      totalCredits: bigint | number;
      cachedCalls: bigint | number;
      errorCount: bigint | number;
      avgCreditsPerCall: unknown;
      avgLatencyMs: unknown;
      avgBatchSize: unknown;
    };

    const [usageRows, topEndpoints] = await Promise.all([
      database.apiUsageDaily.findMany({
        where: { date: { gte: fetchStart } },
        orderBy: [{ date: "asc" }, { service: "asc" }],
      }),
      database.$queryRaw<TopEndpointRow[]>(Prisma.sql`
        SELECT
          "service",
          "endpoint",
          "strategy",
          "mode",
          "configProfile",
          "purpose",
          "essential",
          SUM("totalCalls")::bigint AS "totalCalls",
          SUM("totalCredits")::bigint AS "totalCredits",
          SUM("cachedCalls")::bigint AS "cachedCalls",
          SUM("errorCount")::bigint AS "errorCount",
          CASE
            WHEN SUM("totalCalls") > 0 THEN SUM("totalCredits")::numeric / SUM("totalCalls")::numeric
            ELSE 0
          END AS "avgCreditsPerCall",
          CASE
            WHEN SUM("totalCalls") > 0 THEN SUM("avgLatencyMs" * "totalCalls")::numeric / SUM("totalCalls")::numeric
            ELSE 0
          END AS "avgLatencyMs",
          CASE
            WHEN SUM("totalCalls") > 0 THEN SUM("avgBatchSize" * "totalCalls")::numeric / SUM("totalCalls")::numeric
            ELSE 0
          END AS "avgBatchSize"
        FROM "ApiEndpointDaily"
        WHERE "date" >= ${since}
          ${endpointMode ? Prisma.sql`AND "mode" = ${endpointMode}` : Prisma.empty}
          ${endpointProfile ? Prisma.sql`AND "configProfile" = ${endpointProfile}` : Prisma.empty}
        GROUP BY "service", "endpoint", "strategy", "mode", "configProfile", "purpose", "essential"
        ORDER BY SUM("totalCredits") DESC
        LIMIT 20
      `),
    ]);

    const history = usageRows.filter((row) => row.date >= since);
    const monthlyUsage = summarizeMonthlyUsage(usageRows.filter((row) => row.date >= monthStart));
    const persistedUsage = currentUsage
      ? null
      : history.filter((row) => isSameDay(row.date, todayDate));

    res.json({
      current: currentUsage,
      daily: currentUsage ?? persistedUsage?.map((row) => serializeUsageRow(row)) ?? [],
      monthly: monthlyUsage,
      history: history.map((row) => serializeUsageRow(row)),
      endpointFilter: {
        mode: endpointMode ?? null,
        profile: endpointProfile ?? null,
      },
      topEndpoints: topEndpoints.map((entry) => ({
        service: entry.service,
        endpoint: entry.endpoint,
        strategy: entry.strategy,
        mode: entry.mode,
        configProfile: entry.configProfile,
        purpose: entry.purpose,
        essential: entry.essential,
        totalCalls: Number(entry.totalCalls ?? 0),
        totalCredits: Number(entry.totalCredits ?? 0),
        cachedCalls: Number(entry.cachedCalls ?? 0),
        errorCount: Number(entry.errorCount ?? 0),
        avgCreditsPerCall: Number(entry.avgCreditsPerCall ?? 0),
        avgLatencyMs: Number(entry.avgLatencyMs ?? 0),
        avgBatchSize: Number(entry.avgBatchSize ?? 0),
      })),
      windowDays: days,
    });
  });

  return router;
}
