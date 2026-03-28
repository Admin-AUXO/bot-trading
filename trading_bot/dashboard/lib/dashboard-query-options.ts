import { queryOptions } from "@tanstack/react-query";
import {
  fetchApiUsage,
  fetchCapitalCurve,
  fetchDailyStats,
  fetchHeartbeat,
  fetchOperatorSessionStatus,
  fetchOverview,
  fetchPositionHistory,
  fetchPositions,
  fetchSignalsPaginated,
  fetchSkippedSignals,
  fetchTrades,
} from "@/lib/api";

export type DashboardMode = "LIVE" | "DRY_RUN";

function withErrorBackoff(intervalMs: number, errorMs: number = 30_000) {
  return (query: { state: { status: string } }) =>
    query.state.status === "error" ? errorMs : intervalMs;
}

export const dashboardQueryKeys = {
  apiUsage: ["api-usage"] as const,
  heartbeat: ["heartbeat"] as const,
  operatorSession: ["operator-session"] as const,
  overview: (mode: DashboardMode) => ["overview", mode] as const,
  positions: (mode: DashboardMode) => ["positions", mode] as const,
  positionHistory: (page: number, strategy?: string | null, mode?: DashboardMode, profile?: string | null) =>
    ["position-history", page, strategy ?? null, mode ?? null, profile ?? null] as const,
  trades: (page: number, strategy?: string | null, mode?: DashboardMode, profile?: string | null) =>
    ["trades", page, strategy ?? null, mode ?? null, profile ?? null] as const,
  signals: (page: number, strategy?: string | null, mode?: DashboardMode, profile?: string | null) =>
    ["signals-paginated", page, strategy ?? null, mode ?? null, profile ?? null] as const,
  skippedSignals: (page: number, strategy?: string | null, mode?: DashboardMode, profile?: string | null) =>
    ["skipped-signals", page, strategy ?? null, mode ?? null, profile ?? null] as const,
  dailyStats: (days: number, mode?: DashboardMode, profile?: string | null) =>
    ["daily-stats", days, mode ?? null, profile ?? null] as const,
  capitalCurve: (days: number, mode?: DashboardMode, profile?: string | null) =>
    ["capital-curve", days, mode ?? null, profile ?? null] as const,
};

export function apiUsageQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.apiUsage,
    queryFn: fetchApiUsage,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function heartbeatQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.heartbeat,
    queryFn: fetchHeartbeat,
    staleTime: 10_000,
    refetchInterval: withErrorBackoff(15_000),
  });
}

export function operatorSessionQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.operatorSession,
    queryFn: fetchOperatorSessionStatus,
    staleTime: 5_000,
  });
}

export function overviewQueryOptions(mode: DashboardMode) {
  return queryOptions({
    queryKey: dashboardQueryKeys.overview(mode),
    queryFn: () => fetchOverview(mode),
    staleTime: 5_000,
    refetchInterval: withErrorBackoff(5_000),
  });
}

export function positionsQueryOptions(mode: DashboardMode) {
  return queryOptions({
    queryKey: dashboardQueryKeys.positions(mode),
    queryFn: () => fetchPositions(mode),
    staleTime: 5_000,
    refetchInterval: withErrorBackoff(5_000),
  });
}

export function positionHistoryQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: DashboardMode,
  profile?: string | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.positionHistory(page, strategy, mode, profile),
    queryFn: () => fetchPositionHistory(page, strategy ?? undefined, mode, profile ?? undefined),
  });
}

export function tradesQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: DashboardMode,
  profile?: string | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.trades(page, strategy, mode, profile),
    queryFn: () => fetchTrades(page, strategy ?? undefined, mode, profile ?? undefined),
  });
}

export function signalsQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: DashboardMode,
  profile?: string | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.signals(page, strategy, mode, profile),
    queryFn: () => fetchSignalsPaginated(page, strategy ?? undefined, mode, profile ?? undefined),
    refetchInterval: withErrorBackoff(15_000),
  });
}

export function skippedSignalsQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: DashboardMode,
  profile?: string | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.skippedSignals(page, strategy, mode, profile),
    queryFn: () => fetchSkippedSignals(page, strategy ?? undefined, mode, profile ?? undefined),
    refetchInterval: withErrorBackoff(15_000),
  });
}

export function dailyStatsQueryOptions(days: number, mode?: DashboardMode, profile?: string | null) {
  return queryOptions({
    queryKey: dashboardQueryKeys.dailyStats(days, mode, profile),
    queryFn: () => fetchDailyStats(days, mode, profile ?? undefined),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function capitalCurveQueryOptions(days: number, mode?: DashboardMode, profile?: string | null) {
  return queryOptions({
    queryKey: dashboardQueryKeys.capitalCurve(days, mode, profile),
    queryFn: () => fetchCapitalCurve(days, mode, profile ?? undefined),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
