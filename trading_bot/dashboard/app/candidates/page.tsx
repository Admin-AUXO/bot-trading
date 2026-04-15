import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, PanelTopOpen, Search } from "lucide-react";
import { CandidatesGrid } from "@/components/candidates-grid";
import { IconAction, PageHero, Panel, StatusPill } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { CandidateBucket, CandidateQueuePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{
  bucket?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
}>;

const bucketOrder: CandidateBucket[] = ["ready", "risk", "provider", "data"];
const sortOrder = ["recent", "liquidity", "volume", "buySell"] as const;
type CandidateSort = typeof sortOrder[number];

export default async function CandidatesPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const requestedBucket = Array.isArray(searchParams.bucket) ? searchParams.bucket[0] : searchParams.bucket;
  const requestedSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const requestedQuery = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const bucket = bucketOrder.includes(requestedBucket as CandidateBucket) ? requestedBucket as CandidateBucket : "ready";
  const sort = sortOrder.includes(requestedSort as CandidateSort) ? requestedSort as CandidateSort : "recent";
  const query = normalizeSearchQuery(requestedQuery);

  const payload = await serverFetch<CandidateQueuePayload>(`/api/operator/candidates?bucket=${bucket}`);
  const sortedRows = [...payload.rows].sort((left, right) => compareCandidateRows(left, right, sort));
  const rows = query ? sortedRows.filter((row) => matchesCandidateQuery(row, query)) : sortedRows;
  const activeBucket = payload.buckets.find((item) => item.bucket === payload.bucket);
  const grafanaHref = buildGrafanaDashboardLink("candidate", {
    vars: { bucket: payload.bucket },
  });

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Candidates"
        title={activeBucket ? activeBucket.label : "Candidate queue"}
        description={undefined}
        meta={<StatusPill value={payload.bucket} />}
        actions={(
          <div className="flex flex-wrap gap-3">
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
          </div>
        )}
        aside={(
          <div className="panel-muted rounded-[14px] p-3">
            <div className="section-kicker">View</div>
            <div className="mt-3 grid gap-2">
              <SummaryRow label="Rows" value={`${formatInteger(rows.length)} / ${formatInteger(sortedRows.length)}`} />
              <SummaryRow label="Sort" value={sortLabel(sort)} />
              <SummaryRow label="Filter" value={query || "None"} />
            </div>
          </div>
        )}
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {payload.buckets.map((item) => (
          <Link
            key={item.bucket}
              href={buildCandidatesHref({ bucket: item.bucket, sort, q: query }) as Route}
            title={`Open ${item.label}`}
            className={`rounded-[14px] border px-3 py-3 transition ${
              item.bucket === payload.bucket
                ? "border-[rgba(163,230,53,0.28)] bg-[#121511]"
                : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50"
            }`}
          >
            <div className="section-kicker">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{formatInteger(item.count)}</div>
          </Link>
        ))}
      </section>

      <section className="workbench-controls sticky top-[calc(var(--shell-header-height)+0.75rem)] z-20">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {([
            ["recent", "Recent"],
            ["liquidity", "Liquidity"],
            ["volume", "5m volume"],
            ["buySell", "Buy/sell"],
          ] as const).map(([value, label]) => (
            <Link
              key={value}
              href={buildCandidatesHref({ bucket, sort: value, q: query }) as Route}
              title={`Sort candidates by ${label.toLowerCase()}`}
              className={`meta-chip ${sort === value ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary" : ""}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form action="/candidates" className="flex w-full max-w-[28rem] items-center gap-2">
          <input type="hidden" name="bucket" value={bucket} />
          <input type="hidden" name="sort" value={sort} />
          <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-bg-border bg-bg-primary/70 px-3 py-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Filter symbol, mint, blocker"
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <button type="submit" className="btn-ghost border border-bg-border !px-3 !py-2 text-xs">
            Search
          </button>
          {query ? (
            <Link href={buildCandidatesHref({ bucket, sort }) as Route} className="btn-ghost border border-bg-border !px-3 !py-2 text-xs">
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <Panel
        title="Queue"
        eyebrow="Queue"
        description={undefined}
        action={<IconAction href="/telemetry" icon={PanelTopOpen} label="Telemetry" title="Open telemetry" subtle />}
      >
        <CandidatesGrid rows={rows} bucket={payload.bucket} sort={sort} query={query} />
      </Panel>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[10px] border border-bg-border bg-bg-primary/55 px-2.5 py-2">
      <div className="text-xs uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="text-sm font-semibold text-text-primary">{props.value}</div>
    </div>
  );
}

function sortLabel(sort: CandidateSort) {
  switch (sort) {
    case "liquidity":
      return "Liquidity";
    case "volume":
      return "Volume";
    case "buySell":
      return "Buy/sell";
    case "recent":
    default:
      return "Recent";
  }
}

function compareCandidateRows(left: CandidateQueuePayload["rows"][number], right: CandidateQueuePayload["rows"][number], sort: CandidateSort) {
  switch (sort) {
    case "liquidity":
      return (right.liquidityUsd ?? -1) - (left.liquidityUsd ?? -1) || Date.parse(right.discoveredAt) - Date.parse(left.discoveredAt);
    case "volume":
      return (right.volume5mUsd ?? -1) - (left.volume5mUsd ?? -1) || Date.parse(right.discoveredAt) - Date.parse(left.discoveredAt);
    case "buySell":
      return (right.buySellRatio ?? -1) - (left.buySellRatio ?? -1) || Date.parse(right.discoveredAt) - Date.parse(left.discoveredAt);
    case "recent":
    default:
      return Date.parse(right.discoveredAt) - Date.parse(left.discoveredAt);
  }
}

function normalizeSearchQuery(value: string | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase();
}

function matchesCandidateQuery(row: CandidateQueuePayload["rows"][number], query: string) {
  const text = [
    row.symbol,
    row.mint,
    row.source,
    row.status,
    row.primaryBlocker,
    ...row.secondaryReasons,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(query);
}

function buildCandidatesHref(input: {
  bucket: CandidateBucket;
  sort: CandidateSort;
  q?: string;
}) {
  const params = new URLSearchParams();
  params.set("bucket", input.bucket);
  params.set("sort", input.sort);
  if (input.q && input.q.trim().length > 0) {
    params.set("q", input.q.trim());
  }
  return `/candidates?${params.toString()}`;
}
