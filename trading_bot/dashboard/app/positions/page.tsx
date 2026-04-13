import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, ArrowDownUp, PanelTopOpen, Search, ShieldCheck } from "lucide-react";
import { IconAction, PageHero, Panel, StatusPill } from "@/components/dashboard-primitives";
import { WorkbenchRowActions } from "@/components/workbench-row-actions";
import { serverFetch } from "@/lib/api";
import { formatCompactCurrency, formatCurrency, formatInteger, formatTimestamp } from "@/lib/format";
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
          <div className="panel-muted rounded-[16px] p-4">
            <div className="section-kicker">View</div>
            <div className="mt-4 grid gap-3">
              <SummaryRow label="Open" value={formatInteger(payload.totals.openCount)} />
              <SummaryRow label="Closed" value={formatInteger(payload.totals.closedCount)} />
              <SummaryRow label="Showing" value={`${formatInteger(rows.length)} / ${formatInteger(sortedRows.length)}`} />
            </div>
          </div>
        )}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Link href={buildPositionsHref({ book: "open", sort, q: query }) as Route} title="Open active positions" className={`rounded-[16px] border px-4 py-4 transition ${book === "open" ? "border-[rgba(163,230,53,0.28)] bg-[#121511]" : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50"}`}>
          <div className="section-kicker">Open book</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">{formatInteger(payload.totals.openCount)}</div>
        </Link>
        <Link href={buildPositionsHref({ book: "closed", sort, q: query }) as Route} title="Open closed positions" className={`rounded-[16px] border px-4 py-4 transition ${book === "closed" ? "border-[rgba(163,230,53,0.28)] bg-[#121511]" : "border-bg-border bg-bg-hover/35 hover:border-[rgba(255,255,255,0.12)] hover:bg-bg-hover/50"}`}>
          <div className="section-kicker">Closed book</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">{formatInteger(payload.totals.closedCount)}</div>
        </Link>
        <div className="rounded-[16px] border border-bg-border bg-bg-hover/35 px-4 py-4">
          <div className="section-kicker">Realized</div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">{formatCompactCurrency(payload.totals.realizedPnlUsd)}</div>
        </div>
      </section>

      <section className="workbench-controls sticky top-[5.15rem] z-20">
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
        {rows.length === 0 ? (
          <div className="rounded-[14px] border border-bg-border bg-bg-hover/40 px-4 py-4 text-sm text-text-secondary">
            {query ? "No match." : "No positions in this book."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[16px] border border-bg-border bg-bg-card/45">
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-bg-hover/60">
                  <tr>
                    {["Position", "Intervention", "Status", "Entry", "Current", "Remaining", "Opened", "Closed", "Actions"].map((label) => (
                      <th key={label} className="table-header whitespace-nowrap">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const detailHref = `/positions/${row.id}?book=${book}&sort=${sort}&focus=${row.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
                    const leadRow = book === "open" && index < 4;
                    const grafanaRowHref = buildGrafanaDashboardLink("position", {
                      from: Date.parse(row.openedAt) - 30 * 60 * 1000,
                      to: row.closedAt ?? "now",
                      vars: {
                        positionId: row.id,
                        mint: row.mint,
                        symbol: row.symbol,
                      },
                    });

                    return (
                      <tr
                        key={row.id}
                        id={`position-${row.id}`}
                        className={clsx(
                          "table-row scroll-mt-32 align-top",
                          leadRow && "table-row-warning",
                        )}
                      >
                        <td className="table-cell">
                          <Link
                            href={detailHref as Route}
                            title={`Open ${row.symbol} position`}
                            className="inline-flex items-center gap-2 text-text-primary transition hover:text-accent"
                          >
                            <span className="font-semibold">{row.symbol}</span>
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                            <span className="font-mono">{shortMint(row.mint)}</span>
                            {leadRow ? <span className="meta-chip border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.08)] text-text-primary">Top priority</span> : null}
                          </div>
                        </td>
                        <td className="table-cell">
                          <div className="font-medium text-text-primary">{row.interventionLabel}</div>
                          <div className="mt-2 text-xs text-text-muted">Priority {row.interventionPriority}</div>
                        </td>
                        <td className="table-cell"><StatusPill value={row.status} /></td>
                        <td className="table-cell text-right tabular-nums text-text-secondary">{formatCurrency(row.entryPriceUsd, 6)}</td>
                        <td className="table-cell text-right tabular-nums text-text-secondary">{formatCurrency(row.currentPriceUsd, 6)}</td>
                        <td className="table-cell text-right tabular-nums text-text-secondary">{row.remainingToken.toFixed(4)}</td>
                        <td className="table-cell whitespace-nowrap text-text-secondary">{formatTimestamp(row.openedAt)}</td>
                        <td className="table-cell whitespace-nowrap text-text-secondary">{row.closedAt ? formatTimestamp(row.closedAt) : "—"}</td>
                        <td className="table-cell">
                          <WorkbenchRowActions
                            openHref={detailHref}
                            openLabel={row.symbol}
                            grafanaHref={grafanaRowHref}
                            pinItem={{
                              id: row.id,
                              kind: "position",
                              label: row.symbol,
                              href: detailHref,
                              secondary: row.interventionLabel,
                              meta: shortMint(row.mint),
                            }}
                            copyValue={row.id}
                            copyLabel="Copy"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
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

function shortMint(mint: string) {
  return `${mint.slice(0, 6)}…${mint.slice(-4)}`;
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
