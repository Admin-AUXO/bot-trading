import React from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { CopyButton } from "@/components/copy-button";
import {
  CompactPageHeader,
  CompactStatGrid,
  DataTable,
  DisclosurePanel,
  InlineNotice,
  Panel,
  StatusPill,
} from "@/components/dashboard-primitives";
import { PositionDetailActions, InterventionPriorityBadge } from "@/components/position-detail-actions";
import { serverFetch } from "@/lib/server-api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCurrency, formatNumber, formatTimestamp, humanizeKey, smartFormatValue } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { PositionDetailPayload } from "@/lib/types";
import { interventionPriorityLabel, isPositionClosed } from "@/components/intervention-priority";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{ bucket?: string | string[] | undefined; sort?: string | string[] | undefined; book?: string | string[] | undefined; psort?: string | string[] | undefined; focus?: string | string[] | undefined; q?: string | string[] | undefined }>;

export default async function PositionDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParamsInput;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const bucket = Array.isArray(searchParams.bucket) ? searchParams.bucket[0] : searchParams.bucket;
  const sort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const book = Array.isArray(searchParams.book) ? searchParams.book[0] : searchParams.book;
  const psort = Array.isArray(searchParams.psort) ? searchParams.psort[0] : searchParams.psort;
  const focus = Array.isArray(searchParams.focus) ? searchParams.focus[0] : searchParams.focus;
  const q = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const detail = await serverFetch<PositionDetailPayload>(`/api/operator/positions/${params.id}`);
  const backHref = buildPositionBackHref({ bucket, sort, book, psort, focus, q });
  const grafanaHref = buildGrafanaDashboardLink("position", {
    from: Date.parse(detail.summary.openedAt) - 30 * 60 * 1000,
    to: detail.summary.closedAt ?? "now",
    vars: {
      positionId: detail.summary.id,
      mint: detail.summary.mint,
      symbol: detail.summary.symbol,
    },
  });

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Position"
        title={detail.summary.symbol}
        description="Immediate action first. Execution quality second. Raw evidence last."
        badges={(
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill value={detail.summary.status} />
            <StatusPill value={detail.summary.interventionLabel} />
          </div>
        )}
        actions={
          <>
            <Link href={backHref as Route} className="btn-ghost inline-flex items-center gap-2 border border-bg-border">
              <ArrowLeft className="h-4 w-4" />
              Back to trading
            </Link>
            <CopyButton value={detail.summary.id} label="Copy id" />
            <CopyButton value={detail.summary.mint} label="Copy mint" />
            <PositionDetailActions
              mint={detail.summary.mint}
              positionId={detail.summary.id}
            />
            {grafanaHref ? (
              <a
                href={grafanaHref}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex items-center gap-2"
                title="Open position analytics in Grafana"
              >
                Open Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        }
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            {
              label: "Intervention",
              value: detail.summary.interventionLabel,
              detail: `Priority ${detail.summary.interventionPriority}`,
              tooltip: "Current intervention label plus backend-computed priority.",
              tone:
                positionTone(detail.summary) === "critical"
                  ? "danger"
                  : positionTone(detail.summary) === "warning"
                    ? "warning"
                    : "default",
            },
            {
              label: "Opened",
              value: formatTimestamp(detail.summary.openedAt),
              detail: detail.summary.closedAt ? `Closed ${formatTimestamp(detail.summary.closedAt)}` : "Still open",
              tooltip: "Open time and close time when the position is already finished.",
            },
            {
              label: "PnL",
              value: formatCurrency(detail.summary.unrealizedPnlUsd ?? null),
              detail: `Ticket ${formatCurrency(detail.summary.amountUsd)}`,
              tooltip: "Current unrealized profit and loss against the original ticket size.",
              tone: (detail.summary.unrealizedPnlUsd ?? 0) < 0 ? "danger" : "accent",
            },
            {
              label: "Return",
              value: formatNumber(detail.summary.returnPct != null ? detail.summary.returnPct : null),
              detail: `Peak ${formatCurrency(detail.summary.peakPriceUsd, 6)}`,
              tooltip: "Current return percentage plus the observed peak price.",
            },
            {
              label: "Execution",
              value: `${detail.executionSummary.fillCount} fill${detail.executionSummary.fillCount === 1 ? "" : "s"}`,
              detail: detail.executionSummary.lastExecutionLatencyMs == null ? "No latency sample" : `Last ${Math.round(detail.executionSummary.lastExecutionLatencyMs)} ms`,
              tooltip: "Execution trail size plus the most recent measured latency.",
            },
          ]}
        />
      </CompactPageHeader>

      {detail.summary.exitReason ? (
        <InlineNotice tone={positionTone(detail.summary) === "critical" ? "danger" : "warning"}>
          {detail.summary.exitReason}
        </InlineNotice>
      ) : null}

      <section className="grid gap-6 2xl:grid-cols-[1.02fr_0.98fr]">
        <Panel
          title="Current call"
          eyebrow="Intervention"
          description="Actionable state first. This is the section that should answer whether you need to do something now."
          tone={positionTone(detail.summary)}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Metric
              label="Intervention priority"
              value={
                <InterventionPriorityBadge priority={detail.summary.interventionPriority} />
              }
            />
            <Metric label="Intervention label" value={detail.summary.interventionLabel} />
            <Metric label="Exit reason" value={detail.summary.exitReason ?? "Still open"} />
            <Metric label="Remaining token" value={detail.summary.remainingToken.toFixed(4)} />
            <Metric label="Ticket size" value={formatCurrency(detail.summary.amountUsd)} />
            <Metric label="Peak price" value={formatCurrency(detail.summary.peakPriceUsd, 6)} />
            <Metric label="Stop loss" value={formatCurrency(detail.summary.stopLossPriceUsd, 6)} />
            <Metric label="Amount token" value={formatNumber(detail.summary.amountToken)} />
          </div>
        </Panel>

        <Panel
          title="Execution summary"
          eyebrow="Latency and slippage"
          description={undefined}
          tone="passive"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="Fill count" value={String(detail.executionSummary.fillCount)} />
            <Metric label="Avg latency" value={detail.executionSummary.avgExecutionLatencyMs == null ? "—" : `${Math.round(detail.executionSummary.avgExecutionLatencyMs)} ms`} />
            <Metric label="P95 latency" value={detail.executionSummary.p95ExecutionLatencyMs == null ? "—" : `${Math.round(detail.executionSummary.p95ExecutionLatencyMs)} ms`} />
            <Metric label="Avg slippage" value={detail.executionSummary.avgExecutionSlippageBps == null ? "—" : `${detail.executionSummary.avgExecutionSlippageBps.toFixed(2)} bps`} />
            <Metric label="Last latency" value={detail.executionSummary.lastExecutionLatencyMs == null ? "—" : `${Math.round(detail.executionSummary.lastExecutionLatencyMs)} ms`} />
            <Metric label="Last fill" value={detail.summary.lastFillAt ? formatTimestamp(detail.summary.lastFillAt) : "—"} />
          </div>
        </Panel>
      </section>

      <DisclosurePanel
        title="Trace and linked evidence"
        description="Decision trace, linked candidate context, and stored metadata stay collapsed until you need to inspect them."
      >
        <div className="space-y-6">
          <Panel
            title="Decision trace"
            eyebrow="Execution path"
            tone="passive"
          >
            <TraceList
              items={buildPositionTrace(detail)}
              emptyText="No decision trace fields were stored for this position."
            />
          </Panel>

          <section className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
            <Panel
              title="Linked candidate"
              eyebrow="Origin"
            >
              <FieldGrid
                data={detail.linkedCandidate}
                preferredKeys={["symbol", "status", "source", "liquidityUsd", "volume5mUsd", "buySellRatio", "rejectReason"]}
                emptyText="This position has no linked candidate row."
              />
            </Panel>

            <Panel
              title="Stored metadata"
              eyebrow="Evidence"
              tone="passive"
            >
              <FieldGrid
                data={detail.summary.metadata}
                preferredKeys={["entryOrigin", "entryScore", "exitProfile", "source", "liveTradable", "error"]}
                emptyText="This position does not have stored metadata."
              />
            </Panel>
          </section>
        </div>
      </DisclosurePanel>

      <DataTable
        title="Fill trail"
        eyebrow="Execution history"
        description="Recorded execution events."
        rows={detail.fills}
        preferredKeys={[
          "createdAt",
          "side",
          "executionReason",
          "priceUsd",
          "amountUsd",
          "amountToken",
          "pnlUsd",
          "totalLatencyMs",
          "quoteLatencyMs",
          "swapBuildLatencyMs",
          "broadcastConfirmLatencyMs",
          "executionSlippageBps",
          "discoveryLabReportAgeMsAtEntry",
          "discoveryLabRunAgeMsAtEntry",
          "txSignature",
        ]}
        emptyTitle="No fills yet"
        emptyDetail="No execution trail is stored for this position."
      />

      <DataTable
        title="Snapshot history"
        eyebrow="Capture points"
        description="Recent market snapshots."
        rows={detail.snapshots}
        preferredKeys={["capturedAt", "trigger", "priceUsd", "liquidityUsd", "volume5mUsd", "buySellRatio", "top10HolderPercent"]}
        emptyTitle="No snapshots yet"
        emptyDetail="No snapshots were found for this position."
      />
    </div>
  );
}

