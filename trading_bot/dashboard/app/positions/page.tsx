import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, ArrowDownUp, PanelTopOpen, Search, ShieldCheck } from "lucide-react";
import { PositionsGrid } from "@/components/positions-grid";
import { IconAction, PageHero, Panel, StatusPill } from "@/components/dashboard-primitives";
import { serverFetch } from "@/lib/api";
import { formatCompactCurrency, formatInteger } from "@/lib/format";
import { buildGrafanaDashboardLink } from "@/lib/grafana";
import type { PositionBookPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<{
  book?: string | string[] | undefined;
  sort?: string | string[] | undefined;
  q?: string | string[] | undefined;
}>;

const sortOrder = ["priority", "opened", "current", "remaining"] as const;
type PositionSort = typeof sortOrder[number];

export default async function PositionsPage(props: { searchParams?: SearchParamsInput }) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const requestedBook = Array.isArray(searchParams.book) ? searchParams.book[0] : searchParams.book;
  const requestedSort = Array.isArray(searchParams.sort) ? searchParams.sort[0] : searchParams.sort;
  const requestedQuery = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const book = requestedBook === "closed" ? "closed" : "open";
  const sort = sortOrder.includes(requestedSort as PositionSort) ? requestedSort as PositionSort : book === "open" ? "priority" : "opened";
  const query = normalizeSearchQuery(requestedQuery);

  const payload = await serverFetch<PositionBookPayload>(`/api/operator/positions?book=${book}`);
  const sortedRows = [...payload.rows].sort((left, right) => comparePositionRows(left, right, sort, book));
  const rows = query ? sortedRows.filter((row) => matchesPositionQuery(row, query)) : sortedRows;
  const grafanaHref = buildGrafanaDashboardLink("position", {
    vars: { book },
  });

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Positions"
        title={book === "open" ? "Open positions" : "Closed positions"}
        description={undefined}
        meta={<StatusPill value={book} />}
        actions={(
          <div className="flex flex-wrap gap-3">
            <IconAction href={buildPositionsHref({ book, sort, q: query }) as Route} icon={ArrowDownUp} label={`Sort: ${sortLabel(sort)}`} title="Current position sort" subtle />
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
          </div>
        )}
        aside={(
          <div className="panel-muted rounded-[14px] p-3">
            <div className="section-kicker">View</div>
            <div className="mt-3 grid gap-2">
              <SummaryRow label="Open" value={formatInteger(payload.totals.openCount)} />
              <SummaryRow label="Closed" value={formatInteger(payload.totals.closedCount)} />
              <SummaryRow label="Realized" value={formatCompactCurrency(payload.totals.realizedPnlUsd)} />
              <SummaryRow label="Showing" value={`${formatInteger(rows.length)} / ${formatInteger(sortedRows.length)}`} />
            </div>
          </div>
        )}
      />

      <section className="grid gap-3 md:grid-cols-2">
        <Link href={buildPositionsHref({ book: "open", sort, q: query }) as Route} title="Open active positions" className={`rounded-[14px] border px-3 py-3 transition ${book === "open" ? "border-[rgba(163,230,53,0.28)] bg-[#121511]" : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50"}`}>
          <div className="section-kicker">Open book</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{formatInteger(payload.totals.openCount)}</div>
        </Link>
        <Link href={buildPositionsHref({ book: "closed", sort, q: query }) as Route} title="Open closed positions" className={`rounded-[14px] border px-3 py-3 transition ${book === "closed" ? "border-[rgba(163,230,53,0.28)] bg-[#121511]" : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50"}`}>
          <div className="section-kicker">Closed book</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{formatInteger(payload.totals.closedCount)}</div>
        </Link>
      </section>

      <section className="workbench-controls sticky top-[calc(var(--shell-header-height)+0.75rem)] z-20">
        <div className="flex flex-1 flex-wrap gap-2">
          {([
            ["priority", "Priority"],
            ["opened", "Opened"],
            ["current", "Current"],
            ["remaining", "Remaining"],
          ] as const).map(([value, label]) => (
            <Link
              key={value}
              href={buildPositionsHref({ book, sort: value, q: query }) as Route}
              title={`Sort positions by ${label.toLowerCase()}`}
              className={`meta-chip ${sort === value ? "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary" : ""}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form action="/positions" className="flex w-full max-w-[26rem] items-center gap-2">
          <input type="hidden" name="book" value={book} />
          <input type="hidden" name="sort" value={sort} />
          <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-bg-border bg-bg-primary/70 px-3 py-2">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Filter symbol, mint, exit"
              className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <button type="submit" className="btn-ghost border border-bg-border !px-3 !py-2 text-xs">
            Search
          </button>
          {query ? (
            <Link href={buildPositionsHref({ book, sort }) as Route} className="btn-ghost border border-bg-border !px-3 !py-2 text-xs">
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <Panel
        title={book === "open" ? "Open positions" : "Closed positions"}
        eyebrow={book === "open" ? "Priority order" : "Closed outcomes"}
        description={undefined}
        action={<IconAction href={book === "open" ? "/settings" : "/telemetry"} icon={book === "open" ? ShieldCheck : PanelTopOpen} label={book === "open" ? "Settings" : "Telemetry"} title={book === "open" ? "Open runtime settings" : "Open telemetry"} subtle />}
      >
        <PositionsGrid rows={rows} book={book} sort={sort} query={query} />
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

function sortLabel(sort: PositionSort) {
  switch (sort) {
    case "current":
      return "Current";
    case "remaining":
      return "Remaining";
    case "opened":
      return "Opened";
    case "priority":
    default:
      return "Priority";
  }
}

function comparePositionRows(
  left: PositionBookPayload["rows"][number],
  right: PositionBookPayload["rows"][number],
  sort: PositionSort,
  book: PositionBookPayload["book"],
) {
  switch (sort) {
    case "current":
      return right.currentPriceUsd - left.currentPriceUsd || Date.parse(right.openedAt) - Date.parse(left.openedAt);
    case "remaining":
      return right.remainingToken - left.remainingToken || Date.parse(right.openedAt) - Date.parse(left.openedAt);
    case "opened":
      return Date.parse(right.openedAt) - Date.parse(left.openedAt);
    case "priority":
    default:
      return book === "open"
        ? right.interventionPriority - left.interventionPriority || Date.parse(right.openedAt) - Date.parse(left.openedAt)
        : Date.parse(right.closedAt ?? right.openedAt) - Date.parse(left.closedAt ?? left.openedAt);
  }
}

function normalizeSearchQuery(value: string | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase();
}

function matchesPositionQuery(row: PositionBookPayload["rows"][number], query: string) {
  const text = [
    row.symbol,
    row.mint,
    row.status,
    row.interventionLabel,
    row.exitReason ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(query);
}

function buildPositionsHref(input: {
  book: PositionBookPayload["book"];
  sort: PositionSort;
  q?: string;
}) {
  const params = new URLSearchParams();
  params.set("book", input.book);
  params.set("sort", input.sort);
  if (input.q && input.q.trim().length > 0) {
    params.set("q", input.q.trim());
  }
  return `/positions?${params.toString()}`;
}
