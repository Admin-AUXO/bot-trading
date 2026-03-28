"use client";

import { AlertTriangle, WifiOff } from "lucide-react";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { timeAgo } from "@/lib/utils";

export function ConnectionBanner() {
  const { connectionState, lastUpdatedAt } = useDashboardShell();
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "a recent sync";

  if (connectionState === "online") return null;

  return (
    <div
      className={`border-b px-4 py-2 text-xs ${
        connectionState === "degraded"
          ? "border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow"
          : "border-accent-red/30 bg-accent-red/15 text-accent-red"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1680px] items-center justify-center gap-2 text-center">
        {connectionState === "degraded" ? (
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span>
          {connectionState === "degraded"
            ? `Realtime updates degraded — showing cached data from ${updatedLabel}.`
            : "Backend unavailable — reconnecting to the dashboard services."}
        </span>
      </div>
    </div>
  );
}
