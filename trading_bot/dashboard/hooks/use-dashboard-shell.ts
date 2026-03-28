"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  apiUsageQueryOptions,
  heartbeatQueryOptions,
  operatorSessionQueryOptions,
  overviewQueryOptions,
  positionsQueryOptions,
  strategyConfigQueryOptions,
} from "@/lib/dashboard-query-options";
import { useDashboardStore } from "@/lib/store";
import type { BudgetSnapshot, Position, StrategyConfigResponse } from "@/lib/api";

const FALLBACK_STOP_LOSS: Record<string, number> = {
  S1_COPY: 20,
  S2_GRADUATION: 25,
  S3_MOMENTUM: 10,
};

const FALLBACK_TIME_STOP: Record<string, number> = {
  S1_COPY: 120,
  S2_GRADUATION: 15,
  S3_MOMENTUM: 5,
};

function getStrategyRiskConfig(strategyConfig: StrategyConfigResponse | undefined, strategy: string) {
  const config = strategyConfig?.strategies[strategy];
  return {
    stopLoss: config?.stopLoss ?? FALLBACK_STOP_LOSS[strategy] ?? 20,
    timeStopMinutes: config?.timeStopMinutes ?? FALLBACK_TIME_STOP[strategy] ?? 30,
  };
}

function scorePositionUrgency(position: Position, strategyConfig?: StrategyConfigResponse) {
  const config = getStrategyRiskConfig(strategyConfig, position.strategy);
  const stopDistance = position.pnlPercent + config.stopLoss;
  const holdMinutes = position.holdMinutes ?? 0;
  const timeRemaining = Math.max(0, config.timeStopMinutes - holdMinutes);

  const stopRisk = stopDistance <= 5 ? 0 : stopDistance <= 10 ? 1 : 2;
  const timeRisk = timeRemaining <= 3 ? 0 : timeRemaining <= 10 ? 1 : 2;

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

export function useDashboardShell() {
  const { selectedStrategy } = useDashboardStore();
  const [
    overviewQuery,
    positionsQuery,
    heartbeatQuery,
    operatorSessionQuery,
    strategyConfigQuery,
    apiUsageQuery,
  ] = useQueries({
    queries: [
      overviewQueryOptions(),
      positionsQueryOptions(),
      heartbeatQueryOptions(),
      operatorSessionQueryOptions(),
      strategyConfigQueryOptions(),
      apiUsageQueryOptions(14),
    ],
  });

  const allPositions = useMemo(() => positionsQuery.data ?? [], [positionsQuery.data]);
  const filteredPositions = useMemo(
    () => (
      selectedStrategy
        ? allPositions.filter((position) => position.strategy === selectedStrategy)
        : allPositions
    ),
    [allPositions, selectedStrategy],
  );

  const connectionState: "online" | "degraded" | "offline" = heartbeatQuery.isError
    ? (overviewQuery.data || positionsQuery.data ? "degraded" : "offline")
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
  const worstQuota = rankQuotaSnapshots(apiUsageQuery.data?.current ?? apiUsageQuery.data?.daily);

  const metrics = useMemo(() => {
    const solPrice = overviewQuery.data?.regime?.solPrice ?? 0;
    const openPnlUsd = allPositions.reduce((sum, position) => sum + (position.pnlUsd ?? 0), 0);
    const deployedCapitalUsd = allPositions.reduce(
      (sum, position) => sum + position.amountSol * solPrice,
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
  }, [allPositions, maxOpenPositions, overviewQuery.data?.regime?.solPrice, strategyConfig]);

  const lastUpdatedAt = Math.max(
    overviewQuery.dataUpdatedAt,
    positionsQuery.dataUpdatedAt,
    heartbeatQuery.dataUpdatedAt,
    operatorSessionQuery.dataUpdatedAt,
    strategyConfigQuery.dataUpdatedAt,
    apiUsageQuery.dataUpdatedAt,
  );

  return {
    activeScope,
    selectedStrategy,
    overview: overviewQuery.data,
    heartbeat: heartbeatQuery.data,
    operatorSession: operatorSessionQuery.data,
    strategyConfig,
    apiUsage: apiUsageQuery.data,
    worstQuota,
    pauseReasons,
    allPositions,
    filteredPositions,
    connectionState,
    operatorAccess,
    lastUpdatedAt,
    maxOpenPositions,
    isLoadingShell:
      overviewQuery.isLoading &&
      positionsQuery.isLoading &&
      heartbeatQuery.isLoading &&
      operatorSessionQuery.isLoading,
    ...metrics,
  };
}
