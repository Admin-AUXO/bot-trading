import { ArrowUpRight } from "lucide-react";
import { DataTable, PageHero, Panel, StatCard, StatusPill } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { DiagnosticsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TelemetryPage() {
  const diagnostics = await serverFetch<DiagnosticsPayload>("/api/operator/diagnostics");
  const telemetryHref = buildGrafanaDashboardLink("telemetry");
  const topIssue = diagnostics.issues[0] ?? null;
  const providerLinks = diagnostics.providerRows
    .map((row) => String(row.provider ?? "").trim())
    .filter((provider, index, values) => provider.length > 0 && values.indexOf(provider) === index)
    .slice(0, 6)
    .map((provider) => ({
      provider,
      href: buildGrafanaDashboardLink("telemetry", {
        vars: { provider },
      }),
    }))
    .filter((item) => item.href);

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Telemetry"
        title="Faults"
        description={undefined}
        actions={telemetryHref ? (
          <a
            href={telemetryHref}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex items-center gap-2"
            title="Open telemetry analytics in Grafana"
          >
            Open Grafana
            <ArrowUpRight className="h-4 w-4" />
          </a>
        ) : null}
        aside={(
          <div className="panel-muted rounded-[16px] p-4">
            <div className="section-kicker">Live</div>
            <div className="mt-4 grid gap-3">
              <SummaryRow label="Top issue" value={topIssue?.label ?? "None"} />
              <SummaryRow label="Stale" value={diagnostics.staleComponents.join(", ") || "None"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {providerLinks.length > 0 ? providerLinks.map((item) => (
                <a
                  key={item.provider}
                  href={item.href ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="meta-chip"
                >
                  {item.provider}
                </a>
              )) : <span className="text-sm text-text-secondary">No provider link.</span>}
            </div>
          </div>
        )}
      />

      <Panel
        title="Active issues"
        eyebrow="Triage first"
        description={undefined}
        tone={diagnostics.issues.length > 0 ? "critical" : "passive"}
      >
        {diagnostics.issues.length === 0 ? (
          <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
            No active issue.
          </div>
        ) : (
          <div className="space-y-3">
            {diagnostics.issues.map((issue) => (
              <div
                key={issue.id}
                className={`rounded-[14px] border px-4 py-3 ${
                  issue.level === "danger"
                    ? "border-[rgba(251,113,133,0.22)] bg-[rgba(251,113,133,0.08)]"
                    : "border-[rgba(250,204,21,0.18)] bg-[rgba(250,204,21,0.07)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill value={issue.level} />
                  <div className="text-sm font-semibold text-text-primary">{issue.label}</div>
                </div>
                <div className="mt-2 text-sm leading-6 text-text-secondary">{issue.detail}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Provider errors" value={formatInteger(diagnostics.summary.providerErrors)} detail={`${formatInteger(diagnostics.summary.totalCalls)} calls today`} tone={diagnostics.summary.providerErrors > 0 ? "danger" : "default"} />
        <StatCard label="Provider units" value={formatInteger(diagnostics.summary.totalUnits)} detail="Today" tone="warning" />
        <StatCard label="Payload failures" value={formatInteger(diagnostics.summary.latestPayloadFailures)} detail="6h" tone={diagnostics.summary.latestPayloadFailures > 0 ? "danger" : "default"} />
        <StatCard label="Stale components" value={formatInteger(diagnostics.staleComponents.length)} detail={diagnostics.staleComponents.join(", ") || "None"} tone={diagnostics.staleComponents.length > 0 ? "warning" : "success"} />
      </section>

      <section className="grid gap-6 2xl:grid-cols-2">
        <DataTable
          title="Provider pressure"
          eyebrow="Today"
          description="Current burn."
          rows={diagnostics.providerRows}
          preferredKeys={["provider", "total_calls", "total_units", "avg_latency_ms", "error_count"]}
          emptyTitle="No provider rows"
          emptyDetail="No provider summary rows are available."
          panelTone={diagnostics.summary.providerErrors > 0 ? "warning" : "default"}
        />
        <DataTable
          title="Endpoint faults"
          eyebrow="Highest burn first"
          description="Hot endpoints."
          rows={diagnostics.endpointRows}
          preferredKeys={["provider", "endpoint", "total_calls", "total_units", "avg_latency_ms", "error_count", "last_called_at"]}
          emptyTitle="No endpoint rows"
          emptyDetail="No endpoint efficiency rows are available."
          panelTone={diagnostics.summary.latestPayloadFailures > 0 ? "warning" : "default"}
        />
      </section>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="text-right text-sm font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}
