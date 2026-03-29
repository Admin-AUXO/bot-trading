import { queryOptions } from "@tanstack/react-query";
import {
  fetchApiUsage,
  fetchCapitalCurve,
  fetchDailyStats,
  fetchExecutionQuality,
  fetchGraduationStats,
  fetchHeartbeat,
  fetchOperatorSessionStatus,
  fetchOverview,
  fetchPnlDistribution,
  fetchPositionHistory,
  fetchPositions,
  fetchProfiles,
  fetchProfileResultsSummaries,
  fetchRegimeHistory,
  fetchSignalsPaginated,
  fetchSkippedSignals,
  fetchStrategyAnalytics,
  fetchStrategyConfig,
  fetchTrades,
  fetchWalletActivity,
  fetchWouldHaveWon,
  type TradeMode,
  type TradeSource,
} from "@/lib/api";

function withErrorBackoff(intervalMs: number, errorMs: number = 30_000) {
  return (query: { state: { status: string } }) =>
    query.state.status === "error" ? errorMs : intervalMs;
}

function withRealtimeBackstop(intervalMs: number, realtimeHealthy: boolean, errorMs: number = 30_000) {
  return realtimeHealthy ? false : withErrorBackoff(intervalMs, errorMs);
}

export const dashboardQueryKeys = {
  apiUsage: (days: number, mode?: TradeMode | null, profile?: string | null) =>
    ["api-usage", days, mode ?? null, profile ?? null] as const,
  heartbeat: ["heartbeat"] as const,
  operatorSession: ["operator-session"] as const,
  overview: ["overview"] as const,
  positions: (mode?: TradeMode | null, profile?: string | null, tradeSource?: TradeSource | null) =>
    ["positions", mode ?? null, profile ?? null, tradeSource ?? null] as const,
  positionHistory: (
    page: number,
    strategy?: string | null,
    mode?: TradeMode | null,
    profile?: string | null,
    tradeSource?: TradeSource | null,
  ) => ["position-history", page, strategy ?? null, mode ?? null, profile ?? null, tradeSource ?? null] as const,
  trades: (
    page: number,
    strategy?: string | null,
    mode?: TradeMode | null,
    profile?: string | null,
    tradeSource?: TradeSource | null,
  ) => ["trades", page, strategy ?? null, mode ?? null, profile ?? null, tradeSource ?? null] as const,
  signals: (
    page: number,
    strategy?: string | null,
    mode?: TradeMode | null,
    profile?: string | null,
  ) => ["signals-paginated", page, strategy ?? null, mode ?? null, profile ?? null] as const,
  skippedSignals: (
    page: number,
    strategy?: string | null,
    mode?: TradeMode | null,
    profile?: string | null,
  ) => ["skipped-signals", page, strategy ?? null, mode ?? null, profile ?? null] as const,
  dailyStats: (days: number, mode?: TradeMode | null, profile?: string | null) =>
    ["daily-stats", days, mode ?? null, profile ?? null] as const,
  strategyAnalytics: (
    days: number,
    mode?: TradeMode | null,
    profile?: string | null,
    tradeSource?: TradeSource | null,
  ) => ["strategy-analytics", days, mode ?? null, profile ?? null, tradeSource ?? null] as const,
  executionQuality: (
    days: number,
    mode?: TradeMode | null,
    profile?: string | null,
    tradeSource?: TradeSource | null,
  ) => ["execution-quality", days, mode ?? null, profile ?? null, tradeSource ?? null] as const,
  capitalCurve: (days: number, mode?: TradeMode | null, profile?: string | null) =>
    ["capital-curve", days, mode ?? null, profile ?? null] as const,
  regimeHistory: ["regime-history"] as const,
  wouldHaveWon: (days: number, mode?: TradeMode | null, profile?: string | null) =>
    ["would-have-won", days, mode ?? null, profile ?? null] as const,
  pnlDistribution: (
    days: number,
    mode?: TradeMode | null,
    profile?: string | null,
    tradeSource?: TradeSource | null,
  ) => ["pnl-distribution", days, mode ?? null, profile ?? null, tradeSource ?? null] as const,
  walletActivity: (limit: number) => ["wallet-activity", limit] as const,
  graduationStats: (days: number) => ["graduation-stats", days] as const,
  profiles: ["profiles"] as const,
  profileResultsSummaries: ["profile-results-summaries"] as const,
  strategyConfig: ["strategy-config"] as const,
};

export function apiUsageQueryOptions(days: number = 14, mode?: TradeMode | null, profile?: string | null) {
  return queryOptions({
    queryKey: dashboardQueryKeys.apiUsage(days, mode, profile),
    queryFn: () => fetchApiUsage(days, mode ?? undefined, profile ?? undefined),
    staleTime: 30_000,
    refetchInterval: withErrorBackoff(60_000),
  });
}

export function heartbeatQueryOptions(realtimeHealthy: boolean = false) {
  return queryOptions({
    queryKey: dashboardQueryKeys.heartbeat,
    queryFn: fetchHeartbeat,
    staleTime: 10_000,
    refetchInterval: withRealtimeBackstop(60_000, realtimeHealthy),
  });
}

export function operatorSessionQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.operatorSession,
    queryFn: fetchOperatorSessionStatus,
    staleTime: 5_000,
  });
}

export function overviewQueryOptions(realtimeHealthy: boolean = false) {
  return queryOptions({
    queryKey: dashboardQueryKeys.overview,
    queryFn: fetchOverview,
    staleTime: 5_000,
    refetchInterval: withRealtimeBackstop(30_000, realtimeHealthy),
  });
}

