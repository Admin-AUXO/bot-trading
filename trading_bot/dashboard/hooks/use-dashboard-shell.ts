"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  heartbeatQueryOptions,
  operatorSessionQueryOptions,
  overviewQueryOptions,
  positionsQueryOptions,
} from "@/lib/dashboard-query-options";
import { useDashboardStore } from "@/lib/store";
import type { Position } from "@/lib/api";

const STRATEGY_STOP_LOSS: Record<string, number> = {
  S1_COPY: 20,
  S2_GRADUATION: 25,
  S3_MOMENTUM: 10,
};

const STRATEGY_TIME_STOPS: Record<string, number> = {
  S1_COPY: 120,
  S2_GRADUATION: 15,
  S3_MOMENTUM: 5,
};

function scorePositionUrgency(position: Position) {
  const stopLoss = STRATEGY_STOP_LOSS[position.strategy] ?? 20;
  const stopDistance = position.pnlPercent + stopLoss;
  const holdMinutes = position.holdMinutes ?? 0;
  const timeBudget = STRATEGY_TIME_STOPS[position.strategy] ?? 30;
  const timeRemaining = Math.max(0, timeBudget - holdMinutes);

  const stopRisk = stopDistance <= 5 ? 0 : stopDistance <= 10 ? 1 : 2;
  const timeRisk = timeRemaining <= 3 ? 0 : timeRemaining <= 10 ? 1 : 2;

  return {
    holdMinutes,
    stopDistance,
    timeRemaining,
    urgencyScore: stopRisk * 10 + timeRisk,
  };
}

export function useDashboardShell() {
  const { mode, selectedStrategy } = useDashboardStore();
  const [overviewQuery, positionsQuery, heartbeatQuery, operatorSessionQuery] = useQueries({
    queries: [
      overviewQueryOptions(mode),
      positionsQueryOptions(mode),
      heartbeatQueryOptions(),
      operatorSessionQueryOptions(),
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

  const metrics = useMemo(() => {
    const solPrice = overviewQuery.data?.regime?.solPrice ?? 0;
    const openPnlUsd = allPositions.reduce((sum, position) => sum + (position.pnlUsd ?? 0), 0);
    const deployedCapitalUsd = allPositions.reduce(
      (sum, position) => sum + position.amountSol * solPrice,
      0,
    );
    const manualPositions = allPositions.filter((position) => position.tradeSource === "MANUAL").length;
    const activeStrategiesCount = new Set(allPositions.map((position) => position.strategy)).size;
    const urgentPositions = [...allPositions]
      .map((position) => ({
        ...position,
        ...scorePositionUrgency(position),
      }))
      .sort((left, right) => left.urgencyScore - right.urgencyScore)
      .slice(0, 4);

    return {
      activeStrategiesCount,
      deployedCapitalUsd,
      manualPositions,
      openPnlUsd,
      openSlots: Math.max(0, 5 - allPositions.length),
      urgentPositions,
    };
  }, [allPositions, overviewQuery.data?.regime?.solPrice]);

  const lastUpdatedAt = Math.max(
    overviewQuery.dataUpdatedAt,
    positionsQuery.dataUpdatedAt,
    heartbeatQuery.dataUpdatedAt,
    operatorSessionQuery.dataUpdatedAt,
  );

  return {
    mode,
    selectedStrategy,
    overview: overviewQuery.data,
    heartbeat: heartbeatQuery.data,
    operatorSession: operatorSessionQuery.data,
    allPositions,
    filteredPositions,
    connectionState,
    operatorAccess,
    lastUpdatedAt,
    isLoadingShell:
      overviewQuery.isLoading &&
      positionsQuery.isLoading &&
      heartbeatQuery.isLoading &&
      operatorSessionQuery.isLoading,
    ...metrics,
  };
}
