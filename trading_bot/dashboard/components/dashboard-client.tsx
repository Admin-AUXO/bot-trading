"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { AlertTriangle, ArrowUpRight, CirclePause, Cpu, FlaskConical, RadioTower, RefreshCcw, Sparkles } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger, formatPercent, formatRelativeMinutes, formatTimestamp } from "@/lib/format";
import type { DeskHomePayload, DiagnosticsPayload, OperatorEvent } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";
import { CompactPageHeader, IconAction, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

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
      } catch (error) {
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
    <div className="space-y-4">
      {/* Header */}
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
        {/* Health Strip */}
        <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4 xl:grid-cols-6">
          {!home.readiness.allowed ? (
            <ScanStat label="Desk state" value={home.readiness.summary} detail={home.readiness.detail ?? "Blocker active"} tone="danger" />
          ) : (
            <>
              <ScanStat label="Realized today" value={formatCompactCurrency(home.performance.realizedPnlTodayUsd)} detail={`7d: ${formatCompactCurrency(home.performance.realizedPnl7dUsd)}`} tone={home.performance.realizedPnlTodayUsd >= 0 ? "accent" : "danger"} />
              <ScanStat label="Win rate 7d" value={formatPercent(home.performance.winRate7d * 100, 0)} detail={`Avg ${formatPercent(home.performance.avgReturnPct7d)}`} tone={home.performance.winRate7d >= 0.5 ? "accent" : "warning"} />
              <ScanStat label="Open slots" value={`${home.exposure.openPositions}/${home.exposure.maxOpenPositions}`} detail={`Cash ${formatCompactCurrency(home.exposure.cashUsd)}`} tone={home.exposure.openPositions > 0 ? "accent" : "default"} />
              <ScanStat label="Queue ready" value={formatInteger(home.queue.queuedCandidates)} detail="Candidates" tone={home.queue.queuedCandidates > 0 ? "warning" : "default"} />
              <ScanStat label="Provider" value={`${formatInteger(home.latency.providerAvgLatencyMsToday)} ms`} detail={`Exec ${formatInteger(home.latency.avgExecutionLatencyMs24h)} ms`} tone={home.latency.providerAvgLatencyMsToday > 1500 ? "warning" : "default"} />
            </>
          )}
        </div>
      </CompactPageHeader>

      {/* Alert */}
      {refreshError && (
        <div className="rounded-[12px] border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
          Desk refresh failed: {refreshError}
        </div>
      )}

      {/* Open Positions */}
      {home.positions && home.positions.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Live positions</span>
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">{home.positions.length}</span>
            </div>
            <Link href={`${operationalDeskRoutes.trading}?book=open` as Route} className="text-[11px] text-text-muted transition hover:text-accent">View all →</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {home.positions.slice(0, 6).map((pos) => (
              <Link key={pos.id} href={`/positions/${pos.id}` as Route} className="group rounded-[14px] border border-bg-border bg-[#101012] px-4 py-3 transition hover:border-[rgba(163,230,53,0.25)] hover:bg-[#111113]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{pos.symbol}</span>
                      <StatusPill value={pos.status} />
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-text-muted">{pos.mint.slice(0, 6)}…{pos.mint.slice(-4)}</div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted transition group-hover:text-accent" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div><div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Entry</div><div className="mt-0.5 text-sm font-semibold text-text-primary">${pos.entryPriceUsd}</div></div>
                  <div><div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Return</div><div className={cn("mt-0.5 text-sm font-semibold", (pos.returnPct ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>{formatPercent(pos.returnPct ?? 0)}</div></div>
                  <div><div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Unrealized</div><div className={cn("mt-0.5 text-sm font-semibold", (pos.unrealizedPnlUsd ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>{formatCompactCurrency(pos.unrealizedPnlUsd ?? 0)}</div></div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-text-muted">
                  <span>Opened {formatRelativeMinutes(pos.openedAt)}</span>
                  <span>{pos.interventionLabel ?? "—"}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 3-Panel Row */}
      <section className="grid gap-4 xl:grid-cols-3">
        {/* Pipeline */}
        <Panel title="Pipeline" eyebrow="Queue" description="Candidates across stages.">
          <div className="space-y-2">
            {home.queue.buckets.filter((b) => b.count > 0 || b.bucket === "ready").map((bucket) => (
              <div key={bucket.bucket} className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-bg-hover/35 px-3 py-2.5">
                <div className="flex items-center gap-2"><StatusPill value={bucket.bucket} /><span className="text-sm font-medium text-text-primary">{bucket.label}</span></div>
                <span className={cn("text-sm font-semibold tabular-nums", bucket.count > 0 ? "text-text-primary" : "text-text-muted")}>{formatInteger(bucket.count)}</span>
              </div>
            ))}
            {home.queue.buckets.every((b) => b.count === 0) && <div className="py-2 text-xs text-text-muted">No candidates in queue.</div>}
          </div>
        </Panel>

        {/* Loop Status */}
        <Panel title="Loop status" eyebrow="Runtime" description="Last runs and guardrails." tone={home.diagnostics.status === "danger" ? "critical" : home.diagnostics.status === "warning" ? "warning" : "passive"} action={<IconAction href={operationalDeskRoutes.settings} icon={ArrowUpRight} label="Settings" title="Open settings" subtle />}>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              {[
                { label: "Discovery", ts: home.runtime.lastDiscoveryAt, icon: Sparkles },
                { label: "Evaluation", ts: home.runtime.lastEvaluationAt, icon: Cpu },
                { label: "Exit checks", ts: home.runtime.lastExitCheckAt, icon: CirclePause },
              ].map(({ label, ts, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
                  <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-text-muted" /><span className="text-xs text-text-secondary">{label}</span></div>
                  <span className="text-[11px] font-medium tabular-nums text-text-muted">{safeTs(ts, hydrated)}</span>
                </div>
              ))}
            </div>
            {home.guardrails.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-text-muted">Guardrails</div>
                <div className="flex flex-wrap gap-1.5">
                  {home.guardrails.map((gr) => (
                    <div key={gr.id} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold", gr.status === "ok" ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.1)] text-[var(--success)]" : gr.status === "warning" ? "border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.1)] text-[var(--warning)]" : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]")}>
                      <span>{gr.label}</span><span>{gr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
              <span className="text-xs text-text-secondary">Provider pace</span>
              <span className={cn("text-[11px] font-semibold tabular-nums", home.providerPressure.paceStatus === "ok" ? "text-[var(--success)]" : home.providerPressure.paceStatus === "warning" ? "text-[var(--warning)]" : "text-[var(--danger)]")}>
                {formatInteger(home.providerPressure.projectedMonthlyUnits)} / {formatInteger(home.providerPressure.monthlyBudgetUnits)}
              </span>
            </div>
          </div>
        </Panel>

        {/* Recent Events */}
        <Panel title="Recent events" eyebrow="Activity" description="Last 6 operator events." tone={events.some((e) => e.level !== "info") ? "warning" : "passive"}>
          {events.length === 0 ? (
            <div className="py-3 text-xs text-text-muted">No recent events.</div>
          ) : (
            <div className="space-y-1.5">
              {events.slice(0, 6).map((event) => (
                <div key={event.id} className="flex items-start justify-between gap-2 rounded-[10px] border border-bg-border bg-bg-hover/30 px-3 py-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className={cn("mt-0.5 rounded-[6px] border border-bg-border p-1", event.kind.includes("failure") || event.level === "warning" ? "bg-[rgba(251,113,133,0.1)] text-[var(--danger)]" : "bg-bg-primary/70 text-text-muted")}>
                      <EventIcon event={event} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-text-primary">{event.title}</div>
                      <div className="text-[10px] text-text-muted">{event.kind.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-text-muted">{formatRelativeMinutes(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* PNL Widget */}
      <DeskPnlWidget performance={home.performance} events={events} />
    </div>
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
        <div><div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Today P&amp;L</div><div className={cn("text-xl font-bold tabular-nums", realizedPnlTodayUsd >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>{formatCompactCurrency(realizedPnlTodayUsd)}</div></div>
        <div className="h-8 w-px bg-bg-border" />
        <div><div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">7d P&amp;L</div><div className={cn("text-xl font-bold tabular-nums", realizedPnl7dUsd >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>{formatCompactCurrency(realizedPnl7dUsd)}</div></div>
        <div className="h-8 w-px bg-bg-border" />
        <div><div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Win rate 7d</div><div className={cn("text-xl font-bold tabular-nums", winRate7d >= 0.5 ? "text-[var(--accent)]" : "text-[var(--warning)]")}>{formatPercent(winRate7d * 100, 0)}</div></div>
        <div className="h-8 w-px bg-bg-border" />
        <div><div className="text-[10px] uppercase tracking-[0.14em] text-text-muted">Avg return</div><div className={cn("text-xl font-bold tabular-nums", avgReturnPct7d >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>{formatPercent(avgReturnPct7d)}</div></div>
      </div>
      {dailyData.length > 0 && (
        <div>
          <div className="mb-2 flex h-16 items-end gap-1">
            {dailyData.map((day) => {
              const heightPct = (Math.abs(day.value) / maxAbs) * 100;
              const isPositive = day.value >= 0;
              return (
                <div key={day.label} className="group/node relative flex flex-1 flex-col items-center justify-end">
                  <div className={cn("w-full rounded-[3px] transition-all hover:opacity-80", isPositive ? "bg-[var(--accent)]/60 hover:bg-[var(--accent)]" : "bg-[var(--danger)]/60 hover:bg-[var(--danger)]")} style={{ height: `${Math.max(heightPct, 4)}%` }} />
                  <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden whitespace-nowrap rounded-[6px] border border-bg-border bg-bg-card px-2 py-1 text-[10px] font-medium text-text-primary shadow-lg group-hover/node:block">{formatCompactCurrency(day.value)}</div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {dailyData.map((day) => (
              <div key={day.label} className="flex-1 text-center"><div className="text-[9px] text-text-muted">{day.label.split(",")[0]}</div></div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function EventIcon(props: { event: OperatorEvent }) {
  if (props.event.kind.includes("research")) return <FlaskConical className="h-3.5 w-3.5" />;
  if (props.event.kind.includes("control") || props.event.kind.includes("pause") || props.event.kind.includes("resume")) return <CirclePause className="h-3.5 w-3.5" />;
  if (props.event.kind.includes("failure") || props.event.level !== "info") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <RadioTower className="h-3.5 w-3.5" />;
}

function safeTs(value: string | null | undefined, hydrated: boolean): string {
  if (!value) return "—";
  return hydrated ? formatTimestamp(value) : "…";
}
