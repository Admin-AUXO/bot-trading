"use client";

import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { cn, formatUsd, timeAgo } from "@/lib/utils";

export function Footer() {
  const {
    mode,
    heartbeat,
    operatorAccess,
    connectionState,
    overview,
    openPnlUsd,
    lastUpdatedAt,
  } = useDashboardShell();
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "awaiting sync";

  return (
    <footer className="border-t border-bg-border/80 bg-bg-secondary/70">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-2 px-4 py-2 text-[10px] text-text-muted lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Solana Bot v1.0</span>
          <span className={mode === "LIVE" ? "text-accent-green" : "text-accent-yellow"}>
            {mode === "LIVE" ? "LIVE" : "SIMULATION"}
          </span>
          <span>Operator {operatorAccess}</span>
          <span className={cn(
            connectionState === "online"
              ? "text-accent-green"
              : connectionState === "degraded"
                ? "text-accent-yellow"
                : "text-accent-red",
          )}>
            {connectionState}
          </span>
          <span className={cn("tabular-nums", openPnlUsd === 0 ? "" : openPnlUsd > 0 ? "text-accent-green" : "text-accent-red")}>
            Open P&L {formatUsd(openPnlUsd)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:justify-end">
          {heartbeat?.lastTradeAt ? <span>Trade {timeAgo(heartbeat.lastTradeAt)}</span> : null}
          {heartbeat?.lastSignalAt ? <span>Signal {timeAgo(heartbeat.lastSignalAt)}</span> : null}
          {heartbeat ? <span>Uptime {formatUptime(heartbeat.uptime)}</span> : null}
          {overview ? <span>Capital {formatUsd(overview.capitalUsd)}</span> : null}
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
