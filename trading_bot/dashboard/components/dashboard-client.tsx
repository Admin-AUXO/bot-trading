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
import { CompactPageHeader, CompactStatGrid, DataTable, IconAction, Panel, StatusPill } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
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

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Graduation control"
        title="Operator desk"
        description={!home.readiness.allowed ? home.readiness.detail ?? undefined : "Compact control view for PnL, latency, and runtime state."}
        badges={(
          <>
            <StatusPill value={home.readiness.allowed ? "ready" : "blocked"} />
            <StatusPill value={home.diagnostics.status} />
            <Badge className="normal-case tracking-normal">15s auto refresh</Badge>
          </>
        )}
        actions={(
          <>
            <Button onClick={() => refresh()} variant="ghost" size="sm" title="Refresh the control desk">
              <RefreshCcw className="h-4 w-4" />
              {isPending ? "Refreshing" : "Refresh"}
            </Button>
            <Link
              href={operationalDeskRoutes.trading}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center gap-2")}
              title="Open trading lifecycle"
            >
              <ArrowUpRight className="h-4 w-4" />
              Open trading
            </Link>
            {props.grafanaHref ? (
              <a
                href={props.grafanaHref}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "inline-flex items-center gap-2")}
                title="Open the linked Grafana dashboard"
              >
                Open Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        )}
      >
        <CompactStatGrid
          className="xl:grid-cols-6"
          items={[
            {
              label: "Realized today",
              value: formatCompactCurrency(home.performance.realizedPnlTodayUsd),
              detail: "Closed-book session PnL",
              tone: home.performance.realizedPnlTodayUsd >= 0 ? "accent" : "danger",
            },
            {
              label: "Realized 7d",
              value: formatCompactCurrency(home.performance.realizedPnl7dUsd),
              detail: "Rolling week",
              tone: home.performance.realizedPnl7dUsd >= 0 ? "accent" : "danger",
            },
            {
              label: "Win rate 7d",
              value: formatPercent(home.performance.winRate7d * 100, 0),
              detail: `${formatPercent(home.performance.avgReturnPct7d)} avg return`,
              tone: home.performance.winRate7d >= 0.5 ? "accent" : "warning",
            },
            {
              label: "Avg hold 7d",
              value: formatRelativeMinutes(home.performance.avgHoldMinutes7d),
              detail: "Closed positions",
            },
            {
              label: "Provider latency",
              value: `${formatInteger(home.latency.providerAvgLatencyMsToday)} ms`,
              detail: `Hot endpoint ${formatInteger(home.latency.hotEndpointAvgLatencyMsToday)} ms`,
              tone: home.latency.providerAvgLatencyMsToday > 1500 ? "warning" : "default",
            },
            {
              label: "Exec latency",
              value: `${formatInteger(home.latency.avgExecutionLatencyMs24h)} ms`,
              detail: `P95 ${formatInteger(home.latency.p95ExecutionLatencyMs24h)} ms`,
              tone: home.latency.avgExecutionLatencyMs24h > 4000 ? "warning" : "default",
            },
          ]}
        />
      </CompactPageHeader>

      {refreshError ? (
        <div className="rounded-[16px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          Desk refresh failed: {refreshError}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel
          title="Next actions"
          eyebrow="Ranked"
          description="Stale loops, blockers, payload failures, and open-risk pressure."
        >
          <InterventionStack items={buildInterventionItems(home, diagnostics).slice(0, 5)} />
        </Panel>

        <Panel
          title="System state"
          eyebrow="Guardrails and loops"
          description="Risk, queue, adaptive posture, and provider pace."
          tone={home.diagnostics.status === "danger" ? "critical" : home.diagnostics.status === "warning" ? "warning" : "passive"}
          action={<IconAction href={operationalDeskRoutes.settings} icon={ArrowUpRight} label="Settings" title="Open runtime settings" subtle />}
        >
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <DeskStateItem label="Open risk" value={`${formatInteger(home.exposure.openPositions)}/${formatInteger(home.exposure.maxOpenPositions)}`} detail={`Cash ${formatCompactCurrency(home.exposure.cashUsd)}`} />
              <DeskStateItem label="Queued intake" value={formatInteger(home.queue.queuedCandidates)} detail="Candidates awaiting review" />
              <DeskStateItem label="Adaptive" value={home.adaptiveModel.enabled ? home.adaptiveModel.packName ?? "Staged" : "Inactive"} detail={home.adaptiveModel.status.toUpperCase()} />
              <DeskStateItem label="Provider pace" value={`${formatInteger(home.providerPressure.projectedMonthlyUnits)} / ${formatInteger(home.providerPressure.monthlyBudgetUnits)}`} detail={home.providerPressure.paceStatus.toUpperCase()} />
            </div>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
                <span>Loop timing and guardrails</span>
                <span className="text-xs text-text-secondary group-open:hidden">Open</span>
                <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
              </summary>
              <div className="mt-4 space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <DeskStateItem label="Discovery" value={safeClientTimestamp(home.runtime.lastDiscoveryAt, hydrated, "Never")} detail="Last discovery loop" />
                  <DeskStateItem label="Evaluation" value={safeClientTimestamp(home.runtime.lastEvaluationAt, hydrated, "Never")} detail="Last evaluation loop" />
                  <DeskStateItem label="Exit checks" value={safeClientTimestamp(home.runtime.lastExitCheckAt, hydrated, "Never")} detail="Last exit loop" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {home.guardrails.map((guardrail) => (
                    <Card key={guardrail.id} className="rounded-full border-bg-border bg-bg-hover/40 shadow-none">
                      <CardContent className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{guardrail.label}</span>
                          <StatusPill value={guardrail.status} />
                          <span className="text-sm font-semibold text-text-primary">{guardrail.value}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </Panel>
      </section>

      <Panel
        title="Diagnostics detail"
        eyebrow="Collapsed by default"
        description={diagnostics.providerRows.length === 0 && diagnostics.endpointRows.length === 0 ? "No provider or endpoint rows are active right now." : "Open only when you need backend evidence."}
        tone={diagnostics.issues.length > 0 ? "warning" : "passive"}
      >
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
            <span>
              {diagnostics.issues.length > 0
                ? `${formatInteger(diagnostics.issues.length)} issue(s), ${formatInteger(diagnostics.providerRows.length)} provider row(s), ${formatInteger(diagnostics.endpointRows.length)} endpoint row(s)`
                : "Quiet diagnostics"}
            </span>
            <span className="text-xs text-text-secondary group-open:hidden">Open</span>
            <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
          </summary>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <DataTable
              title="Provider pressure"
              eyebrow="Today"
              description="Provider call and burn pressure from live diagnostics."
              rows={diagnostics.providerRows}
              maxRows={6}
              preferredKeys={["provider", "total_calls", "total_units", "avg_latency_ms", "error_count"]}
              emptyTitle="No provider rows"
              emptyDetail="No provider summary rows are available."
              panelTone={diagnostics.summary.providerErrors > 0 ? "warning" : "default"}
            />
            <DataTable
              title="Endpoint faults"
              eyebrow="Hot endpoints"
              description="Most failure-prone endpoints right now."
              rows={diagnostics.endpointRows}
              maxRows={6}
              preferredKeys={["provider", "endpoint", "total_calls", "total_units", "avg_latency_ms", "error_count", "last_called_at"]}
              emptyTitle="No endpoint rows"
              emptyDetail="No endpoint diagnostics rows are available."
              panelTone={diagnostics.summary.latestPayloadFailures > 0 ? "warning" : "default"}
            />
          </div>
        </details>
      </Panel>

      <section className="grid gap-4">
        <Panel title="Recent events" eyebrow="Actions" description="Open only when you need the latest operator trail.">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
              <span>{events.length > 0 ? `${formatInteger(Math.min(events.length, 4))} recent event(s)` : "No recent events"}</span>
              <span className="text-xs text-text-secondary group-open:hidden">Open</span>
              <span className="hidden text-xs text-text-secondary group-open:inline">Close</span>
            </summary>
            <div className="mt-4">
              <EventList events={events.slice(0, 4)} emptyText="No recent event." compact hydrated={hydrated} />
            </div>
          </details>
        </Panel>
      </section>
    </div>
  );
}

function normalizeHomePayload(home: DeskHomePayload): DeskHomePayload {
  return {
    ...home,
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
      lastExitCheckAt: null,
    },
    adaptiveModel: home.adaptiveModel ?? buildFallbackAdaptiveModel(),
  };
}

function safeClientTimestamp(value: string | null | undefined, hydrated: boolean, fallback = "—") {
  if (!value) {
    return fallback;
  }
  return hydrated ? formatTimestamp(value) : "Syncing...";
}

function buildFallbackAdaptiveModel(): AdaptiveModelState {
  return {
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
    staleWarning: "Adaptive model data is unavailable from the current desk payload.",
    degradedWarning: "Adaptive model data is unavailable from the current desk payload.",
    warnings: ["Adaptive model data is unavailable from the current desk payload."],
    updatedAt: null,
  };
}

function DeskStateItem(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[14px] border border-bg-border bg-bg-hover/35 px-3 py-3">
      <div className="scorecard-grid">
        <div className="scorecard-label wrap-anywhere">{props.label}</div>
        <div className="scorecard-value wrap-anywhere text-sm font-semibold">{props.value}</div>
        <div className="scorecard-detail text-xs leading-5">{props.detail}</div>
      </div>
    </div>
  );
}

function InterventionStack(props: {
  items: Array<{ id: string; level: "info" | "warning" | "danger"; label: string; detail: string; href: string }>;
}) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
        Nothing urgent.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {props.items.map((item, index) => (
        <Link
          key={item.id}
          href={item.href as Route}
          title={`Open ${item.label}`}
          className="group flex items-start justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/40 px-3 py-3 transition hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517]"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-bg-border bg-bg-primary/65 text-[11px] font-semibold text-text-primary">
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={item.level} />
                <div className="text-sm font-semibold text-text-primary">{item.label}</div>
              </div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">{item.detail}</div>
            </div>
          </div>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-text-secondary transition group-hover:text-accent" />
        </Link>
      ))}
    </div>
  );
}

