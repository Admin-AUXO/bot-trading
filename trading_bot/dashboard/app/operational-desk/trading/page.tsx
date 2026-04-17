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
import { serverFetch } from "@/lib/server-api";
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
const candidateSortLinks = [
  ["recent", "Recent"],
  ["entry", "Entry"],
  ["liquidity", "Liquidity"],
  ["volume", "5m volume"],
  ["buySell", "Buy/sell"],
] as const;
const positionSortLinks = [
  ["priority", "Priority"],
  ["opened", "Opened"],
  ["pnl", "PnL"],
  ["latency", "Latency"],
] as const;
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
              <CountChipLink
                key={item.bucket}
                href={buildTradingHref({
                  bucket: item.bucket,
                  sort: candidateSort,
                  q: candidateQuery,
                  book: positionBook,
                  psort: positionSort,
                  pq: positionQuery,
                }) as Route}
                label={item.label}
                count={item.count}
                active={item.bucket === candidatePayload.bucket}
              />
            ))}
          </div>

          <WorkbenchControls
            links={candidateSortLinks.map(([value, label]) => ({
              key: value,
              label,
              href: buildTradingHref({
                bucket: candidateBucket,
                sort: value,
                q: candidateQuery,
                book: positionBook,
                psort: positionSort,
                pq: positionQuery,
              }) as Route,
              active: candidateSort === value,
            }))}
            action={operationalDeskRoutes.trading}
            hiddenInputs={[
              { name: "bucket", value: candidateBucket },
              { name: "sort", value: candidateSort },
              { name: "book", value: positionBook },
              { name: "psort", value: positionSort },
              { name: "pq", value: positionQuery },
            ]}
            searchName="q"
            searchValue={candidateQuery}
            searchPlaceholder="Filter symbol, mint, blocker"
            clearHref={candidateQuery
              ? buildTradingHref({ bucket: candidateBucket, sort: candidateSort, book: positionBook, psort: positionSort, pq: positionQuery }) as Route
              : null}
          />

          <CandidatesGrid rows={candidateRows} bucket={candidatePayload.bucket} sort={candidateSort} query={candidateQuery} />
        </div>
      </WorkflowSection>

      <WorkflowSection title="Position lifecycle" eyebrow="Open risk and outcomes" description="Book view centered on PnL, return, and execution timing." density="dense">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <CountChipLink
              href={buildTradingHref({ bucket: candidateBucket, sort: candidateSort, q: candidateQuery, book: "open", psort: positionSort, pq: positionQuery }) as Route}
              label="Open book"
              count={positionPayload.totals.openCount}
              active={positionBook === "open"}
            />
            <CountChipLink
              href={buildTradingHref({ bucket: candidateBucket, sort: candidateSort, q: candidateQuery, book: "closed", psort: positionSort, pq: positionQuery }) as Route}
              label="Closed book"
              count={positionPayload.totals.closedCount}
              active={positionBook === "closed"}
            />
          </div>

          <WorkbenchControls
            links={positionSortLinks.map(([value, label]) => ({
              key: value,
              label,
              href: buildTradingHref({
                bucket: candidateBucket,
                sort: candidateSort,
                q: candidateQuery,
                book: positionBook,
                psort: value,
                pq: positionQuery,
              }) as Route,
              active: positionSort === value,
            }))}
            action={operationalDeskRoutes.trading}
            hiddenInputs={[
              { name: "bucket", value: candidateBucket },
              { name: "sort", value: candidateSort },
              { name: "q", value: candidateQuery },
              { name: "book", value: positionBook },
              { name: "psort", value: positionSort },
            ]}
            searchName="pq"
            searchValue={positionQuery}
            searchPlaceholder="Filter symbol, mint, exit phrase"
            clearHref={positionQuery
              ? buildTradingHref({ bucket: candidateBucket, sort: candidateSort, q: candidateQuery, book: positionBook, psort: positionSort }) as Route
              : null}
          />

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

function CountChipLink(props: {
  href: Route;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={props.href}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
        props.active
          ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary"
          : "border-bg-border bg-bg-hover/35 text-text-secondary hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50 hover:text-text-primary",
      )}
    >
      <span>{props.label}</span>
      <span className="rounded-full border border-bg-border bg-bg-primary/50 px-2 py-0.5 text-[11px] font-semibold text-text-primary">
        {formatInteger(props.count)}
      </span>
    </Link>
  );
}

function WorkbenchControls(props: {
  links: Array<{ key: string; label: string; href: Route; active: boolean }>;
  action: string;
  hiddenInputs: Array<{ name: string; value: string }>;
  searchName: string;
  searchValue: string;
  searchPlaceholder: string;
  clearHref: Route | null;
}) {
  return (
    <section className="workbench-controls sticky top-[calc(var(--shell-header-height)+0.75rem)] z-20">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {props.links.map((link) => (
          <Link
            key={link.key}
            href={link.href}
            className={cn(
              buttonVariants({ variant: link.active ? "secondary" : "ghost", size: "sm" }),
              "rounded-full",
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <form action={props.action} className="flex w-full max-w-[30rem] items-center gap-2">
        {props.hiddenInputs.map((input) => (
          <input key={input.name} type="hidden" name={input.name} value={input.value} />
        ))}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            name={props.searchName}
            defaultValue={props.searchValue}
            placeholder={props.searchPlaceholder}
            className="h-9 bg-bg-primary/70 pl-9"
          />
        </div>
        <Button type="submit" variant="ghost" size="sm">Search</Button>
        {props.clearHref ? (
          <Link href={props.clearHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Clear
          </Link>
        ) : null}
      </form>
    </section>
  );
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
