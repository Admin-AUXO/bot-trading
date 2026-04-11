"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CirclePause,
  FlaskConical,
  RadioTower,
  RefreshCcw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { formatCompactCurrency, formatInteger, formatTimestamp } from "@/lib/format";
import type { DeskHomePayload, OperatorEvent } from "@/lib/types";
import { IconAction, PageHero, Panel, StatCard, StatusPill } from "@/components/dashboard-primitives";
import { PinnedItemsStrip } from "@/components/pinned-items";

export function DashboardClient(props: {
  initialHome: DeskHomePayload;
  initialEvents: OperatorEvent[];
  grafanaHref: string | null;
}) {
  const [home, setHome] = useState(props.initialHome);
  const [events, setEvents] = useState(props.initialEvents);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());
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
        setLastRefreshedAt(new Date());
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
      <PageHero
        eyebrow="Graduation control"
        title={home.readiness.summary}
        description={home.readiness.detail ?? undefined}
        meta={<StatusPill value={home.readiness.allowed ? "ready" : "blocked"} />}
        actions={(
          <>
            <button
              onClick={() => refresh()}
              className="btn-ghost inline-flex items-center gap-2 border border-bg-border"
              title="Refresh the control desk"
            >
              <RefreshCcw className="h-4 w-4" />
              {isPending ? "Refreshing" : "Refresh desk"}
            </button>
            <Link href="/telemetry" className="btn-ghost inline-flex items-center gap-2 border border-bg-border" title="Open telemetry">
              <RadioTower className="h-4 w-4" />
              Telemetry
            </Link>
            {props.grafanaHref ? (
              <a
                href={props.grafanaHref}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex items-center gap-2"
                title="Open the linked Grafana dashboard"
              >
                Open Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        )}
        aside={(
          <div className="panel-muted rounded-[16px] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="section-kicker">Snapshot</div>
              <span className="meta-chip">15s auto refresh</span>
            </div>
            <div className="mt-4 grid gap-3">
              <SnapshotRow label="Open" value={`${formatInteger(home.exposure.openPositions)}/${formatInteger(home.exposure.maxOpenPositions)}`} />
              <SnapshotRow label="Queue" value={formatInteger(home.queue.queuedCandidates)} />
              <SnapshotRow label="Pace" value={`${formatInteger(home.providerPressure.usedUnits)}/${formatInteger(home.providerPressure.monthlyBudgetUnits)}`} />
              <SnapshotRow label="Updated" value={formatTimestamp(lastRefreshedAt)} />
            </div>
          </div>
        )}
      />

      {refreshError ? (
        <div className="rounded-[16px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-5 py-4 text-sm text-[var(--danger)]">
          Desk refresh failed: {refreshError}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open exposure"
          value={`${formatInteger(home.exposure.openPositions)}/${formatInteger(home.exposure.maxOpenPositions)}`}
          detail={`Cash ${formatCompactCurrency(home.exposure.cashUsd)}`}
          tone="default"
          icon={Wallet}
        />
        <StatCard
          label="Queued work"
          value={formatInteger(home.queue.queuedCandidates)}
          detail="Candidates awaiting review"
          tone="default"
          icon={ShieldAlert}
        />
      </section>

      <PinnedItemsStrip />

      <section className="grid gap-6 2xl:grid-cols-[1.2fr_0.95fr]">
        <Panel
          title="Priority order"
          eyebrow="Interventions"
          description={undefined}
        >
          <InterventionStack items={buildInterventionItems(home)} />
        </Panel>

        <Panel
          title="Diagnostics"
          eyebrow="Live faults"
          description={home.diagnostics.staleComponents.length > 0 ? `Stale: ${home.diagnostics.staleComponents.join(", ")}` : undefined}
          tone={home.diagnostics.issues.length > 0 ? "critical" : "passive"}
          action={<IconAction href="/telemetry" icon={RadioTower} label="Telemetry" title="Open telemetry" subtle />}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusPill value={home.diagnostics.status} />
              <span className="text-sm text-text-secondary">
                {home.diagnostics.issues.length > 0 ? `${formatInteger(home.diagnostics.issues.length)} active issue(s)` : "Diagnostics are quiet."}
              </span>
            </div>
            {home.diagnostics.issues.length > 0 ? (
              home.diagnostics.issues.map((issue) => (
                <div key={issue.id} className="rounded-[14px] border border-bg-border bg-bg-hover/45 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                    <AlertTriangle className={`h-4 w-4 ${issue.level === "danger" ? "text-accent-red" : "text-accent-yellow"}`} />
                    {issue.label}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">{issue.detail}</div>
                </div>
              ))
            ) : (
              <div className="rounded-[14px] border border-bg-border bg-bg-hover/45 px-4 py-3 text-sm text-text-secondary">
                No active issue.
              </div>
            )}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.92fr_1.08fr]">
        <Panel
          title="Guardrails"
          eyebrow="Live checks"
          description={undefined}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {home.guardrails.map((guardrail) => (
              <div key={guardrail.id} className="micro-stat">
                <div className="flex items-center justify-between gap-3">
                  <div className="micro-stat-label">{guardrail.label}</div>
                  <StatusPill value={guardrail.status} />
                </div>
                <div className="micro-stat-value">{guardrail.value}</div>
                <div className="mt-2 text-xs leading-5 text-text-secondary">{guardrail.detail}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Provider pace"
          eyebrow="Lane usage"
          description={undefined}
        >
          <div className="space-y-3">
            {home.providerPressure.laneStatus.map((lane) => (
              <div key={lane.lane} className="rounded-[16px] border border-bg-border bg-bg-hover/40 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold capitalize text-text-primary">{lane.lane}</div>
                    <div className="mt-1 text-xs text-text-muted">
                      {formatInteger(lane.projectedMonthlyUnits)} projected monthly units
                    </div>
                  </div>
                  <div className="text-xs tabular-nums text-text-secondary">
                    {formatInteger(lane.usedUnits)} / {formatInteger(lane.budgetUnits)}
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-border">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.min((lane.usedUnits / Math.max(lane.budgetUnits, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 2xl:grid-cols-2">
        <Panel title="Recent failures" eyebrow="Breaks first" tone={home.recentFailures.length > 0 ? "critical" : "passive"}>
          <EventList events={home.recentFailures} emptyText="No recent warning or danger event." />
        </Panel>

        <Panel title="Recent events" eyebrow="Actions and state changes">
          <EventList events={events.slice(0, 10)} emptyText="No operator or system events recorded yet." />
        </Panel>
      </section>
    </div>
  );
}

function SnapshotRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="text-sm font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function InterventionStack(props: {
  items: Array<{ id: string; level: "info" | "warning" | "danger"; label: string; detail: string; href: string }>;
}) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
        No queued intervention right now.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {props.items.map((item, index) => (
        <a
          key={item.id}
          href={item.href}
          title={`Open ${item.label}`}
          className="group flex items-start justify-between gap-4 rounded-[16px] border border-bg-border bg-bg-hover/40 px-4 py-4 transition hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517]"
        >
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-bg-border bg-bg-primary/65 text-xs font-semibold text-text-primary">
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={item.level} />
                <div className="text-sm font-semibold text-text-primary">{item.label}</div>
              </div>
              <div className="mt-2 text-sm leading-6 text-text-secondary">{item.detail}</div>
            </div>
          </div>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-text-secondary transition group-hover:text-accent" />
        </a>
      ))}
    </div>
  );
}

function EventList(props: { events: OperatorEvent[]; emptyText: string }) {
  if (props.events.length === 0) {
    return <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">{props.emptyText}</div>;
  }

  return (
    <div className="space-y-3">
      {props.events.map((event) => {
        const href = eventHref(event);
        return (
          <div key={event.id} className="rounded-[16px] border border-bg-border bg-bg-hover/40 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-[10px] border border-bg-border bg-bg-primary/70 p-2 text-text-secondary">
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
                  <a
                    href={href}
                    className="btn-ghost inline-flex items-center gap-2 border border-bg-border !px-3 !py-2 text-xs"
                    title="Open related record"
                  >
                    Open
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <div className="text-xs text-text-muted">{formatTimestamp(event.createdAt)}</div>
              </div>
            </div>
            {event.detail ? <div className="mt-2 text-sm leading-6 text-text-secondary">{event.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function buildInterventionItems(home: DeskHomePayload) {
  const items: Array<{ id: string; level: "info" | "warning" | "danger"; label: string; detail: string; href: string }> = [];

  if (!home.readiness.allowed) {
    items.push({
      id: "readiness-blocker",
      level: "danger",
      label: home.readiness.summary,
      detail: home.readiness.detail ?? "A global blocker is active.",
      href: "/settings",
    });
  }

  for (const issue of home.diagnostics.issues.slice(0, 3)) {
    items.push({
      id: issue.id,
      level: issue.level,
      label: issue.label,
      detail: issue.detail,
      href: "/telemetry",
    });
  }

  if (home.exposure.openPositions > 0) {
    items.push({
      id: "open-book",
      level: home.exposure.openPositions >= home.exposure.maxOpenPositions ? "warning" : "info",
      label: `${formatInteger(home.exposure.openPositions)} open position(s)`,
      detail: `${formatInteger(home.exposure.maxOpenPositions)} max slots · cash ${formatCompactCurrency(home.exposure.cashUsd)}`,
      href: "/positions?book=open",
    });
  }

  for (const bucket of home.queue.buckets.filter((entry) => entry.count > 0)) {
    items.push({
      id: `queue-${bucket.bucket}`,
      level: bucket.bucket === "ready" ? "info" : bucket.bucket === "provider" ? "warning" : "danger",
      label: `${formatInteger(bucket.count)} ${bucket.label.toLowerCase()}`,
      detail: bucket.bucket === "ready" ? "Fastest path from queue to intervention." : "Blocked candidates still need operator attention.",
      href: `/candidates?bucket=${bucket.bucket}`,
    });
  }

  if (home.providerPressure.paceStatus !== "ok") {
    items.push({
      id: "provider-pace",
      level: home.providerPressure.paceStatus === "danger" ? "danger" : "warning",
      label: "Provider pace under pressure",
      detail: `${formatInteger(home.providerPressure.projectedMonthlyUnits)} projected against ${formatInteger(home.providerPressure.monthlyBudgetUnits)} budget`,
      href: "/telemetry",
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

  if (event.entityType === "researchRun") {
    return `/research?run=${event.entityId}`;
  }

  return null;
}