function EventList(props: { events: OperatorEvent[]; emptyText: string; compact?: boolean; hydrated: boolean }) {
  if (props.events.length === 0) {
    return <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">{props.emptyText}</div>;
  }

  return (
    <div className={props.compact ? "space-y-2" : "space-y-3"}>
      {props.events.map((event) => {
        const href = eventHref(event);
        return (
          <div key={event.id} className={cn("rounded-[14px] border border-bg-border bg-bg-hover/40", props.compact ? "px-3 py-3" : "px-4 py-4")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cn("rounded-[10px] border border-bg-border bg-bg-primary/70 text-text-secondary", props.compact ? "p-1.5" : "p-2")}>
                  <EventIcon event={event} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={event.level} />
                    <div className="text-sm font-semibold text-text-primary">{event.title}</div>
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    {event.kind.replace(/_/g, " ")}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {href ? (
                  <Link
                    href={href as Route}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "inline-flex items-center gap-2")}
                    title="Open related record"
                  >
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
                <div className="text-xs text-text-muted">{safeClientTimestamp(event.createdAt, props.hydrated)}</div>
              </div>
            </div>
            {event.detail ? <div className={cn("text-text-secondary", props.compact ? "mt-1 text-xs leading-5" : "mt-2 text-sm leading-6")}>{event.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function AdaptiveModelPanel(props: { model: AdaptiveModelState }) {
  const mode = props.model.enabled ? "Active model" : "Inactive model";
  const riskTone = props.model.status === "degraded"
    ? "text-accent-yellow"
    : props.model.status === "stale"
      ? "text-accent-red"
      : "text-accent";
  const summary = props.model.warnings[0]
    ?? (props.model.enabled
      ? "Adaptive model is backed by staged discovery output."
      : "No adaptive strategy is staged yet. Run discovery and stage a calibrated strategy from results.");

  return (
    <div className="space-y-2.5">
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/45 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill value={mode} />
          <span className={`text-sm font-semibold ${riskTone}`}>{props.model.status.toUpperCase()} adaptive status</span>
        </div>
        <div className="mt-1 text-xs leading-5 text-text-secondary">{summary}</div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <AdaptiveMetricCard
          icon={Sparkles}
          label="Pack"
          value={props.model.packName ?? "Unstaged"}
          detail={props.model.sourceRunId ? `Run ${props.model.sourceRunId}` : "No source run"}
        />
        <AdaptiveMetricCard
          icon={Cpu}
          label="Bands"
          value={formatInteger(props.model.bandCount)}
          detail="Decision bands"
        />
        <AdaptiveMetricCard
          icon={Sparkles}
          label="Winners"
          value={formatInteger(props.model.winnerCount)}
          detail="Calibration sample"
        />
        <AdaptiveMetricCard
          icon={Cpu}
          label="Confidence"
          value={props.model.calibrationConfidence == null ? "—" : `${Math.round(props.model.calibrationConfidence * 100)}%`}
          detail={props.model.dominantMode ?? "No dominant mode"}
        />
      </div>
      <div className="text-xs leading-5 text-text-muted">
        {props.model.automationUsesAdaptive ? "Live automation is using adaptive logic." : "Adaptive logic is staged but not currently running live automation."}
      </div>
    </div>
  );
}

function AdaptiveMetricCard(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  detail: string;
}) {
  const Icon = props.icon;
  return (
    <Card className="rounded-[14px] border-bg-border bg-[#101012] shadow-none">
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-text-secondary" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">{props.label}</span>
        </div>
        <div className="mt-1.5 text-sm font-semibold text-text-primary">{props.value}</div>
        <div className="mt-0.5 text-[11px] leading-5 text-text-secondary">{props.detail}</div>
      </CardContent>
    </Card>
  );
}

function buildInterventionItems(home: DeskHomePayload, diagnostics: DiagnosticsPayload) {
  const items: Array<{ id: string; level: "info" | "warning" | "danger"; label: string; detail: string; href: string }> = [];

  if (!home.readiness.allowed) {
    items.push({
      id: "readiness-blocker",
      level: "danger",
      label: home.readiness.summary,
      detail: home.readiness.detail ?? "A global blocker is active.",
      href: operationalDeskRoutes.settings,
    });
  }

  for (const issue of diagnostics.issues.slice(0, 3)) {
    items.push({
      id: issue.id,
      level: issue.level,
      label: issue.label,
      detail: issue.detail,
      href: operationalDeskRoutes.overview,
    });
  }

  if (home.exposure.openPositions > 0) {
    items.push({
      id: "open-book",
      level: home.exposure.openPositions >= home.exposure.maxOpenPositions ? "warning" : "info",
      label: `${formatInteger(home.exposure.openPositions)} open position(s)`,
      detail: `${formatInteger(home.exposure.maxOpenPositions)} max slots · cash ${formatCompactCurrency(home.exposure.cashUsd)}`,
      href: `${operationalDeskRoutes.trading}?book=open`,
    });
  }

  for (const bucket of home.queue.buckets.filter((entry) => entry.count > 0)) {
    items.push({
      id: `queue-${bucket.bucket}`,
      level: bucket.bucket === "ready" ? "info" : bucket.bucket === "provider" ? "warning" : "danger",
      label: `${formatInteger(bucket.count)} ${bucket.label.toLowerCase()}`,
      detail: bucket.bucket === "ready" ? "Ready first." : "Still blocked.",
      href: `${operationalDeskRoutes.trading}?bucket=${bucket.bucket}`,
    });
  }

  if (home.providerPressure.paceStatus !== "ok") {
    items.push({
      id: "provider-pace",
      level: home.providerPressure.paceStatus === "danger" ? "danger" : "warning",
      label: "Provider pace under pressure",
      detail: `${formatInteger(home.providerPressure.projectedMonthlyUnits)} projected against ${formatInteger(home.providerPressure.monthlyBudgetUnits)} budget`,
      href: operationalDeskRoutes.overview,
    });
  }

  return items.slice(0, 8);
}

function EventIcon(props: { event: OperatorEvent }) {
  if (props.event.kind.includes("research")) {
    return <FlaskConical className="h-4 w-4" />;
  }

  if (props.event.kind.includes("control") || props.event.kind.includes("pause") || props.event.kind.includes("resume")) {
    return <CirclePause className="h-4 w-4" />;
  }

  if (props.event.kind.includes("failure") || props.event.level !== "info") {
    return <AlertTriangle className="h-4 w-4" />;
  }

  return <RadioTower className="h-4 w-4" />;
}

function eventHref(event: OperatorEvent) {
  if (!event.entityId || !event.entityType) return null;

  if (event.entityType === "candidate") {
    return `/candidates/${event.entityId}`;
  }

  if (event.entityType === "position") {
    return `/positions/${event.entityId}`;
  }

  return null;
}
