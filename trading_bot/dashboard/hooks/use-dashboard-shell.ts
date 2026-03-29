"use client";

import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  apiUsageQueryOptions,
  heartbeatQueryOptions,
  operatorSessionQueryOptions,
  overviewQueryOptions,
  strategyConfigQueryOptions,
} from "@/lib/dashboard-query-options";
import { getApiUsageSnapshotRows } from "@/lib/api-usage";
import type { BudgetSnapshot, Position, StrategyConfigResponse } from "@/lib/api";

function getStrategyTimeStopMinutes(strategyConfig: StrategyConfigResponse | undefined, strategy: string) {
  return strategyConfig?.strategies[strategy]?.timeStopMinutes ?? null;
}

function scorePositionUrgency(position: Position, strategyConfig?: StrategyConfigResponse) {
  const holdMinutes = position.holdMinutes ?? 0;
  const timeStopMinutes = getStrategyTimeStopMinutes(strategyConfig, position.strategy);
  const stopDistance = position.pnlPercent + position.stopLossPercent;
  const timeRemaining = timeStopMinutes == null
    ? null
    : Math.max(0, timeStopMinutes - holdMinutes);

  const stopRisk = stopDistance <= 5 ? 0 : stopDistance <= 10 ? 1 : 2;
  const timeRisk = timeRemaining == null ? 2 : timeRemaining <= 3 ? 0 : timeRemaining <= 10 ? 1 : 2;

  return {
    holdMinutes,
    stopDistance,
    timeRemaining,
    urgencyScore: stopRisk * 10 + timeRisk,
  };
}

function rankQuotaSnapshots(snapshots: BudgetSnapshot[] | null | undefined) {
  if (!snapshots?.length) return null;
  const rank = { PAUSED: 3, HARD_LIMIT: 2, SOFT_LIMIT: 1, HEALTHY: 0 } as const;
  return [...snapshots].sort((left, right) => rank[right.quotaStatus] - rank[left.quotaStatus])[0] ?? null;
}

function useDashboardShellValue() {
  const [
    overviewQuery,
    heartbeatQuery,
    operatorSessionQuery,
    strategyConfigQuery,
    apiUsageQuery,
  ] = useQueries({
    queries: [
      overviewQueryOptions(),
      heartbeatQueryOptions(),
      operatorSessionQueryOptions(),
      strategyConfigQueryOptions(),
      apiUsageQueryOptions(14),
    ],
  });

  const allPositions = useMemo(
    () => overviewQuery.data?.openPositions ?? [],
    [overviewQuery.data?.openPositions],
  );

  const connectionState: "online" | "degraded" | "offline" = heartbeatQuery.isError
    ? (overviewQuery.data || strategyConfigQuery.data || apiUsageQuery.data ? "degraded" : "offline")
    : "online";

  const operatorAccess: "locked" | "unlocked" | "unavailable" = operatorSessionQuery.data?.configured === false
    ? "unavailable"
    : operatorSessionQuery.data?.authenticated
      ? "unlocked"
      : "locked";

  const strategyConfig = strategyConfigQuery.data;
  const maxOpenPositions = strategyConfig?.risk.maxOpenPositions ?? 5;
  const activeScope = overviewQuery.data?.scope ?? heartbeatQuery.data?.scope ?? strategyConfig?.scope ?? null;
  const pauseReasons = overviewQuery.data?.pauseReasons
    ?? strategyConfig?.risk.pauseReasons
    ?? [];
  const worstQuota = rankQuotaSnapshots(getApiUsageSnapshotRows(apiUsageQuery.data));

  const metrics = useMemo(() => {
    const openPnlUsd = allPositions.reduce(
      (sum, position) => sum + (position.pnlUsd ?? ((position.currentPriceUsd - position.entryPriceUsd) * position.remainingToken)),
      0,
    );
    const deployedCapitalUsd = allPositions.reduce(
      (sum, position) => sum + (position.remainingValueUsd ?? (position.currentPriceUsd * position.remainingToken)),
      0,
    );
    const manualPositions = allPositions.filter((position) => position.tradeSource === "MANUAL").length;
    const activeStrategiesCount = new Set(allPositions.map((position) => position.strategy)).size;
    const partialClosures = allPositions.filter((position) => position.status === "PARTIALLY_CLOSED").length;
    const urgentPositions = [...allPositions]
      .map((position) => ({
        ...position,
        ...scorePositionUrgency(position, strategyConfig),
      }))
      .sort((left, right) => left.urgencyScore - right.urgencyScore)
      .slice(0, 4);

    return {
      activeStrategiesCount,
      deployedCapitalUsd,
      manualPositions,
      openPnlUsd,
      openSlots: Math.max(0, maxOpenPositions - allPositions.length),
      partialClosures,
      urgentPositions,
    };
  }, [allPositions, maxOpenPositions, strategyConfig]);

  const lastUpdatedAt = Math.max(
    overviewQuery.dataUpdatedAt,
    heartbeatQuery.dataUpdatedAt,
    operatorSessionQuery.dataUpdatedAt,
    strategyConfigQuery.dataUpdatedAt,
    apiUsageQuery.dataUpdatedAt,
  );

  const isLoadingShell = !overviewQuery.data && [
    overviewQuery,
    heartbeatQuery,
    operatorSessionQuery,
    strategyConfigQuery,
    apiUsageQuery,
  ].some((query) => query.isLoading);

  return {
    activeScope,
    overview: overviewQuery.data,
    heartbeat: heartbeatQuery.data,
    operatorSession: operatorSessionQuery.data,
    strategyConfig,
    apiUsage: apiUsageQuery.data,
    worstQuota,
    pauseReasons,
    allPositions,
    connectionState,
    operatorAccess,
    lastUpdatedAt,
    maxOpenPositions,
    isLoadingShell,
    ...metrics,
  };
}

type DashboardShellValue = ReturnType<typeof useDashboardShellValue>;

const DashboardShellContext = createContext<DashboardShellValue | null>(null);

export function DashboardShellProvider({ children }: { children: ReactNode }) {
  const value = useDashboardShellValue();
  return createElement(DashboardShellContext.Provider, { value }, children);
}

export function useDashboardShell() {
  const context = useContext(DashboardShellContext);
  if (!context) {
    throw new Error("useDashboardShell must be used within DashboardShellProvider");
  }
  return context;
}
