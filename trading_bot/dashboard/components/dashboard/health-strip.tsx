"use client";

import type { DeskHomePayload } from "@/lib/types";
import { formatCompactCurrency, formatInteger, formatPercent } from "@/lib/format";
import { ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { useHydrated } from "@/lib/use-hydrated";

interface HealthStripProps {
  home: DeskHomePayload;
}

export function HealthStrip({ home }: HealthStripProps) {
  const hydrated = useHydrated();

  if (!home.readiness.allowed) {
    return (
      <ScanStat
        label="Desk state"
        value={home.readiness.summary}
        detail={home.readiness.detail ?? "Blocker active"}
        tone="danger"
      />
    );
  }

  return (
    <>
      <ScanStat
        label="Realized today"
        value={formatCompactCurrency(home.performance.realizedPnlTodayUsd)}
        detail={`7d: ${formatCompactCurrency(home.performance.realizedPnl7dUsd)}`}
        tone={home.performance.realizedPnlTodayUsd >= 0 ? "accent" : "danger"}
      />
      <ScanStat
        label="Win rate 7d"
        value={formatPercent(home.performance.winRate7d * 100, 0)}
        detail={`Avg ${formatPercent(home.performance.avgReturnPct7d)}`}
        tone={home.performance.winRate7d >= 0.5 ? "accent" : "warning"}
      />
      <ScanStat
        label="Open slots"
        value={`${home.exposure.openPositions}/${home.exposure.maxOpenPositions}`}
        detail={`Cash ${formatCompactCurrency(home.exposure.cashUsd)}`}
        tone={home.exposure.openPositions > 0 ? "accent" : "default"}
      />
      <ScanStat
        label="Queue ready"
        value={formatInteger(home.queue.queuedCandidates)}
        detail="Candidates"
        tone={home.queue.queuedCandidates > 0 ? "warning" : "default"}
      />
      <ScanStat
        label="Provider"
        value={`${formatInteger(home.latency.providerAvgLatencyMsToday)} ms`}
        detail={`Exec ${formatInteger(home.latency.avgExecutionLatencyMs24h)} ms`}
        tone={home.latency.providerAvgLatencyMsToday > 1500 ? "warning" : "default"}
      />
    </>
  );
}
