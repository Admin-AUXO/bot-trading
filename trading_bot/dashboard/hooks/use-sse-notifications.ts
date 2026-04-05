"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { createSSEConnection } from "@/lib/api";
import { markRealtimeDisconnected, noteRealtimeMessage } from "@/lib/realtime-sync";
import { applyOverviewRealtimeUpdate, isOverviewStreamPayload, type RealtimeOverviewState } from "@/lib/realtime-overview";
import { toast } from "sonner";

export function useSSENotifications() {
  const queryClient = useQueryClient();
  const prevState = useRef<RealtimeOverviewState>({});

  // TODO: Add handlers for trade_executed and position_closed events when backend SSE stream supports them

  useEffect(() => {
    const es = createSSEConnection(
      (data: unknown) => {
        try {
          if (!isOverviewStreamPayload(data)) return;

          noteRealtimeMessage();
          const transition = applyOverviewRealtimeUpdate(queryClient, data, prevState.current);
          const { overview } = transition;
          const pauseReasons = Array.isArray(overview.pauseReasons) ? overview.pauseReasons : [];

          if (transition.paused) {
            toast.error("Bot paused", {
              description: pauseReasons.length > 0 ? pauseReasons.join(" · ") : String(overview.pauseReason ?? "Unknown reason"),
            });
          }

          if (transition.capitalLevelChangedTo) {
            if (transition.capitalLevelChangedTo === "CRITICAL") {
              toast.warning("Capital dropped to CRITICAL", { description: "Only S3 trades allowed" });
            } else if (transition.capitalLevelChangedTo === "HALT") {
              toast.error("Capital below $100", { description: "All trading halted" });
            }
          }

          if (transition.dailyLossWarning) {
            toast.warning("Daily loss at 80% of limit", { description: `$${overview.dailyLossUsd.toFixed(2)} / $${overview.dailyLossLimit.toFixed(2)}` });
          }

          prevState.current = transition.nextState;
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