function buildPositionBackHref(props: { bucket?: string; sort?: string; book?: string; psort?: string; focus?: string; q?: string }) {
  const params = new URLSearchParams();
  if (props.bucket) params.set("bucket", props.bucket);
  if (props.sort) params.set("sort", props.sort);
  if (props.book) params.set("book", props.book);
  if (props.psort) params.set("psort", props.psort);
  if (props.q && props.q.trim().length > 0) params.set("pq", props.q.trim());
  const query = params.toString();
  const hash = props.focus ? `#position-${props.focus}` : "";
  return `${operationalDeskRoutes.trading}${query ? `?${query}` : ""}${hash}`;
}

function Metric(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="micro-stat">
      <div className="scorecard-grid">
        <div className="scorecard-label wrap-anywhere">{props.label}</div>
        <div className="scorecard-value wrap-anywhere text-sm font-medium">{props.value}</div>
        <div />
      </div>
    </div>
  );
}

function TraceList(props: {
  items: Array<{ label: string; value: string }>;
  emptyText: string;
}) {
  if (props.items.length === 0) {
    return <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">{props.emptyText}</div>;
  }

  return (
    <div className="space-y-3">
      {props.items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-text-muted">{item.label}</div>
          <div className="mt-2 text-sm font-medium leading-6 text-text-primary">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function FieldGrid(props: {
  data: Record<string, unknown> | null;
  preferredKeys: string[];
  emptyText: string;
}) {
  if (!props.data) {
    return <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">{props.emptyText}</div>;
  }

  const data = props.data;
  const keys = props.preferredKeys.filter((key) => key in data);
  if (keys.length === 0) {
    return <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">{props.emptyText}</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {keys.map((key) => (
        <div key={key} className="micro-stat">
          <div className="micro-stat-label">{humanizeKey(key)}</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{smartFormatValue(key, data[key])}</div>
        </div>
      ))}
    </div>
  );
}

