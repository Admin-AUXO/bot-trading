"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  createSSEConnection,
  normalizeOverviewResponse,
  type TradeSource,
  type HeartbeatResponse,
  type OverviewResponse,
  type TradeMode,
} from "@/lib/api";
import { dashboardQueryKeys } from "@/lib/dashboard-query-options";
import { markRealtimeDisconnected, noteRealtimeMessage } from "@/lib/realtime-sync";
import { toast } from "sonner";

const TRADE_SOURCES: TradeSource[] = ["AUTO", "MANUAL"];

export function useSSENotifications() {
  const queryClient = useQueryClient();
  const prevState = useRef<{
    isRunning?: boolean;
    capitalLevel?: string;
    dailyLossPercent?: number;
    scopeKey?: string;
    openPositions?: number;
    todayTrades?: number;
    lastTradeAt?: string | null;
    lastSignalAt?: string | null;
  }>({});

  // TODO: Add handlers for trade_executed and position_closed events when backend SSE stream supports them

  useEffect(() => {
    const es = createSSEConnection(
      (data: unknown) => {
        try {
          if (!isOverviewStreamPayload(data)) return;

          const overview = normalizeOverviewResponse(data);
          noteRealtimeMessage();
          const {
            capitalLevel,
            isRunning,
            lastSignalAt,
            lastTradeAt,
            openPositions,
            scope,
            todayTrades,
          } = overview;
          const pauseReasons = Array.isArray(overview.pauseReasons) ? overview.pauseReasons : [];
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

          if (prevState.current.isRunning === true && isRunning === false) {
            toast.error("Bot paused", {
              description: pauseReasons.length > 0 ? pauseReasons.join(" · ") : String(overview.pauseReason ?? "Unknown reason"),
            });
          }

          if (prevState.current.capitalLevel && prevState.current.capitalLevel !== capitalLevel) {
            if (capitalLevel === "CRITICAL") {
              toast.warning("Capital dropped to CRITICAL", { description: "Only S3 trades allowed" });
            } else if (capitalLevel === "HALT") {
              toast.error("Capital below $100", { description: "All trading halted" });
            }
          }

          if (
            prevState.current.dailyLossPercent !== undefined &&
            prevState.current.dailyLossPercent < 80 &&
            dailyPct >= 80
          ) {
            toast.warning("Daily loss at 80% of limit", { description: `$${dailyLossUsd.toFixed(2)} / $${dailyLossLimit.toFixed(2)}` });
          }

          if (prevState.current.scopeKey && scopeKey && prevState.current.scopeKey !== scopeKey) {
            void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat });
            void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.strategyConfig });
            void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.profiles });
          }

          if (
            prevState.current.openPositions !== undefined &&
            prevState.current.openPositions !== openPositions.length
          ) {
            void queryClient.invalidateQueries({ queryKey: ["positions"] });
          }

          if (
            prevState.current.todayTrades !== undefined &&
            prevState.current.todayTrades !== todayTrades
          ) {
            void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat });
            void queryClient.invalidateQueries({ queryKey: ["position-history"] });
            void queryClient.invalidateQueries({ queryKey: ["trades"] });
            void queryClient.invalidateQueries({ queryKey: ["daily-stats"] });
            void queryClient.invalidateQueries({ queryKey: ["strategy-analytics"] });
            void queryClient.invalidateQueries({ queryKey: ["execution-quality"] });
            void queryClient.invalidateQueries({ queryKey: ["pnl-distribution"] });
            void queryClient.invalidateQueries({ queryKey: ["api-usage"] });
            void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.profileResultsSummaries });
          }

          if (
            prevState.current.lastSignalAt !== undefined &&
            prevState.current.lastSignalAt !== lastSignalAt
          ) {
            void queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat });
            void queryClient.invalidateQueries({ queryKey: ["signals-paginated"] });
            void queryClient.invalidateQueries({ queryKey: ["skipped-signals"] });
          }

          prevState.current = {
            isRunning,
            capitalLevel,
            dailyLossPercent: dailyPct,
            lastSignalAt,
            lastTradeAt,
            scopeKey,
            openPositions: openPositions.length,
            todayTrades,
          };
        } catch (error) {
          // Ignore malformed SSE payloads and keep the connection alive.
          void error;
        }
      },
      () => {
        markRealtimeDisconnected();
      },
    );

    return () => {
      markRealtimeDisconnected();
      es.close();
    };
  }, [queryClient]);
}

function isOverviewStreamPayload(value: unknown): value is OverviewResponse {
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
