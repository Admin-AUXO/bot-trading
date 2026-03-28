import { Prisma } from "@prisma/client";
import { config } from "../config/index.js";
import { db } from "../db/client.js";
import type { ExecutionScope } from "../utils/types.js";

type DatabaseClient = typeof db;

export interface LaneTodaySummary {
  todayTrades: number;
  todayPnl: number;
  todayWins: number;
  todayLosses: number;
}

const SUMMARY_TTL_MS = config.api.laneSummaryTtlMs;
const summaryCache = new Map<string, { expiresAt: number; value: LaneTodaySummary }>();
const DAY_MS = 86_400_000;

interface SummaryRow {
  total_trades: number;
  total_sells: number;
  total_wins: number;
  total_pnl: unknown;
}

function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(todayKey(now));
}

function cacheKey(scope: ExecutionScope, today: string): string {
  return `${today}:${scope.mode}:${scope.configProfile}`;
}

export async function getLaneTodaySummary(
  database: DatabaseClient,
  scope: ExecutionScope,
): Promise<LaneTodaySummary> {
  const now = new Date();
  const today = todayKey(now);
  const key = cacheKey(scope, today);
  const cached = summaryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const dayStart = startOfUtcDay(now);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const [row] = await database.$queryRaw<SummaryRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS total_trades,
      COUNT(*) FILTER (WHERE side = 'SELL')::int AS total_sells,
      COUNT(*) FILTER (WHERE side = 'SELL' AND "pnlUsd" > 0)::int AS total_wins,
      COALESCE(SUM("pnlUsd") FILTER (WHERE side = 'SELL'), 0) AS total_pnl
    FROM "Trade"
    WHERE "executedAt" >= ${dayStart}
      AND "executedAt" < ${dayEnd}
      AND mode = ${scope.mode}
      AND "configProfile" = ${scope.configProfile}
  `);

  const totalSells = Number(row?.total_sells ?? 0);
  const totalWins = Number(row?.total_wins ?? 0);

  const summary: LaneTodaySummary = {
    todayTrades: Number(row?.total_trades ?? 0),
    todayPnl: Number(row?.total_pnl ?? 0),
    todayWins: totalWins,
    todayLosses: Math.max(0, totalSells - totalWins),
  };

  summaryCache.set(key, {
    expiresAt: Date.now() + SUMMARY_TTL_MS,
    value: summary,
  });

  return summary;
}
