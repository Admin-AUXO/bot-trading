import { DashboardClient } from "@/components/dashboard-client";
import { serverFetch } from "@/lib/api";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { DeskHomePayload, OperatorEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [homeResult, eventsResult] = await Promise.allSettled([
    serverFetch<DeskHomePayload>("/api/desk/home"),
    serverFetch<OperatorEvent[]>("/api/desk/events?limit=20"),
  ]);
  const home = homeResult.status === "fulfilled" ? homeResult.value : degradedHomePayload(homeResult.reason);
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];
  const grafanaHref = buildGrafanaDashboardLink("control");

  return <DashboardClient initialHome={home} initialEvents={events} grafanaHref={grafanaHref} />;
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
