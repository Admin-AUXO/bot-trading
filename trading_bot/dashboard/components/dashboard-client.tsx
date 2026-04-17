"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { ArrowUpRight, RefreshCcw } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger, formatPercent, formatTimestamp } from "@/lib/format";
import type { DeskHomePayload, DiagnosticsPayload, OperatorEvent } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";
import { CompactPageHeader, StatusPill } from "@/components/dashboard-primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { ErrorBoundary } from "@/components/error-boundary";
import { HealthStrip } from "@/components/dashboard/health-strip";
import { PositionsSummary } from "@/components/dashboard/positions-summary";
import { PipelinePanel, LoopStatusPanel } from "@/components/dashboard/pipeline-panel";
import { EventsList } from "@/components/dashboard/events-list";

export function DashboardClient(props: {
  initialHome: DeskHomePayload;
  initialEvents: OperatorEvent[];
  initialDiagnostics: DiagnosticsPayload;
  grafanaHref: string | null;
}) {
  const [home, setHome] = useState<DeskHomePayload>(props.initialHome);
  const [events, setEvents] = useState<OperatorEvent[]>(props.initialEvents);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsPayload>(props.initialDiagnostics);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const refresh = useEffectEvent(() => {
    startTransition(async () => {
      try {
        const [nextHome, nextEvents, nextDiagnostics] = await Promise.all([
          fetchJson<DeskHomePayload>("/desk/home"),
          fetchJson<OperatorEvent[]>("/desk/events?limit=20"),
          fetchJson<DiagnosticsPayload>("/operator/diagnostics"),
        ]);
        setHome(nextHome);
        setEvents(nextEvents);
        setDiagnostics(nextDiagnostics);
        setRefreshError(null);
        setIsStale(false);
      } catch (error) {
        setIsStale(true);
        setRefreshError(error instanceof Error ? error.message : "refresh failed");
      }
    });
  });

  useEffect(() => {
    const timer = window.setInterval(() => refresh(), 15_000);
    const onDeskRefresh = () => refresh();
    window.addEventListener("desk-refresh", onDeskRefresh);
    return () => { window.clearInterval(timer); window.removeEventListener("desk-refresh", onDeskRefresh); };
  }, [refresh]);

  return (
    <ErrorBoundary>
    <div className="space-y-4">
      <CompactPageHeader
        eyebrow="Control"
        title="Desk"
        badges={<><StatusPill value={home.readiness.allowed ? "ready" : "blocked"} /><StatusPill value={home.diagnostics.status} /></>}
        actions={
          <>
            <Button onClick={() => refresh()} variant="ghost" size="sm">
              <RefreshCcw className={cn("h-4 w-4", isPending && "animate-spin")} />
              {isPending ? "Syncing" : "Sync"}
            </Button>
            <Link href={operationalDeskRoutes.trading} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center gap-2")}>
              <ArrowUpRight className="h-4 w-4" />Lifecycle
            </Link>
            {props.grafanaHref && (
              <a href={props.grafanaHref} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "default", size: "sm" }), "inline-flex items-center gap-2")}>
                Grafana<ArrowUpRight className="h-4 w-4" />
              </a>
            )}
          </>
        }
      >
        <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4 xl:grid-cols-6">
          <HealthStrip home={home} />
        </div>
      </CompactPageHeader>

      {refreshError && (
        <div className="rounded-[12px] border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
          Desk refresh failed: {refreshError}
        </div>
      )}
      {isStale && !refreshError && (
        <div className="rounded-[12px] border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] px-4 py-3 text-sm text-[var(--warning)]">
          Data may be outdated — last refresh failed
        </div>
      )}

      <PositionsSummary positions={home.positions} />

      <section className="grid gap-4 xl:grid-cols-3">
        <PipelinePanel home={home} />
        <LoopStatusPanel home={home} />
        <EventsList events={events} />
      </section>

      <DeskPnlWidget performance={home.performance} events={events} />
    </div>
    </ErrorBoundary>
  );
}

function DeskPnlWidget(props: { performance: DeskHomePayload["performance"]; events: OperatorEvent[] }) {
  const { realizedPnlTodayUsd, realizedPnl7dUsd, winRate7d, avgReturnPct7d } = props.performance;

  const dailyData = (() => {
    const buckets: Record<string, number> = {};
    for (const event of props.events) {
      if (event.kind !== "position_closed") continue;
      const date = new Date(event.createdAt);
      const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const pnl = typeof event.detail === "string" ? parseFloat(event.detail.replace(/[^0-9.-]/g, "")) || 0 : 0;
      buckets[label] = (buckets[label] ?? 0) + pnl;
    }
    return Object.entries(buckets).slice(-7).map(([label, value]) => ({ label, value }));
  })();

  const maxAbs = Math.max(...dailyData.map((d) => Math.abs(d.value)), 1);

  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Today P&amp;L</div>
          <div className={cn("text-xl font-bold tabular-nums", realizedPnlTodayUsd >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
            {formatCompactCurrency(realizedPnlTodayUsd)}
          </div>
        </div>
        <div className="h-8 w-px bg-bg-border" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">7d P&amp;L</div>
          <div className={cn("text-xl font-bold tabular-nums", realizedPnl7dUsd >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
            {formatCompactCurrency(realizedPnl7dUsd)}
          </div>
        </div>
        <div className="h-8 w-px bg-bg-border" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Win rate 7d</div>
          <div className={cn("text-xl font-bold tabular-nums", winRate7d >= 0.5 ? "text-[var(--accent)]" : "text-[var(--warning)]")}>
            {formatPercent(winRate7d * 100, 0)}
          </div>
        </div>
        <div className="h-8 w-px bg-bg-border" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Avg return</div>
          <div className={cn("text-xl font-bold tabular-nums", avgReturnPct7d >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
            {formatPercent(avgReturnPct7d)}
          </div>
        </div>
      </div>
      {dailyData.length > 0 && (
        <div>
          <div className="mb-2 flex h-16 items-end gap-1">
            {dailyData.map((day) => {
              const heightPct = (Math.abs(day.value) / maxAbs) * 100;
              const isPositive = day.value >= 0;
              return (
                <div key={day.label} className="group/node relative flex flex-1 flex-col items-center justify-end">
                  <div
                    className={cn(
                      "w-full rounded-[3px] transition-all hover:opacity-80",
                      isPositive ? "bg-[var(--accent)]/60 hover:bg-[var(--accent)]" : "bg-[var(--danger)]/60 hover:bg-[var(--danger)]"
                    )}
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                  />
                  <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden whitespace-nowrap rounded-[6px] border border-bg-border bg-bg-card px-2 py-1 text-[10px] font-medium text-text-primary shadow-lg group-hover/node:block">
                    {formatCompactCurrency(day.value)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {dailyData.map((day) => (
              <div key={day.label} className="flex-1 text-center">
                <div className="text-[9px] text-text-muted">{day.label.split(",")[0]}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
