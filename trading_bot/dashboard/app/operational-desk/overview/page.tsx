import { DashboardClient } from "@/components/dashboard-client";
import { serverFetch } from "@/lib/api";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { DeskHomePayload, DiagnosticsPayload, OperatorEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OperationalDeskOverviewPage() {
  const [homeResult, eventsResult, diagnosticsResult] = await Promise.allSettled([
    serverFetch<DeskHomePayload>("/api/desk/home"),
    serverFetch<OperatorEvent[]>("/api/desk/events?limit=20"),
    serverFetch<DiagnosticsPayload>("/api/operator/diagnostics"),
  ]);
  const home = homeResult.status === "fulfilled" ? homeResult.value : degradedHomePayload(homeResult.reason);
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const diagnostics = diagnosticsResult.status === "fulfilled"
    ? diagnosticsResult.value
    : degradedDiagnosticsPayload(diagnosticsResult.status === "rejected" ? diagnosticsResult.reason : null);
  const grafanaHref = buildGrafanaDashboardLink("control");

  return <DashboardClient initialHome={home} initialEvents={events} initialDiagnostics={diagnostics} grafanaHref={grafanaHref} />;
}

function degradedHomePayload(error: unknown): DeskHomePayload {
  const detail = error instanceof Error ? error.message : "desk home fetch failed";
  return {
    readiness: {
      allowed: false,
      summary: "Desk degraded",
      detail,
    },
    guardrails: [
      {
        id: "desk-unavailable",
        label: "Desk data",
        status: "danger",
        value: "Unavailable",
        detail,
      },
    ],
    exposure: {
      capitalUsd: 0,
      cashUsd: 0,
      realizedPnlUsd: 0,
      openPositions: 0,
      maxOpenPositions: 0,
    },
    performance: {
      realizedPnlTodayUsd: 0,
      realizedPnl7dUsd: 0,
      winRate7d: 0,
      avgReturnPct7d: 0,
      avgHoldMinutes7d: 0,
    },
    latency: {
      providerAvgLatencyMsToday: 0,
      hotEndpointAvgLatencyMsToday: 0,
      avgExecutionLatencyMs24h: 0,
      p95ExecutionLatencyMs24h: 0,
      avgExecutionSlippageBps24h: 0,
    },
    runtime: {
      lastDiscoveryAt: null,
      lastEvaluationAt: null,
      lastExitCheckAt: null,
    },
    queue: {
      queuedCandidates: 0,
      buckets: [
        { bucket: "ready", count: 0, label: "Ready or queued" },
        { bucket: "risk", count: 0, label: "Blocked by risk" },
        { bucket: "provider", count: 0, label: "Blocked by provider" },
        { bucket: "data", count: 0, label: "Blocked by data quality" },
      ],
    },
    providerPressure: {
      usedUnits: 0,
      monthlyBudgetUnits: 0,
      projectedMonthlyUnits: 0,
      paceStatus: "danger",
      laneStatus: [],
    },
    diagnostics: {
      status: "danger",
      staleComponents: ["desk-home"],
      issues: [
        {
          id: "desk-home-unavailable",
          label: "Desk home unavailable",
          detail,
          level: "danger",
        },
      ],
    },
    adaptiveModel: {
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
      staleWarning: detail,
      degradedWarning: detail,
      warnings: [detail],
      updatedAt: null,
    },
    recentFailures: [
      {
        id: "desk-home-unavailable",
        kind: "desk_home_unavailable",
        level: "danger",
        title: "Desk home unavailable",
        detail,
        entityType: null,
        entityId: null,
        createdAt: new Date().toISOString(),
      },
    ],
    recentActions: [],
  };
}

function degradedDiagnosticsPayload(error: unknown): DiagnosticsPayload {
  const detail = error instanceof Error ? error.message : "diagnostics fetch failed";
  return {
    summary: {
      providerErrors: 0,
      totalCalls: 0,
      totalUnits: 0,
      latestPayloadFailures: 0,
    },
    providerRows: [],
    endpointRows: [],
    staleComponents: ["diagnostics"],
    issues: [
      {
        id: "diagnostics-unavailable",
        label: "Diagnostics unavailable",
        detail,
        level: "danger",
      },
    ],
  };
}
