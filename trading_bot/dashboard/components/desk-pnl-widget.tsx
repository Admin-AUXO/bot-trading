"use client";

import React from "react";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { DeskHomePayload, OperatorEvent } from "@/lib/types";

function dailyPnlFromEvents(events: OperatorEvent[]): Array<{ label: string; value: number }> {
  const buckets: Record<string, number> = {};
  for (const event of events) {
    if (event.kind !== "position_closed") continue;
    // Extract a simple date label from createdAt — use day-of-week for brevity
    const date = new Date(event.createdAt);
    const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const pnl = typeof event.detail === "string"
      ? parseFloat(event.detail.replace(/[^0-9.-]/g, "")) || 0
      : 0;
    buckets[label] = (buckets[label] ?? 0) + pnl;
  }
  return Object.entries(buckets).slice(-7).map(([label, value]) => ({ label, value }));
}

export function DeskPnlWidget(props: {
  performance: DeskHomePayload["performance"];
  events: OperatorEvent[];
}) {
  const { realizedPnlTodayUsd, realizedPnl7dUsd, winRate7d, avgReturnPct7d } = props.performance;
  const dailyData = dailyPnlFromEvents(props.events);
  const maxAbs = Math.max(...dailyData.map((d) => Math.abs(d.value)), 1);

  return (
    <div className="rounded-[18px] border border-bg-border bg-bg-card p-5">
      <div className="section-kicker">Performance</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Today P&amp;L</div>
          <div className={`mt-1 text-lg font-bold ${realizedPnlTodayUsd >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
            {formatCompactCurrency(realizedPnlTodayUsd)}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">7d P&amp;L</div>
          <div className={`mt-1 text-lg font-bold ${realizedPnl7dUsd >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
            {formatCompactCurrency(realizedPnl7dUsd)}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Win rate 7d</div>
          <div className={`mt-1 text-lg font-bold ${winRate7d >= 0.5 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
            {formatPercent(winRate7d * 100, 0)}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Avg return 7d</div>
          <div className={`mt-1 text-lg font-bold ${avgReturnPct7d >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
            {formatPercent(avgReturnPct7d)}
          </div>
        </div>
      </div>

      {dailyData.length > 0 && (
        <div className="mt-5">
          <div className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">Daily P&amp;L (last 7 events)</div>
          <div className="mt-2 flex h-14 items-end gap-1">
            {dailyData.map((day) => {
              const heightPct = (Math.abs(day.value) / maxAbs) * 100;
              const isPositive = day.value >= 0;
              return (
                <div key={day.label} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className={`w-full rounded-[3px] transition-all ${isPositive ? "bg-[var(--accent)]/50 hover:bg-[var(--accent)]" : "bg-[var(--danger)]/50 hover:bg-[var(--danger)]"}`}
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                    title={`${day.label}: ${formatCompactCurrency(day.value)}`}
                  />
                  <div className="hidden group-hover:block absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-bg-border bg-bg-card px-2 py-1 text-[10px] font-medium text-text-primary shadow-lg z-10">
                    {formatCompactCurrency(day.value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
