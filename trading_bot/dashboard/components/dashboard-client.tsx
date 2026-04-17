"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { ArrowUpRight, RefreshCcw } from "lucide-react";
import { fetchJson } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import {
  formatCompactCurrency,
  formatInteger,
  formatPercent,
  formatRelativeMinutes,
  formatTimestamp,
} from "@/lib/format";
import type { DeskHomePayload, OperatorEvent } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  CompactPageHeader,
  Panel,
  ScanStat,
  StatusPill,
} from "@/components/dashboard-primitives";
import { HealthStrip } from "@/components/dashboard/health-strip";
import { PositionsSummary } from "@/components/dashboard/positions-summary";

export function DashboardClient(props: {
  initialHome: DeskHomePayload;
  initialEvents: OperatorEvent[];
  grafanaHref: string | null;
}) {
  const [home, setHome] = useState(props.initialHome);
  const [events, setEvents] = useState(props.initialEvents);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isPending, startTransition] = useTransition();

  const refresh = useEffectEvent(() => {
    startTransition(async () => {
      try {
        const [nextHome, nextEvents] = await Promise.all([
          fetchJson<DeskHomePayload>("/desk/home"),
          fetchJson<OperatorEvent[]>("/desk/events?limit=20"),
        ]);
        setHome(nextHome);
        setEvents(nextEvents);
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
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("desk-refresh", onDeskRefresh);
    };
  }, [refresh]);

  const nextActions = buildNextActions(home, events);
  const recentEvents = events.slice(0, 6);
  const pnlTrend = buildPnlTrend(events);

  return (
    <ErrorBoundary>
      <div className="space-y-4">
        <CompactPageHeader
          eyebrow="Control"
          title="Desk"
          badges={
            <>
              <StatusPill value={home.readiness.allowed ? "ready" : "blocked"} />
              <StatusPill value={home.diagnostics.status} />
            </>
          }
          actions={
            <>
              <Button onClick={() => refresh()} variant="ghost" size="sm">
                <RefreshCcw className={cn("h-4 w-4", isPending && "animate-spin")} />
                {isPending ? "Syncing" : "Sync"}
              </Button>
              <Link
                href={operationalDeskRoutes.trading}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center gap-2")}
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
                >
                  Grafana
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : null}
            </>
          }
        >
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 xl:grid-cols-6">
            <HealthStrip home={home} />
          </div>
        </CompactPageHeader>

        {refreshError ? (
          <Notice tone="danger">Desk refresh failed: {refreshError}</Notice>
        ) : null}
        {isStale && !refreshError ? (
          <Notice tone="warning">Data may be stale. Last refresh missed.</Notice>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.95fr)]">
          <Panel
            title="Next actions"
            eyebrow="Priority order"
            description="What needs attention first."
            tone={home.readiness.allowed ? "default" : "critical"}
          >
            <div className="space-y-2">
              {nextActions.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-[12px] border px-3 py-3",
                    item.tone === "danger"
                      ? "border-[rgba(251,113,133,0.24)] bg-[#151012]"
                      : item.tone === "warning"
                        ? "border-[rgba(250,204,21,0.2)] bg-[#14120f]"
                        : "border-bg-border bg-bg-hover/25",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusPill value={item.pill} />
                      <div className="truncate text-sm font-semibold text-text-primary">{item.label}</div>
                    </div>
                    {item.meta ? <div className="text-[11px] text-text-muted">{item.meta}</div> : null}
                  </div>
                  {item.detail ? <div className="mt-1 text-xs text-text-secondary">{item.detail}</div> : null}
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="System state"
            eyebrow="Live checks"
            description="Risk, pace, and loop freshness."
            tone={home.diagnostics.status === "danger" ? "critical" : home.diagnostics.status === "warning" ? "warning" : "passive"}
          >
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <ScanStat
                label="Cash"
                value={formatCompactCurrency(home.exposure.cashUsd)}
                detail={`Capital ${formatCompactCurrency(home.exposure.capitalUsd)}`}
                tone="default"
              />
              <ScanStat
                label="Provider pace"
                value={`${formatInteger(home.providerPressure.projectedMonthlyUnits)} / ${formatInteger(home.providerPressure.monthlyBudgetUnits)}`}
                detail={`${home.providerPressure.laneStatus.length} tracked lanes`}
                tone={home.providerPressure.paceStatus === "danger" ? "danger" : home.providerPressure.paceStatus === "warning" ? "warning" : "accent"}
              />
              <ScanStat
                label="Discovery"
                value={safeTimestamp(home.runtime.lastDiscoveryAt)}
                detail={`Evaluation ${safeTimestamp(home.runtime.lastEvaluationAt)}`}
                tone={home.diagnostics.staleComponents.includes("discovery") ? "warning" : "default"}
              />
              <ScanStat
                label="Exit checks"
                value={safeTimestamp(home.runtime.lastExitCheckAt)}
                detail={`${home.guardrails.length} active guardrails`}
                tone="default"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {home.guardrails.map((guardrail) => (
                <div
                  key={guardrail.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold",
                    guardrail.status === "ok"
                      ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.1)] text-[var(--success)]"
                      : guardrail.status === "warning"
                        ? "border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.1)] text-[var(--warning)]"
                        : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]"
                  )}
                >
                  <span>{guardrail.label}</span>
                  <span>{guardrail.value}</span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <PositionsSummary positions={home.positions} />

        <section className="grid gap-4 xl:grid-cols-2">
          <DisclosurePanel title="Recent events" description="Secondary evidence. Keep closed unless you need the tape.">
            {recentEvents.length > 0 ? (
              <div className="space-y-1.5">
                {recentEvents.map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-3 rounded-[10px] border border-bg-border bg-bg-hover/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill value={event.level} />
                        <div className="truncate text-sm font-medium text-text-primary">{event.title}</div>
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {event.detail ?? event.kind.replace(/_/g, " ")}
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-text-muted">{formatRelativeMinutes(event.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-muted">No recent events.</div>
            )}
          </DisclosurePanel>

          <DisclosurePanel title="Performance strip" description="Short-term PnL view without turning the page into a chart graveyard.">
            <div className="grid gap-2 sm:grid-cols-2">
              <ScanStat
                label="Today PnL"
                value={formatCompactCurrency(home.performance.realizedPnlTodayUsd)}
                detail={`7d ${formatCompactCurrency(home.performance.realizedPnl7dUsd)}`}
                tone={home.performance.realizedPnlTodayUsd >= 0 ? "accent" : "danger"}
              />
              <ScanStat
                label="Win rate"
                value={formatPercent(home.performance.winRate7d * 100, 0)}
                detail={`Avg return ${formatPercent(home.performance.avgReturnPct7d)}`}
                tone={home.performance.winRate7d >= 0.5 ? "accent" : "warning"}
              />
            </div>
            {pnlTrend.length > 0 ? (
              <div className="mt-3 space-y-2">
                {pnlTrend.map((day) => (
                  <div key={day.label} className="grid grid-cols-[5rem_minmax(0,1fr)_5rem] items-center gap-3">
                    <div className="text-[11px] text-text-muted">{day.label}</div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-hover/50">
                      <div
                        className={cn("h-full rounded-full", day.value >= 0 ? "bg-[var(--accent)]/70" : "bg-[var(--danger)]/70")}
                        style={{ width: `${Math.max(day.widthPercent, 6)}%` }}
                      />
                    </div>
                    <div className={cn("text-right text-[11px] font-semibold", day.value >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]")}>
                      {formatCompactCurrency(day.value)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-text-muted">No closed-position trend yet.</div>
            )}
          </DisclosurePanel>
        </section>
      </div>
    </ErrorBoundary>
  );
}

function Notice(props: { children: React.ReactNode; tone: "warning" | "danger" }) {
  return (
    <div
      className={cn(
        "rounded-[12px] border px-4 py-3 text-sm",
        props.tone === "danger"
          ? "border-[rgba(251,113,133,0.3)] bg-[rgba(251,113,133,0.08)] text-[var(--danger)]"
          : "border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.08)] text-[var(--warning)]",
      )}
    >
      {props.children}
    </div>
  );
}

function DisclosurePanel(props: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-[14px] border border-bg-border bg-bg-secondary/70 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Details</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">{props.title}</div>
          <div className="mt-1 text-xs text-text-secondary">{props.description}</div>
        </div>
        <div className="text-[11px] text-text-muted group-open:hidden">Open</div>
        <div className="hidden text-[11px] text-text-muted group-open:block">Hide</div>
      </summary>
      <div className="mt-3">{props.children}</div>
    </details>
  );
}

function safeTimestamp(value: string | null) {
  return value ? formatTimestamp(value) : "—";
}

function buildNextActions(home: DeskHomePayload, events: OperatorEvent[]) {
  const items: Array<{
    id: string;
    label: string;
    detail: string | null;
    pill: string;
    meta?: string;
    tone: "default" | "warning" | "danger";
  }> = [];

  if (!home.readiness.allowed) {
    items.push({
      id: "desk-readiness",
      label: home.readiness.summary,
      detail: home.readiness.detail,
      pill: "blocked",
      tone: "danger",
    });
  }

  for (const issue of home.diagnostics.issues.slice(0, 3)) {
    items.push({
      id: issue.id,
      label: issue.label,
      detail: issue.detail,
      pill: issue.level,
      tone: issue.level,
    });
  }

  for (const position of (home.positions ?? []).slice(0, 2)) {
    items.push({
      id: position.id,
      label: `${position.symbol} needs ${position.interventionLabel.toLowerCase()}`,
      detail: `Return ${formatPercent(position.returnPct)}. Unrealized ${formatCompactCurrency(position.unrealizedPnlUsd)}.`,
      pill: position.returnPct < 0 ? "warning" : "open",
      meta: `Opened ${formatRelativeMinutes(position.openedAt)}`,
      tone: position.returnPct < 0 ? "warning" : "default",
    });
  }

  for (const event of events.filter((event) => event.level !== "info").slice(0, 2)) {
    const tone = event.level === "danger" ? "danger" : "warning";
    items.push({
      id: event.id,
      label: event.title,
      detail: event.detail ?? event.kind.replace(/_/g, " "),
      pill: event.level,
      meta: formatRelativeMinutes(event.createdAt),
      tone,
    });
  }

  return items.slice(0, 5).concat(items.length === 0 ? [{
    id: "desk-clear",
    label: "Desk clear",
    detail: "No active blocker, no fresh fault, no urgent intervention.",
    pill: "healthy",
    tone: "default" as const,
  }] : []);
}

function buildPnlTrend(events: OperatorEvent[]) {
  const buckets = new Map<string, number>();

  for (const event of events) {
    if (event.kind !== "position_closed" || typeof event.detail !== "string") {
      continue;
    }
    const parsed = Number.parseFloat(event.detail.replace(/[^0-9.-]/g, ""));
    if (!Number.isFinite(parsed)) {
      continue;
    }
    const date = new Date(event.createdAt);
    const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    buckets.set(label, (buckets.get(label) ?? 0) + parsed);
  }

  const rows = [...buckets.entries()].slice(-7).map(([label, value]) => ({ label, value }));
  const maxAbs = Math.max(...rows.map((row) => Math.abs(row.value)), 1);

  return rows.map((row) => ({
    ...row,
    widthPercent: (Math.abs(row.value) / maxAbs) * 100,
  }));
}
