import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Search } from "lucide-react";
import { CandidatesGrid } from "@/components/candidates-grid";
import { PositionsGrid } from "@/components/positions-grid";
import { CompactPageHeader, CompactStatGrid, StatusPill } from "@/components/dashboard-primitives";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/input";
import { WorkflowSection } from "@/components/workflow-ui";
import { serverFetch } from "@/lib/api";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { formatCompactCurrency, formatInteger } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { CandidateBucket, CandidateQueuePayload, PositionBookPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{
  bucket?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
  book?: string | string[] | undefined;
  psort?: string | string[] | undefined;
  pq?: string | string[] | undefined;
}>;

const candidateBucketOrder: CandidateBucket[] = ["ready", "risk", "provider", "data"];
const candidateSortOrder = ["recent", "entry", "liquidity", "volume", "buySell"] as const;
const positionSortOrder = ["priority", "opened", "pnl", "latency"] as const;
type CandidateSort = typeof candidateSortOrder[number];
type PositionSort = typeof positionSortOrder[number];

export default async function OperationalDeskTradingPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const requestedBucket = firstParam(searchParams.bucket);
  const requestedCandidateSort = firstParam(searchParams.sort);
  const requestedCandidateQuery = firstParam(searchParams.q);
  const requestedBook = firstParam(searchParams.book);
  const requestedPositionSort = firstParam(searchParams.psort);
  const requestedPositionQuery = firstParam(searchParams.pq);

  const candidateBucket = candidateBucketOrder.includes(requestedBucket as CandidateBucket) ? requestedBucket as CandidateBucket : "ready";
  const candidateSort = candidateSortOrder.includes(requestedCandidateSort as CandidateSort) ? requestedCandidateSort as CandidateSort : "recent";
  const candidateQuery = normalizeSearchQuery(requestedCandidateQuery);
  const positionBook = requestedBook === "closed" ? "closed" : "open";
  const positionSort = positionSortOrder.includes(requestedPositionSort as PositionSort)
    ? requestedPositionSort as PositionSort
    : positionBook === "open" ? "priority" : "opened";
  const positionQuery = normalizeSearchQuery(requestedPositionQuery);

  const [candidatePayload, positionPayload] = await Promise.all([
    serverFetch<CandidateQueuePayload>(`/api/operator/candidates?bucket=${candidateBucket}`),
    serverFetch<PositionBookPayload>(`/api/operator/positions?book=${positionBook}`),
  ]);

  const sortedCandidates = [...candidatePayload.rows].sort((left, right) => compareCandidateRows(left, right, candidateSort));
  const candidateRows = candidateQuery ? sortedCandidates.filter((row) => matchesCandidateQuery(row, candidateQuery)) : sortedCandidates;
  const sortedPositions = [...positionPayload.rows].sort((left, right) => comparePositionRows(left, right, positionSort, positionBook));
  const positionRows = positionQuery ? sortedPositions.filter((row) => matchesPositionQuery(row, positionQuery)) : sortedPositions;
  const activeBucket = candidatePayload.buckets.find((item) => item.bucket === candidatePayload.bucket);
  const tradingGrafanaHref = buildGrafanaDashboardLink("control");

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Operational desk"
        title="Trading"
        description="Intake first, risk second."
        badges={(
          <>
            <StatusPill value={positionBook === "open" ? "open risk" : "closed outcomes"} />
            <StatusPill value={candidateBucket} />
          </>
        )}
        actions={(
          <>
            <Link
              href={operationalDeskRoutes.settings}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
              title="Open operational settings"
            >
              Runtime settings
            </Link>
            {tradingGrafanaHref ? (
              <a
                href={tradingGrafanaHref}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "default", size: "sm" })}
                title="Open Grafana control dashboard"
              >
                Open Grafana
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </>
        )}
      >
        <CompactStatGrid
          className="xl:grid-cols-3"
          items={[
            { label: "Visible intake", value: formatInteger(candidateRows.length), detail: `${activeBucket?.label ?? "Bucket"} after filters`, tone: "accent" },
            { label: "Open risk", value: formatInteger(positionPayload.totals.openCount), detail: `${formatInteger(positionPayload.totals.closedCount)} closed in book`, tone: positionPayload.totals.openCount > 0 ? "warning" : "default" },
            { label: "Realized PnL", value: formatCompactCurrency(positionPayload.totals.realizedPnlUsd), detail: "Book totals", tone: positionPayload.totals.realizedPnlUsd >= 0 ? "accent" : "danger" },
          ]}
        />
      </CompactPageHeader>

      <WorkflowSection title="Candidate intake" eyebrow="Discovery to decision" description="Fast triage for blockers, score, liquidity, and last touch." density="dense">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {candidatePayload.buckets.map((item) => (
              <Link
                key={item.bucket}
                href={buildTradingHref({
                  bucket: item.bucket,
                  sort: candidateSort,
                  q: candidateQuery,
                  book: positionBook,
                  psort: positionSort,
                  pq: positionQuery,
                }) as Route}
                title={`Open ${item.label}`}
                className={cn("min-w-[10rem] rounded-full border px-3 py-2.5 transition", (
                  item.bucket === candidatePayload.bucket
                    ? "border-[rgba(163,230,53,0.28)] bg-[#121511]"
                    : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50"
                ))}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="section-kicker">{item.label}</div>
                    <div className="mt-1 text-xs text-text-secondary">{item.bucket === candidatePayload.bucket ? "Active bucket" : "Switch view"}</div>
                  </div>
                  <div className="text-lg font-semibold tracking-tight text-text-primary">{formatInteger(item.count)}</div>
                </div>
              </Link>
            ))}
          </div>

          <section className="workbench-controls sticky top-[calc(var(--shell-header-height)+0.75rem)] z-20">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {([
                ["recent", "Recent"],
                ["entry", "Entry"],
                ["liquidity", "Liquidity"],
                ["volume", "5m volume"],
                ["buySell", "Buy/sell"],
              ] as const).map(([value, label]) => (
                <Link
                  key={value}
                  href={buildTradingHref({
                    bucket: candidateBucket,
                    sort: value,
                    q: candidateQuery,
                    book: positionBook,
                    psort: positionSort,
                    pq: positionQuery,
                  }) as Route}
                  title={`Sort candidates by ${label.toLowerCase()}`}
                  className={cn(
                    buttonVariants({
                      variant: candidateSort === value ? "secondary" : "ghost",
                      size: "sm",
                    }),
                    "rounded-full",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <form action={operationalDeskRoutes.trading} className="flex w-full max-w-[30rem] items-center gap-2">
              <input type="hidden" name="bucket" value={candidateBucket} />
              <input type="hidden" name="sort" value={candidateSort} />
              <input type="hidden" name="book" value={positionBook} />
              <input type="hidden" name="psort" value={positionSort} />
              <input type="hidden" name="pq" value={positionQuery} />
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  name="q"
                  defaultValue={candidateQuery}
                  placeholder="Filter symbol, mint, blocker"
                  className="h-9 bg-bg-primary/70 pl-9"
                />
              </div>
              <Button type="submit" variant="ghost" size="sm">Search</Button>
              {candidateQuery ? (
                <Link
                  href={buildTradingHref({ bucket: candidateBucket, sort: candidateSort, book: positionBook, psort: positionSort, pq: positionQuery }) as Route}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </section>

          <CandidatesGrid rows={candidateRows} bucket={candidatePayload.bucket} sort={candidateSort} query={candidateQuery} />
        </div>
      </WorkflowSection>

      <WorkflowSection title="Position lifecycle" eyebrow="Open risk and outcomes" description="Book view centered on PnL, return, and execution timing." density="dense">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href={buildTradingHref({ bucket: candidateBucket, sort: candidateSort, q: candidateQuery, book: "open", psort: positionSort, pq: positionQuery }) as Route} title="Open active positions" className={cn("min-w-[10rem] rounded-full border px-3 py-2.5 transition", positionBook === "open" ? "border-[rgba(163,230,53,0.28)] bg-[#121511]" : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Open book</div>
                  <div className="mt-1 text-xs text-text-secondary">Active risk</div>
                </div>
                <div className="text-lg font-semibold tracking-tight text-text-primary">{formatInteger(positionPayload.totals.openCount)}</div>
              </div>
            </Link>
            <Link href={buildTradingHref({ bucket: candidateBucket, sort: candidateSort, q: candidateQuery, book: "closed", psort: positionSort, pq: positionQuery }) as Route} title="Open closed positions" className={cn("min-w-[10rem] rounded-full border px-3 py-2.5 transition", positionBook === "closed" ? "border-[rgba(163,230,53,0.28)] bg-[#121511]" : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="section-kicker">Closed book</div>
                  <div className="mt-1 text-xs text-text-secondary">Resolved outcomes</div>
                </div>
                <div className="text-lg font-semibold tracking-tight text-text-primary">{formatInteger(positionPayload.totals.closedCount)}</div>
              </div>
            </Link>
          </div>

          <section className="workbench-controls sticky top-[calc(var(--shell-header-height)+0.75rem)] z-20">
            <div className="flex flex-1 flex-wrap gap-2">
              {([
                ["priority", "Priority"],
                ["opened", "Opened"],
                ["pnl", "PnL"],
                ["latency", "Latency"],
              ] as const).map(([value, label]) => (
                <Link
                  key={value}
                  href={buildTradingHref({
                    bucket: candidateBucket,
                    sort: candidateSort,
                    q: candidateQuery,
                    book: positionBook,
                    psort: value,
                    pq: positionQuery,
                  }) as Route}
                  title={`Sort positions by ${label.toLowerCase()}`}
                  className={cn(
                    buttonVariants({
                      variant: positionSort === value ? "secondary" : "ghost",
                      size: "sm",
                    }),
                    "rounded-full",
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <form action={operationalDeskRoutes.trading} className="flex w-full max-w-[30rem] items-center gap-2">
              <input type="hidden" name="bucket" value={candidateBucket} />
              <input type="hidden" name="sort" value={candidateSort} />
              <input type="hidden" name="q" value={candidateQuery} />
              <input type="hidden" name="book" value={positionBook} />
              <input type="hidden" name="psort" value={positionSort} />
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  name="pq"
                  defaultValue={positionQuery}
                  placeholder="Filter symbol, mint, exit phrase"
                  className="h-9 bg-bg-primary/70 pl-9"
                />
              </div>
              <Button type="submit" variant="ghost" size="sm">Search</Button>
              {positionQuery ? (
                <Link
                  href={buildTradingHref({ bucket: candidateBucket, sort: candidateSort, q: candidateQuery, book: positionBook, psort: positionSort }) as Route}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Clear
                </Link>
              ) : null}
            </form>
          </section>

          <PositionsGrid rows={positionRows} book={positionBook} sort={positionSort} query={positionQuery} />
        </div>
      </WorkflowSection>
    </div>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSearchQuery(value: string | undefined) {
  return value?.trim() ?? "";
}

function buildTradingHref(params: {
  bucket?: string;
  sort?: string;
  q?: string;
  book?: string;
  psort?: string;
  pq?: string;
}) {
  const query = new URLSearchParams();
  if (params.bucket) query.set("bucket", params.bucket);
  if (params.sort) query.set("sort", params.sort);
  if (params.q) query.set("q", params.q);
  if (params.book) query.set("book", params.book);
  if (params.psort) query.set("psort", params.psort);
  if (params.pq) query.set("pq", params.pq);
  const search = query.toString();
  return search ? `${operationalDeskRoutes.trading}?${search}` : operationalDeskRoutes.trading;
}

function compareCandidateRows(
  left: CandidateQueuePayload["rows"][number],
  right: CandidateQueuePayload["rows"][number],
  sort: CandidateSort,
) {
  switch (sort) {
    case "entry":
      return (right.adaptive.entryScore ?? -Infinity) - (left.adaptive.entryScore ?? -Infinity);
    case "liquidity":
      return (right.liquidityUsd ?? -Infinity) - (left.liquidityUsd ?? -Infinity);
    case "volume":
      return (right.volume5mUsd ?? -Infinity) - (left.volume5mUsd ?? -Infinity);
    case "buySell":
      return (right.buySellRatio ?? -Infinity) - (left.buySellRatio ?? -Infinity);
    case "recent":
    default:
      return Date.parse(right.discoveredAt) - Date.parse(left.discoveredAt);
  }
}

function comparePositionRows(
  left: PositionBookPayload["rows"][number],
  right: PositionBookPayload["rows"][number],
  sort: PositionSort,
  book: PositionBookPayload["book"],
) {
  switch (sort) {
    case "opened":
      return Date.parse(right.openedAt) - Date.parse(left.openedAt);
    case "pnl":
      return book === "open"
        ? (right.unrealizedPnlUsd ?? -Infinity) - (left.unrealizedPnlUsd ?? -Infinity)
        : (Date.parse(right.closedAt ?? "") - Date.parse(left.closedAt ?? ""));
    case "latency":
      return (right.latestExecutionLatencyMs ?? -Infinity) - (left.latestExecutionLatencyMs ?? -Infinity);
    case "priority":
    default:
      return book === "open"
        ? right.interventionPriority - left.interventionPriority
        : Date.parse(right.closedAt ?? "") - Date.parse(left.closedAt ?? "");
  }
}

function matchesCandidateQuery(row: CandidateQueuePayload["rows"][number], query: string) {
  const haystack = [
    row.symbol,
    row.mint,
    row.source,
    row.primaryBlocker,
    row.secondaryReasons.join(" "),
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesPositionQuery(row: PositionBookPayload["rows"][number], query: string) {
  const haystack = [
    row.symbol,
    row.mint,
    row.status,
    row.interventionLabel,
    row.exitReason ?? "",
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}
