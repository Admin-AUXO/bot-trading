"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CirclePause,
  Cpu,
  FlaskConical,
  RadioTower,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger, formatPercent, formatRelativeMinutes, formatTimestamp } from "@/lib/format";
import type { AdaptiveModelState, DeskHomePayload, DiagnosticsPayload, OperatorEvent } from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";
import { CompactPageHeader, DataTable, IconAction, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";

export function DashboardClient(props: {
  initialHome: DeskHomePayload;
  initialEvents: OperatorEvent[];
  initialDiagnostics: DiagnosticsPayload;
  grafanaHref: string | null;
}) {
  const [home, setHome] = useState(() => normalizeHomePayload(props.initialHome));
  const [events, setEvents] = useState(props.initialEvents);
  const [diagnostics, setDiagnostics] = useState(props.initialDiagnostics);
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
        setHome(normalizeHomePayload(nextHome));
        setEvents(nextEvents);
        setDiagnostics(nextDiagnostics);
        setRefreshError(null);
      } catch (error) {
        setRefreshError(error instanceof Error ? error.message : "desk refresh failed");
      }
    });
  });

  useEffect(() => {
    const timer = window.setInterval(() => refresh(), 15_000);
    const onDeskRefresh = () => refresh();
    window.addEventListener("desk-refresh", onDeskRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("desk-refresh", onDeskRefresh);
    };
  }, [refresh]);

  const openPositions = home.positions ?? [];

  return (
    <div className="space-y-4">

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <CompactPageHeader
        eyebrow="Control"
        title="Desk"
        badges={(
          <>
            <StatusPill value={home.readiness.allowed ? "ready" : "blocked"} />
            <StatusPill value={home.diagnostics.status} />
            {home.adaptiveModel.enabled
              ? <StatusPill value="adaptive_on" />
              : null}
          </>
        )}
        actions={(
          <>
            <Button onClick={() => refresh()} variant="ghost" size="sm" title="Refresh">
              <RefreshCcw className={cn("h-4 w-4", isPending && "animate-spin")} />
              {isPending ? "Syncing" : "Sync"}
            </Button>
            <Link
              href={operationalDeskRoutes.trading}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center gap-2")}
              title="Trading lifecycle"
            >
              <ArrowUpRight className="h-4 w-4" />
              Lifecycle
            </Link>
            {props.grafanaHref ? (
              <a
                href={props.grafanaHref}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "inline-flex items-center gap-2")}
                title="Grafana dashboard"
              >
                Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        )}
      >
        {/* ── HEALTH STRIP ───────────────────────────────────────────── */}
        <div className="mt-3 grid gap-2 grid-cols-2 sm:grid-cols-4 xl:grid-cols-6">
          {/* Readiness */}
          {!home.readiness.allowed ? (
            <ScanStat
              label="Desk state"
              value={home.readiness.summary}
              detail={home.readiness.detail ?? "A blocker is active"}
              tone="danger"
            />
          ) : (
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
                detail={`Avg return ${formatPercent(home.performance.avgReturnPct7d)}`}
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
                detail="Candidates waiting"
                tone={home.queue.queuedCandidates > 0 ? "warning" : "default"}
              />
              <ScanStat
                label="Provider"
                value={`${formatInteger(home.latency.providerAvgLatencyMsToday)} ms`}
                detail={`Exec ${formatInteger(home.latency.avgExecutionLatencyMs24h)} ms`}
                tone={home.latency.providerAvgLatencyMsToday > 1500 ? "warning" : "default"}
              />
            </>
          )}
        </div>
      </CompactPageHeader>

      {/* ── ALERTS ──────────────────────────────────────────────────────── */}
      {refreshError ? (
        <div className="rounded-[12px] border border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
          Desk refresh failed: {refreshError}
        </div>
      ) : null}

      {/* ── OPEN POSITIONS — always visible when positions exist ─────────── */}
      {openPositions.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Live positions</span>
              <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                {openPositions.length}
              </span>
            </div>
            <Link
              href={`${operationalDeskRoutes.trading}?book=open` as Route}
              className="text-[11px] text-text-muted transition hover:text-accent"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {openPositions.slice(0, 6).map((pos) => (
              <Link
                key={pos.id}
                href={`/positions/${pos.id}` as Route}
                className="group rounded-[14px] border border-bg-border bg-[#101012] px-4 py-3 transition hover:border-[rgba(163,230,53,0.25)] hover:bg-[#111113]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{pos.symbol}</span>
                      <StatusPill value={pos.status} />
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted font-mono">{pos.mint.slice(0, 6)}…{pos.mint.slice(-4)}</div>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-text-muted transition group-hover:text-accent" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Entry</div>
                    <div className="mt-0.5 text-sm font-semibold text-text-primary">${pos.entryPriceUsd}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Return</div>
                    <div className={cn("mt-0.5 text-sm font-semibold", (pos.returnPct ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
                      {formatPercent(pos.returnPct ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-text-muted">Unrealized</div>
                    <div className={cn("mt-0.5 text-sm font-semibold", (pos.unrealizedPnlUsd ?? 0) >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
                      {formatCompactCurrency(pos.unrealizedPnlUsd ?? 0)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[10px] text-text-muted">
                    Opened {formatRelativeMinutes(pos.openedAt)}
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {pos.interventionLabel ?? "—"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── THREE COLUMN SCAN ROW ──────────────────────────────────────── */}
      <section className="grid gap-4 xl:grid-cols-3">

        {/* Column 1: Pipeline health */}
        <Panel
          title="Pipeline"
          eyebrow="Queue"
          description="Candidates across evaluation stages."
        >
          <div className="space-y-2">
            {home.queue.buckets
              .filter((b) => b.count > 0 || b.bucket === "ready")
              .map((bucket) => (
                <div
                  key={bucket.bucket}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-bg-hover/35 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <StatusPill value={bucket.bucket} />
                    <span className="text-sm font-medium text-text-primary">{bucket.label}</span>
                  </div>
                  <span className={cn(
                    "text-sm font-semibold tabular-nums",
                    bucket.count > 0 ? "text-text-primary" : "text-text-muted"
                  )}>
                    {formatInteger(bucket.count)}
                  </span>
                </div>
              ))}
            {home.queue.buckets.every((b) => b.count === 0) ? (
              <div className="py-2 text-xs text-text-muted">No candidates in queue.</div>
            ) : null}
          </div>
        </Panel>

        {/* Column 2: Loop status + guardrails */}
        <Panel
          title="Loop status"
          eyebrow="Runtime"
          description="Last run timestamps and guardrail state."
          tone={home.diagnostics.status === "danger" ? "critical" : home.diagnostics.status === "warning" ? "warning" : "passive"}
          action={<IconAction href={operationalDeskRoutes.settings} icon={ArrowUpRight} label="Settings" title="Open runtime settings" subtle />}
        >
          <div className="space-y-3">
            {/* Loop timestamps */}
            <div className="grid gap-1.5">
              {[
                { label: "Discovery", ts: home.runtime.lastDiscoveryAt, icon: Sparkles },
                { label: "Evaluation", ts: home.runtime.lastEvaluationAt, icon: Cpu },
                { label: "Exit checks", ts: home.runtime.lastExitCheckAt, icon: CirclePause },
              ].map(({ label, ts, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-text-muted" />
                    <span className="text-xs text-text-secondary">{label}</span>
                  </div>
                  <span className="text-[11px] font-medium tabular-nums text-text-muted">
                    {safeClientTimestamp(ts, hydrated, "—")}
                  </span>
                </div>
              ))}
            </div>

            {/* Guardrails */}
            {home.guardrails.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-text-muted">Guardrails</div>
                <div className="flex flex-wrap gap-1.5">
                  {home.guardrails.map((gr) => (
                    <div
                      key={gr.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold",
                        gr.status === "ok"
                          ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.1)] text-[var(--success)]"
                          : gr.status === "warning"
                            ? "border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.1)] text-[var(--warning)]"
                            : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]",
                      )}
                    >
                      <span>{gr.label}</span>
                      <span>{gr.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Adaptive model pill */}
            <div className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
              <span className="text-xs text-text-secondary">Adaptive model</span>
              <StatusPill value={home.adaptiveModel.enabled ? "enabled" : home.adaptiveModel.status} />
            </div>

            {/* Provider pace */}
            <div className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
              <span className="text-xs text-text-secondary">Provider pace</span>
              <span className={cn(
                "text-[11px] font-semibold tabular-nums",
                home.providerPressure.paceStatus === "ok" ? "text-[var(--success)]"
                  : home.providerPressure.paceStatus === "warning" ? "text-[var(--warning)]"
                  : "text-[var(--danger)]"
              )}>
                {formatInteger(home.providerPressure.projectedMonthlyUnits)} / {formatInteger(home.providerPressure.monthlyBudgetUnits)}
              </span>
            </div>
          </div>
        </Panel>

        {/* Column 3: Recent events */}
        <Panel
          title="Recent events"
          eyebrow="Activity"
          description="Last 6 operator events."
          tone={events.some((e) => e.level !== "info") ? "warning" : "passive"}
        >
          {events.length === 0 ? (
            <div className="py-3 text-xs text-text-muted">No recent events.</div>
          ) : (
            <div className="space-y-1.5">
              {events.slice(0, 6).map((event) => (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-2 rounded-[10px] border border-bg-border bg-bg-hover/30 px-3 py-2"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <div className={cn(
                      "mt-0.5 rounded-[6px] border border-bg-border p-1",
                      event.kind.includes("failure") || event.level === "warning" || event.level === "danger"
                        ? "bg-[rgba(251,113,133,0.1)] text-[var(--danger)]"
                        : "bg-bg-primary/70 text-text-muted"
                    )}>
                      <EventIcon event={event} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-medium text-text-primary">{event.title}</div>
                      <div className="text-[10px] text-text-muted">{event.kind.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-[10px] tabular-nums text-text-muted">
                    {formatRelativeMinutes(event.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>

      {/* ── PNL WIDGET — below the scan row ──────────────────────────────── */}
      <DeskPnlWidget performance={home.performance} events={events} />

      {/* ── DIAGNOSTICS — collapsed unless there are issues ───────────────── */}
      {diagnostics.issues.length > 0 || diagnostics.providerRows.length > 0 || diagnostics.endpointRows.length > 0 ? (
        <details className="group rounded-[14px] border border-bg-border bg-bg-secondary">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-text-primary">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-4 w-4 text-[var(--warning)]" />
              <span>Diagnostics — {diagnostics.issues.length} issue{diagnostics.issues.length !== 1 ? "s" : ""}</span>
              {diagnostics.providerRows.length > 0 && (
                <span className="text-[11px] text-text-muted">{diagnostics.providerRows.length} provider{diagnostics.providerRows.length !== 1 ? "s" : ""}</span>
              )}
              {diagnostics.endpointRows.length > 0 && (
                <span className="text-[11px] text-text-muted">{diagnostics.endpointRows.length} endpoint{diagnostics.endpointRows.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            <span className="text-xs text-text-muted group-open:hidden">Expand</span>
            <span className="hidden text-xs text-text-muted group-open:inline">Collapse</span>
          </summary>
          <div className="space-y-4 px-4 pb-4">
            {diagnostics.issues.length > 0 && (
              <div className="grid gap-2">
                {diagnostics.issues.map((issue) => (
                  <div key={issue.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-bg-border bg-bg-hover/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusPill value={issue.level} />
                      <span className="text-sm font-medium text-text-primary">{issue.label}</span>
                    </div>
                    <span className="text-xs text-text-muted text-right max-w-xs">{issue.detail}</span>
                  </div>
                ))}
              </div>
            )}
            {diagnostics.providerRows.length > 0 && (
              <DataTable
                title="Provider pressure"
                eyebrow="Today"
                rows={diagnostics.providerRows}
                maxRows={5}
                preferredKeys={["provider", "total_calls", "total_units", "avg_latency_ms", "error_count"]}
                panelTone={diagnostics.summary.providerErrors > 0 ? "warning" : "default"}
              />
            )}
            {diagnostics.endpointRows.length > 0 && (
              <DataTable
                title="Endpoint faults"
                eyebrow="Hot endpoints"
                rows={diagnostics.endpointRows}
                maxRows={5}
                preferredKeys={["provider", "endpoint", "total_calls", "avg_latency_ms", "error_count"]}
                panelTone={diagnostics.summary.latestPayloadFailures > 0 ? "warning" : "default"}
              />
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────────

function DeskPnlWidget(props: {
  performance: DeskHomePayload["performance"];
  events: OperatorEvent[];
}) {
  const { realizedPnlTodayUsd, realizedPnl7dUsd, winRate7d, avgReturnPct7d } = props.performance;

  // Build daily PnL from close events
  const dailyData = (() => {
    const buckets: Record<string, number> = {};
    for (const event of props.events) {
      if (event.kind !== "position_closed") continue;
      const date = new Date(event.createdAt);
      const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const pnl = typeof event.detail === "string"
        ? parseFloat(event.detail.replace(/[^0-9.-]/g, "")) || 0
        : 0;
      buckets[label] = (buckets[label] ?? 0) + pnl;
    }
    return Object.entries(buckets).slice(-7).map(([label, value]) => ({ label, value }));
  })();

  const maxAbs = Math.max(...dailyData.map((d) => Math.abs(d.value)), 1);

  return (
    <section className="rounded-[14px] border border-bg-border bg-bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
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
                      isPositive
                        ? "bg-[var(--accent)]/60 hover:bg-[var(--accent)]"
                        : "bg-[var(--danger)]/60 hover:bg-[var(--danger)]"
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
    </section>
  );
}

function EventIcon(props: { event: OperatorEvent }) {
  if (props.event.kind.includes("research")) return <FlaskConical className="h-3.5 w-3.5" />;
  if (props.event.kind.includes("control") || props.event.kind.includes("pause") || props.event.kind.includes("resume")) {
    return <CirclePause className="h-3.5 w-3.5" />;
  }
  if (props.event.kind.includes("failure") || props.event.level !== "info") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <RadioTower className="h-3.5 w-3.5" />;
}

function safeClientTimestamp(value: string | null | undefined, hydrated: boolean, fallback = "—"): string {
  if (!value) return fallback;
  return hydrated ? formatTimestamp(value) : "…";
}

function normalizeHomePayload(home: DeskHomePayload): DeskHomePayload {
  return {
    ...home,
    positions: home.positions ?? [],
    performance: home.performance ?? {
      realizedPnlTodayUsd: 0,
      realizedPnl7dUsd: 0,
      winRate7d: 0,
      avgReturnPct7d: 0,
      avgHoldMinutes7d: 0,
    },
    latency: home.latency ?? {
      providerAvgLatencyMsToday: 0,
      hotEndpointAvgLatencyMsToday: 0,
      avgExecutionLatencyMs24h: 0,
      p95ExecutionLatencyMs24h: 0,
      avgExecutionSlippageBps24h: 0,
    },
    runtime: home.runtime ?? {
      lastDiscoveryAt: null,
      lastEvaluationAt: null,
      lastExitCheckAt:  null,
    },
    queue: home.queue ?? {
      queuedCandidates: 0,
      buckets: [
        { bucket: "ready",    count: 0, label: "Ready" },
        { bucket: "risk",     count: 0, label: "Blocked by risk" },
        { bucket: "provider", count: 0, label: "Blocked by provider" },
        { bucket: "data",     count: 0, label: "Blocked by data" },
      ],
    },
    adaptiveModel: home.adaptiveModel ?? {
      status: "inactive",
      automationUsesAdaptive: false,
      enabled: false,
      sourceRunId: null,
      packId: null,
      packName: null,
      dominantMode: null,
      dominantPresetId: null,
      winnerCount: 0,
      bandCount: 0,
      calibrationConfidence: null,
      staleWarning: "Adaptive model data is unavailable.",
      degradedWarning: "Adaptive model data is unavailable.",
      warnings: ["Adaptive model data is unavailable."],
      updatedAt: null,
    },
  };
}
