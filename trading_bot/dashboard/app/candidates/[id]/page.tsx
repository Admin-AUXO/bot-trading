import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { CopyButton } from "@/components/copy-button";
import { DataTable, PageHero, Panel, StatusPill } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatCompactCurrency, formatNumber, formatPercent, formatTimestamp, humanizeKey, smartFormatValue } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { CandidateDetailPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{ bucket?: string | string[] | undefined; sort?: string | string[] | undefined; focus?: string | string[] | undefined; q?: string | string[] | undefined }>;

export default async function CandidateDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParamsInput;
}) {
  const params = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};
  const bucket = Array.isArray(searchParams.bucket) ? searchParams.bucket[0] : searchParams.bucket;
  const sort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const focus = Array.isArray(searchParams.focus) ? searchParams.focus[0] : searchParams.focus;
  const q = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const detail = await serverFetch<CandidateDetailPayload>(`/api/operator/candidates/${params.id}`);
  const backHref = buildCandidateBackHref({ bucket, sort, focus, q });
  const grafanaHref = buildGrafanaDashboardLink("candidate", {
    from: Date.parse(detail.summary.discoveredAt) - 60 * 60 * 1000,
    vars: {
      mint: detail.summary.mint,
      symbol: detail.summary.symbol,
      source: detail.summary.source,
    },
  });

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Candidate"
        title={detail.summary.symbol || shortMint(detail.summary.mint)}
        description={undefined}
        meta={<StatusPill value={detail.summary.status} />}
        actions={(
          <>
            <Link href={backHref as Route} className="btn-ghost inline-flex items-center gap-2 border border-bg-border">
              <ArrowLeft className="h-4 w-4" />
              Back to candidates
            </Link>
            <CopyButton value={detail.summary.mint} label="Copy mint" />
            {grafanaHref ? (
              <a
                href={grafanaHref}
                target="_blank"
                rel="noreferrer"
                className="btn-primary inline-flex items-center gap-2"
                title="Open candidate analytics in Grafana"
              >
                Open Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        )}
        aside={(
          <div className="panel-muted rounded-[16px] p-4">
            <div className="section-kicker">Now</div>
            <div className="mt-4 grid gap-3">
              <SummaryRow label="Blocker" value={detail.summary.primaryBlocker} />
              <SummaryRow label="Source" value={detail.summary.source} />
              <SummaryRow label="Discovered" value={formatTimestamp(detail.summary.discoveredAt)} />
              <SummaryRow label="Last touch" value={detail.summary.lastEvaluatedAt ? formatTimestamp(detail.summary.lastEvaluatedAt) : "—"} />
              <SummaryRow label="Mint" value={shortMint(detail.summary.mint)} mono />
            </div>
          </div>
        )}
      />

      <section className="grid gap-6 2xl:grid-cols-[1.05fr_0.95fr]">
        <Panel
          title="Why it matters now"
          eyebrow="Intervention"
          description={detail.summary.rejectReason ?? undefined}
          tone={candidateTone(detail.summary.status, detail.summary.primaryBlocker)}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="Primary blocker" value={detail.summary.primaryBlocker} />
            <Metric label="Status" value={detail.summary.status} />
            <Metric label="Liquidity" value={formatCompactCurrency(detail.summary.liquidityUsd)} />
            <Metric label="5m volume" value={formatCompactCurrency(detail.summary.volume5mUsd)} />
            <Metric label="Buy/sell" value={formatNumber(detail.summary.buySellRatio)} />
            <Metric label="Top 10" value={formatPercent(detail.summary.top10HolderPercent)} />
          </div>
          {detail.summary.secondaryReasons.length > 0 ? (
            <div className="mt-4 rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4">
              <div className="section-kicker">Secondary reasons</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.summary.secondaryReasons.map((reason) => (
                  <span key={reason} className="meta-chip">{reason}</span>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Decision trace"
          eyebrow="Operator path"
          description={undefined}
          tone="passive"
        >
          <TraceList
            items={buildCandidateTrace(detail.summary)}
            emptyText="No decision trace fields were stored for this candidate."
          />
        </Panel>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
        <Panel
          title="Filter trace"
          eyebrow="Gate state"
          description={undefined}
        >
          <FieldGrid
            data={detail.summary.filterState}
            preferredKeys={["source", "liquidityUsd", "volume5mUsd", "buySellRatio", "top10HolderPercent", "largestHolderPercent", "priceUsd", "marketCapUsd"]}
            emptyText="This candidate does not have a normalized filter trace yet."
          />
        </Panel>

        <Panel
          title="Stored metadata"
          eyebrow="Evidence"
          description={undefined}
          tone="passive"
        >
          <FieldGrid
            data={detail.summary.metadata}
            preferredKeys={["entryScore", "exitProfile", "deferReason", "error", "liveTradable"]}
            emptyText="The candidate metadata blob is empty."
          />
        </Panel>
      </section>

      <DataTable
        title="Snapshot history"
        eyebrow="Capture points"
        description="Recent market snapshots."
        rows={detail.snapshots}
        preferredKeys={["capturedAt", "trigger", "priceUsd", "liquidityUsd", "volume5mUsd", "buySellRatio", "top10HolderPercent"]}
        emptyTitle="No snapshots yet"
        emptyDetail="No snapshots were found for this candidate."
      />

      <details className="rounded-[18px] border border-bg-border bg-bg-hover/20">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="section-kicker">Upstream evidence</div>
              <div className="mt-2 text-sm font-semibold text-text-primary">Provider payloads</div>
            </div>
            <span className="meta-chip">{detail.payloads.length} row{detail.payloads.length === 1 ? "" : "s"}</span>
          </div>
        </summary>
        <div className="border-t border-bg-border/80 px-1 pb-1">
          <DataTable
            title="Provider payloads"
            eyebrow="Upstream evidence"
            description="Persisted payload metadata."
            rows={detail.payloads}
            preferredKeys={["capturedAt", "provider", "endpoint", "success", "statusCode", "errorMessage", "entityKey"]}
            emptyTitle="No provider payloads"
            emptyDetail="No persisted provider payloads were found for this mint."
            className="border-none bg-transparent shadow-none"
          />
        </div>
      </details>
    </div>
  );
}

function buildCandidateBackHref(props: { bucket?: string; sort?: string; focus?: string; q?: string }) {
  const params = new URLSearchParams();
  if (props.bucket) params.set("bucket", props.bucket);
  if (props.sort) params.set("sort", props.sort);
  if (props.q && props.q.trim().length > 0) params.set("q", props.q.trim());
  const query = params.toString();
  const hash = props.focus ? `#candidate-${props.focus}` : "";
  return `/candidates${query ? `?${query}` : ""}${hash}`;
}

function SummaryRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className={`mt-2 text-sm font-semibold text-text-primary ${props.mono ? "font-mono" : ""}`}>{props.value}</div>
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="micro-stat">
      <div className="micro-stat-label">{props.label}</div>
      <div className="mt-2 text-sm font-medium text-text-primary">{props.value}</div>
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
  data: Record<string, unknown>;
  preferredKeys: string[];
  emptyText: string;
}) {
  const keys = props.preferredKeys.filter((key) => key in props.data);
  if (keys.length === 0) {
    return <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">{props.emptyText}</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {keys.map((key) => (
        <div key={key} className="micro-stat">
          <div className="micro-stat-label">{humanizeKey(key)}</div>
          <div className="mt-2 text-sm font-medium text-text-primary">{smartFormatValue(key, props.data[key])}</div>
        </div>
      ))}
    </div>
  );
}

function shortMint(mint: string) {
  return `${mint.slice(0, 6)}…${mint.slice(-4)}`;
}

function buildCandidateTrace(summary: CandidateDetailPayload["summary"]) {
  const metadata = summary.metadata ?? {};
  const trace = [
    namedValue("Reject reason", summary.rejectReason),
    namedValue("Defer reason", readString(metadata, "deferReason")),
    namedValue("Exit profile", readString(metadata, "exitProfile")),
    namedValue("Entry score", toDisplayValue(metadata.entryScore)),
    namedValue("Live tradable", toDisplayValue(metadata.liveTradable)),
    namedValue("Evaluation error", readString(metadata, "error")),
  ];

  return trace.filter((item): item is { label: string; value: string } => item !== null);
}

function candidateTone(status: string, primaryBlocker: string) {
  const normalized = `${status} ${primaryBlocker}`.toLowerCase();
  if (/(reject|error|fail|block)/.test(normalized)) return "critical" as const;
  if (/(wait|risk|provider|data)/.test(normalized)) return "warning" as const;
  return "default" as const;
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