function buildPositionTrace(detail: PositionDetailPayload) {
  const metadata = detail.summary.metadata ?? {};
  const trace = [
    namedValue("TP1 state", detail.summary.tp1Done ? "Done" : "Pending"),
    namedValue("TP2 state", detail.summary.tp2Done ? "Done" : "Pending"),
    namedValue("Entry origin", readString(metadata, "entryOrigin")),
    namedValue("Exit profile", readString(metadata, "exitProfile")),
    namedValue("Entry score", toDisplayValue(metadata.entryScore)),
    namedValue("Origin candidate", detail.linkedCandidate ? readCandidateOrigin(detail.linkedCandidate) : null),
    namedValue("Stored error", readString(metadata, "error")),
  ];

  return trace.filter((item): item is { label: string; value: string } => item !== null);
}

function readCandidateOrigin(data: Record<string, unknown>) {
  const symbol = data.symbol ? String(data.symbol) : null;
  const source = data.source ? String(data.source) : null;
  const status = data.status ? String(data.status) : null;
  const parts = [symbol, source, status].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function positionTone(summary: PositionDetailPayload["summary"]): "default" | "warning" | "critical" | "passive" {
  if (isPositionClosed(summary.status)) return "passive";
  if (summary.interventionPriority >= 3 || summary.exitReason) return "critical";
  if (summary.interventionPriority >= 1) return "warning";
  return "default";
}

function namedValue(label: string, value: string | null) {
  return value ? { label, value } : null;
}

function readString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  if (value == null || value === "") return null;
  return String(value);
}

function toDisplayValue(value: unknown) {
  if (value == null || value === "") return null;
  return smartFormatValue("value", value);
}
