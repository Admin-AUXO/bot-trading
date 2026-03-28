"use client";

import { useEffect, useRef } from "react";
import { createSSEConnection } from "@/lib/api";
import { toast } from "sonner";

export function useSSENotifications() {
  const prevState = useRef<{
    isRunning?: boolean;
    capitalLevel?: string;
    dailyLossPercent?: number;
  }>({});

  // TODO: Add handlers for trade_executed and position_closed events when backend SSE stream supports them

  useEffect(() => {
    const es = createSSEConnection(
      (data: unknown) => {
        try {
          const d = data as Record<string, unknown>;

          const isRunning = d.isRunning as boolean;
          const capitalLevel = d.capitalLevel as string;
          const dailyLossUsd = Number(d.dailyLossUsd ?? 0);
          const dailyLossLimit = Number(d.dailyLossLimit ?? 10);
          const dailyPct = dailyLossLimit > 0 ? (dailyLossUsd / dailyLossLimit) * 100 : 0;

          if (prevState.current.isRunning === true && isRunning === false) {
            toast.error("Bot paused", { description: String(d.pauseReason ?? "Unknown reason") });
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

          prevState.current = {
            isRunning,
            capitalLevel,
            dailyLossPercent: dailyPct,
          };
        } catch (error) {
          // Ignore malformed SSE payloads and keep the connection alive.
          void error;
        }
      },
      () => undefined,
    );

    return () => {
      es.close();
    };
  }, []);
}
