import type { QueryClient } from "@tanstack/react-query";
import {
  normalizeOverviewResponse,
  type HeartbeatResponse,
  type OverviewResponse,
  type TradeMode,
  type TradeSource,
} from "@/lib/api";
import { dashboardQueryKeys } from "@/lib/dashboard-query-options";

const TRADE_SOURCES: TradeSource[] = ["AUTO", "MANUAL"];

export type RealtimeOverviewState = {
  isRunning?: boolean;
  capitalLevel?: string;
  dailyLossPercent?: number;
  scopeKey?: string;
  openPositions?: number;
  todayTrades?: number;
  lastTradeAt?: string | null;
  lastSignalAt?: string | null;
};

export type RealtimeOverviewTransition = {
  nextState: RealtimeOverviewState;
  overview: OverviewResponse;
  paused: boolean;
  capitalLevelChangedTo?: string;
  dailyLossWarning: boolean;
};

export function applyOverviewRealtimeUpdate(
  queryClient: QueryClient,
  payload: OverviewResponse,
  previousState: RealtimeOverviewState,
): RealtimeOverviewTransition {
  const overview = normalizeOverviewResponse(payload);
  const {
    capitalLevel,
    isRunning,
    lastSignalAt,
    lastTradeAt,
    openPositions,
    scope,
    todayTrades,
  } = overview;
  const dailyLossUsd = Number(overview.dailyLossUsd ?? 0);
  const dailyLossLimit = Number(overview.dailyLossLimit ?? 10);
  const dailyPct = dailyLossLimit > 0 ? (dailyLossUsd / dailyLossLimit) * 100 : 0;
  const scopeKey = scope?.mode && scope.configProfile ? `${scope.mode}:${scope.configProfile}` : undefined;

  queryClient.setQueryData<OverviewResponse>(dashboardQueryKeys.overview, overview);

  if (scope?.mode && scope.configProfile) {
    queryClient.setQueryData<HeartbeatResponse | undefined>(
      dashboardQueryKeys.heartbeat,
      (prev) => prev
        ? {
            ...prev,
            scope,
            isRunning,
            lastTradeAt,
            lastSignalAt,
          }
        : prev,
    );
    queryClient.setQueryData(
      dashboardQueryKeys.positions(scope.mode, scope.configProfile, null),
      openPositions,
    );
    for (const tradeSource of TRADE_SOURCES) {
      queryClient.setQueryData(
        dashboardQueryKeys.positions(scope.mode, scope.configProfile, tradeSource),
        openPositions.filter((position) => position.tradeSource === tradeSource),
      );
    }
  }

  if (previousState.scopeKey && scopeKey && previousState.scopeKey !== scopeKey) {
    void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat, refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.strategyConfig, refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.profiles, refetchType: "none" });
  }

  if (
    previousState.openPositions !== undefined &&
    previousState.openPositions !== openPositions.length
  ) {
    void queryClient.invalidateQueries({ queryKey: ["positions"], refetchType: "none" });
  }

  if (
    previousState.todayTrades !== undefined &&
    previousState.todayTrades !== todayTrades
  ) {
    void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat, refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["position-history"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["trades"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["daily-stats"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["strategy-analytics"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["execution-quality"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["pnl-distribution"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["api-usage"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.profileResultsSummaries, refetchType: "none" });
  }

  if (
    previousState.lastSignalAt !== undefined &&
    previousState.lastSignalAt !== lastSignalAt
  ) {
    void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat, refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["signals-paginated"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["skipped-signals"], refetchType: "none" });
  }

  return {
    nextState: {
      isRunning,
      capitalLevel,
      dailyLossPercent: dailyPct,
      lastSignalAt,
      lastTradeAt,
      scopeKey,
      openPositions: openPositions.length,
      todayTrades,
    },
    overview,
    paused: previousState.isRunning === true && isRunning === false,
    capitalLevelChangedTo:
      previousState.capitalLevel && previousState.capitalLevel !== capitalLevel
        ? capitalLevel
        : undefined,
    dailyLossWarning:
      previousState.dailyLossPercent !== undefined &&
      previousState.dailyLossPercent < 80 &&
      dailyPct >= 80,
  };
}

export function isOverviewStreamPayload(value: unknown): value is OverviewResponse {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  const scope = record.scope;
  if (!scope || typeof scope !== "object") return false;

  const scopeRecord = scope as Record<string, unknown>;
  return (
    isTradeMode(scopeRecord.mode) &&
    typeof scopeRecord.configProfile === "string" &&
    typeof record.isRunning === "boolean" &&
    typeof record.capitalLevel === "string" &&
    typeof record.dailyLossUsd === "number" &&
    typeof record.dailyLossLimit === "number" &&
    typeof record.todayTrades === "number" &&
    ("quotaSnapshots" in record || "currentQuotaSnapshots" in record) &&
    Array.isArray(record.openPositions)
  );
}

function isTradeMode(value: unknown): value is TradeMode {
  return value === "LIVE" || value === "DRY_RUN";
}