export function positionsQueryOptions(
  mode?: TradeMode | null,
  profile?: string | null,
  tradeSource?: TradeSource | null,
  realtimeHealthy: boolean = false,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.positions(mode, profile, tradeSource),
    queryFn: () => fetchPositions(mode ?? undefined, profile ?? undefined, tradeSource ?? undefined),
    staleTime: 5_000,
    refetchInterval: withRealtimeBackstop(30_000, realtimeHealthy),
  });
}

export function positionHistoryQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: TradeMode | null,
  profile?: string | null,
  tradeSource?: TradeSource | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.positionHistory(page, strategy, mode, profile, tradeSource),
    queryFn: () => fetchPositionHistory(
      page,
      strategy ?? undefined,
      mode ?? undefined,
      profile ?? undefined,
      tradeSource ?? undefined,
    ),
  });
}

export function tradesQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: TradeMode | null,
  profile?: string | null,
  tradeSource?: TradeSource | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.trades(page, strategy, mode, profile, tradeSource),
    queryFn: () => fetchTrades(
      page,
      strategy ?? undefined,
      mode ?? undefined,
      profile ?? undefined,
      tradeSource ?? undefined,
    ),
  });
}

export function signalsQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: TradeMode | null,
  profile?: string | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.signals(page, strategy, mode, profile),
    queryFn: () => fetchSignalsPaginated(page, strategy ?? undefined, mode ?? undefined, profile ?? undefined),
    refetchInterval: withErrorBackoff(30_000),
  });
}

export function skippedSignalsQueryOptions(
  page: number,
  strategy?: string | null,
  mode?: TradeMode | null,
  profile?: string | null,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.skippedSignals(page, strategy, mode, profile),
    queryFn: () => fetchSkippedSignals(page, strategy ?? undefined, mode ?? undefined, profile ?? undefined),
    refetchInterval: withErrorBackoff(30_000),
  });
}

export function dailyStatsQueryOptions(
  days: number,
  mode?: TradeMode | null,
  profile?: string | null,
  realtimeHealthy: boolean = false,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.dailyStats(days, mode, profile),
    queryFn: () => fetchDailyStats(days, mode ?? undefined, profile ?? undefined),
    staleTime: 30_000,
    refetchInterval: withRealtimeBackstop(60_000, realtimeHealthy),
  });
}

export function strategyAnalyticsQueryOptions(
  days: number,
  mode?: TradeMode | null,
  profile?: string | null,
  tradeSource?: TradeSource | null,
  realtimeHealthy: boolean = false,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.strategyAnalytics(days, mode, profile, tradeSource),
    queryFn: () => fetchStrategyAnalytics(
      days,
      mode ?? undefined,
      profile ?? undefined,
      tradeSource ?? undefined,
    ),
    staleTime: 30_000,
    refetchInterval: withRealtimeBackstop(60_000, realtimeHealthy),
  });
}

export function executionQualityQueryOptions(
  days: number,
  mode?: TradeMode | null,
  profile?: string | null,
  tradeSource?: TradeSource | null,
  realtimeHealthy: boolean = false,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.executionQuality(days, mode, profile, tradeSource),
    queryFn: () => fetchExecutionQuality(
      days,
      mode ?? undefined,
      profile ?? undefined,
      tradeSource ?? undefined,
    ),
    staleTime: 30_000,
    refetchInterval: withRealtimeBackstop(60_000, realtimeHealthy),
  });
}

export function capitalCurveQueryOptions(days: number, mode?: TradeMode | null, profile?: string | null) {
  return queryOptions({
    queryKey: dashboardQueryKeys.capitalCurve(days, mode, profile),
    queryFn: () => fetchCapitalCurve(days, mode ?? undefined, profile ?? undefined),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function regimeHistoryQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.regimeHistory,
    queryFn: fetchRegimeHistory,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function wouldHaveWonQueryOptions(days: number, mode?: TradeMode | null, profile?: string | null) {
  return queryOptions({
    queryKey: dashboardQueryKeys.wouldHaveWon(days, mode, profile),
    queryFn: () => fetchWouldHaveWon(days, mode ?? undefined, profile ?? undefined),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function pnlDistributionQueryOptions(
  days: number,
  mode?: TradeMode | null,
  profile?: string | null,
  tradeSource?: TradeSource | null,
  realtimeHealthy: boolean = false,
) {
  return queryOptions({
    queryKey: dashboardQueryKeys.pnlDistribution(days, mode, profile, tradeSource),
    queryFn: () => fetchPnlDistribution(
      days,
      mode ?? undefined,
      profile ?? undefined,
      tradeSource ?? undefined,
    ),
    staleTime: 60_000,
    refetchInterval: withRealtimeBackstop(60_000, realtimeHealthy),
  });
}

export function walletActivityQueryOptions(limit: number = 30) {
  return queryOptions({
    queryKey: dashboardQueryKeys.walletActivity(limit),
    queryFn: () => fetchWalletActivity(limit),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function graduationStatsQueryOptions(days: number) {
  return queryOptions({
    queryKey: dashboardQueryKeys.graduationStats(days),
    queryFn: () => fetchGraduationStats(days),
    staleTime: 60_000,
  });
}

export function profilesQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.profiles,
    queryFn: fetchProfiles,
    staleTime: 60_000,
  });
}

export function profileResultsSummariesQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.profileResultsSummaries,
    queryFn: fetchProfileResultsSummaries,
    staleTime: 30_000,
  });
}

export function strategyConfigQueryOptions() {
  return queryOptions({
    queryKey: dashboardQueryKeys.strategyConfig,
    queryFn: fetchStrategyConfig,
    staleTime: 60_000,
    refetchInterval: withErrorBackoff(120_000),
  });
}
