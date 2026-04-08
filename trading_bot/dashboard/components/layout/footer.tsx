"use client";

import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { cn, timeAgo } from "@/lib/utils";

export function Footer() {
  const {
    heartbeat,
    connectionState,
    lastUpdatedAt,
    worstQuota,
    pauseReasons,
  } = useDashboardShell();
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "awaiting sync";

  return (
    <footer className="border-t border-bg-border/80 bg-bg-secondary/70">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-2 px-4 py-2 text-[10px] text-text-muted lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className={cn(
            connectionState === "online"
              ? "text-accent-green"
              : connectionState === "degraded"
                ? "text-accent-yellow"
                : "text-accent-red",
          )}>
            {connectionState}
          </span>
          {worstQuota ? (
            <span className={quotaTone(worstQuota.quotaStatus)}>
              {worstQuota.service} {worstQuota.quotaStatus.toLowerCase().replace("_", " ")}
            </span>
          ) : null}
          {pauseReasons.length > 0 ? <span className="text-accent-yellow">{pauseReasons.length} blockers</span> : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:justify-end">
          {heartbeat?.lastTradeAt ? <span>Trade {timeAgo(heartbeat.lastTradeAt)}</span> : null}
          {heartbeat?.lastSignalAt ? <span>Signal {timeAgo(heartbeat.lastSignalAt)}</span> : null}
          {heartbeat ? <span>Uptime {formatUptime(heartbeat.uptime)}</span> : null}
          <span>Updated {updatedLabel}</span>
        </div>
      </div>
    </footer>
  );
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }

  return `${hours}h ${minutes}m`;
}

function quotaTone(status: "HEALTHY" | "SOFT_LIMIT" | "HARD_LIMIT" | "PAUSED") {
  if (status === "HEALTHY") return "text-accent-green";
  if (status === "SOFT_LIMIT") return "text-accent-yellow";
  return "text-accent-red";
}
