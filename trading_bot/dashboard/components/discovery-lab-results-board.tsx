"use client";

import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Eye,
  ExternalLink,
  Maximize2,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { EmptyState, Panel } from "@/components/dashboard-primitives";
import { fetchJson } from "@/lib/api";
import { formatCompactCurrency, formatCurrency, formatInteger, formatNumber, formatPercent, formatRelativeMinutes, formatTimestamp } from "@/lib/format";
import type { BotSettings, DiscoveryLabRunDetail, DiscoveryLabRunReport, DiscoveryLabRuntimeSnapshot } from "@/lib/types";

type ResultFilter = "all" | "winner" | "pass" | "overlap" | "reject";
type TokenOutcome = "winner" | "pass" | "reject";
type StrategyPresetId = "FIRST_MINUTE_POSTGRAD_CONTINUATION" | "LATE_CURVE_MIGRATION_SNIPE";

type TokenSignalSnapshot = {
  mode: DiscoveryLabRunReport["deepEvaluations"][number]["mode"];
  priceUsd: number | null;
  liquidityUsd: number | null;
  marketCapUsd: number | null;
  holders: number | null;
  volume5mUsd: number | null;
  volume30mUsd: number | null;
  uniqueWallets5m: number | null;
  buySellRatio: number | null;
  priceChange5mPercent: number | null;
  priceChange30mPercent: number | null;
  top10HolderPercent: number | null;
  largestHolderPercent: number | null;
  timeSinceGraduationMin: number | null;
  timeSinceCreationMin: number | null;
};

type TokenTradeSetup = {
  presetId: StrategyPresetId;
  profile: "scalp" | "balanced" | "runner";
  suggestedCapitalUsd: number | null;
  entryPriceUsd: number | null;
  stopLossPercent: number;
  stopLossPriceUsd: number | null;
  tp1Percent: number;
  tp1PriceUsd: number | null;
  tp2Percent: number;
  tp2PriceUsd: number | null;
  maxHoldMinutes: number;
  timeStopMinutes: number;
  timeStopMinReturnPercent: number;
  doubleUpConfidencePercent: number;
};

type TokenBoardRow = {
  mint: string;
  symbol: string;
  outcome: TokenOutcome;
  modes: DiscoveryLabRunReport["deepEvaluations"][number]["mode"][];
  sources: string[];
  recipes: string[];
  passedRecipes: string[];
  failedRecipes: string[];
  evaluationCount: number;
  overlapCount: number;
  bestPlayScore: number;
  avgPlayScore: number;
  bestEntryScore: number;
  winnerScore: number | null;
  winnerVolume5mUsd: number | null;
  winnerMarketCapUsd: number | null;
  winnerTop10HolderPercent: number | null;
  winnerTimeSinceGraduationMin: number | null;
  grades: string[];
  topRejectReason: string | null;
  softIssues: string[];
  notes: string[];
  signal: TokenSignalSnapshot | null;
  searchText: string;
};

type MutableTokenBoardRow = {
  mint: string;
  symbol: string;
  sources: Set<string>;
  recipes: Set<string>;
  passedRecipes: Set<string>;
  failedRecipes: Set<string>;
  evaluationCount: number;
  playScoreTotal: number;
  bestPlayScore: number;
  bestEntryScore: number;
  winnerScore: number | null;
  winnerVolume5mUsd: number | null;
  winnerMarketCapUsd: number | null;
  winnerTop10HolderPercent: number | null;
  winnerTimeSinceGraduationMin: number | null;
  grades: Set<string>;
  rejectReasons: Map<string, number>;
  softIssues: Set<string>;
  notes: Set<string>;
  modes: Set<DiscoveryLabRunReport["deepEvaluations"][number]["mode"]>;
  signal: TokenSignalSnapshot | null;
  signalPriority: number;
  signalScore: number;
};

type TokenRowMetrics = {
  evPercent: number | null;
  evUsd: number | null;
  riskUsd: number | null;
  evToRisk: number | null;
  edgePp: number | null;
  netFlowScore: number | null;
  liquidityRunway: number | null;
  concentrationRisk: number | null;
  freshnessDecay: number | null;
  consensusQuality: number | null;
};

type HeatmapMetricKey = "evPercent" | "evUsd" | "evToRisk" | "netFlowScore" | "concentrationRisk" | "freshnessDecay" | "consensusQuality";

type HeatmapScale = {
  direction: "higher_better" | "lower_better";
  thresholds: [number, number, number, number];
};

type MarketRegimeTone = "risk_on" | "balanced" | "risk_off";

type MarketRegimeSnapshot = {
  label: string;
  tone: MarketRegimeTone;
  confidencePercent: number | null;
  updatedAt: string | null;
  chips: Array<{ label: string; value: string }>;
};

export function DiscoveryLabResultsBoard(props: {
  runDetail: DiscoveryLabRunDetail | null;
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null;
}) {
  const { runDetail, runtimeSnapshot } = props;
  const report = runDetail?.report ?? null;
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "score", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 12 });
  const [searchText, setSearchText] = useState("");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeSnapshot | null>(null);
  const [marketRegimeLoading, setMarketRegimeLoading] = useState(false);
  const [marketRegimeError, setMarketRegimeError] = useState<string | null>(null);
  const deferredSearchText = useDeferredValue(searchText);

  const tokenRows = useMemo(() => buildTokenRows(report), [report]);
  const tradeSetups = useMemo(
    () => new Map(tokenRows.map((row) => [row.mint, buildTokenTradeSetup(row, runtimeSnapshot)])),
    [runtimeSnapshot, tokenRows],
  );
  const rowMetrics = useMemo(
    () => new Map(tokenRows.map((row) => [row.mint, buildTokenRowMetrics(row, tradeSetups.get(row.mint) ?? null)])),
    [tokenRows, tradeSetups],
  );
  const heatmapScales = useMemo(
    () => buildHeatmapScales(tokenRows, rowMetrics),
    [rowMetrics, tokenRows],
  );
  const boardStats = useMemo(() => buildBoardStats(report, tokenRows), [report, tokenRows]);
  const visibleRows = useMemo(
    () => tokenRows.filter((row) => matchesResultFilter(row, resultFilter) && matchesSearch(row, deferredSearchText)),
    [deferredSearchText, resultFilter, tokenRows],
  );
  const selectedRow = useMemo(
    () => tokenRows.find((row) => row.mint === selectedMint) ?? null,
    [selectedMint, tokenRows],
  );
  const selectedSetup = selectedRow ? tradeSetups.get(selectedRow.mint) ?? null : null;
  const selectedMetrics = selectedRow ? rowMetrics.get(selectedRow.mint) ?? null : null;

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [deferredSearchText, resultFilter, runDetail?.id]);

  useEffect(() => {
    if (selectedMint && !selectedRow) {
      setSelectedMint(null);
    }
  }, [selectedMint, selectedRow]);

  useEffect(() => {
    const runIdValue = runDetail?.id;
    if (!runIdValue) {
      setMarketRegime(null);
      setMarketRegimeError(null);
      setMarketRegimeLoading(false);
      return;
    }
    const runId = runIdValue;

    let cancelled = false;
    let hasLoaded = false;

    async function loadRegime() {
      if (!hasLoaded) {
        setMarketRegimeLoading(true);
      }
      try {
        const payload = await fetchJson<unknown>(`/operator/discovery-lab/market-regime?runId=${encodeURIComponent(runId)}`);
        if (cancelled) {
          return;
        }
        setMarketRegime(normalizeMarketRegime(payload));
        setMarketRegimeError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setMarketRegimeError(error instanceof Error ? error.message : "Market regime unavailable");
      } finally {
        if (cancelled) {
          return;
        }
        hasLoaded = true;
        setMarketRegimeLoading(false);
      }
    }

    void loadRegime();
    const intervalId = window.setInterval(() => {
      void loadRegime();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [runDetail?.id]);

  const reportGeneratedAt = report?.generatedAt ?? runDetail?.completedAt ?? runDetail?.startedAt ?? null;
  const runDurationLabel = formatRunDuration(runDetail);

  const columns = useMemo<ColumnDef<TokenBoardRow>[]>(() => [
    {
      accessorKey: "symbol",
      header: ({ column }) => <SortHeader column={column} label="Token" />,
      cell: ({ row }) => (
        <div className="min-w-[15rem]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-text-primary">{row.original.symbol}</div>
            <OutcomePill outcome={row.original.outcome} compact />
          </div>
          <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">{row.original.mint}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {row.original.sources.map((source) => (
              <span key={source} className="rounded-full border border-bg-border bg-[#0d0d0f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                {humanizeLabel(source)}
              </span>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TokenMarketLinks mint={row.original.mint} symbol={row.original.symbol} />
          </div>
        </div>
      ),
    },
    {
      id: "coverage",
      accessorFn: (row) => row.overlapCount,
      header: ({ column }) => <SortHeader column={column} label="Consensus" align="right" />,
      cell: ({ row }) => {
        const passRate = row.original.overlapCount > 0
          ? Math.round((row.original.passedRecipes.length / row.original.overlapCount) * 100)
          : 0;
        return (
          <div className="min-w-[8rem] text-right">
            <MetricLine label="Recipes" value={formatInteger(row.original.overlapCount)} compact />
            <MetricLine label="Pass rate" value={formatPercent(passRate, 0)} compact />
            <MetricLine label="Best play" value={formatNumber(row.original.bestPlayScore)} compact emphasis={row.original.outcome === "winner"} />
          </div>
        );
      },
    },
    {
      id: "evPercent",
      accessorFn: (row) => rowMetrics.get(row.mint)?.evPercent ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="EV%" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.evPercent}
            scale={heatmapScales.evPercent}
            displayValue={formatSignedPercent(metrics.evPercent)}
            align="right"
          />
        );
      },
    },
    {
      id: "evUsd",
      accessorFn: (row) => rowMetrics.get(row.mint)?.evUsd ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="EV$" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.evUsd}
            scale={heatmapScales.evUsd}
            displayValue={formatSignedCurrency(metrics.evUsd)}
            align="right"
          />
        );
      },
    },
    {
      id: "evToRisk",
      accessorFn: (row) => rowMetrics.get(row.mint)?.evToRisk ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="EV/R" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.evToRisk}
            scale={heatmapScales.evToRisk}
            displayValue={formatSignedRatio(metrics.evToRisk)}
            align="right"
          />
        );
      },
    },
    {
      id: "netFlow",
      accessorFn: (row) => rowMetrics.get(row.mint)?.netFlowScore ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="Net flow" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.netFlowScore}
            scale={heatmapScales.netFlowScore}
            displayValue={formatMetricScore(metrics.netFlowScore)}
            align="right"
          />
        );
      },
    },
    {
      id: "runway",
      accessorFn: (row) => rowMetrics.get(row.mint)?.liquidityRunway ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="Runway" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <div className="min-w-[6rem] text-right">
            <span className="tabular-nums text-sm font-semibold text-text-primary">{formatRunway(metrics.liquidityRunway)}</span>
          </div>
        );
      },
    },
    {
      id: "concentrationRisk",
      accessorFn: (row) => rowMetrics.get(row.mint)?.concentrationRisk ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="Conc risk" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.concentrationRisk}
            scale={heatmapScales.concentrationRisk}
            displayValue={formatMetricScore(metrics.concentrationRisk)}
            align="right"
          />
        );
      },
    },
    {
      id: "freshnessDecay",
      accessorFn: (row) => rowMetrics.get(row.mint)?.freshnessDecay ?? Number.POSITIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="Fresh decay" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.freshnessDecay}
            scale={heatmapScales.freshnessDecay}
            displayValue={formatMetricScore(metrics.freshnessDecay)}
            align="right"
          />
        );
      },
    },
    {
      id: "consensusQuality",
      accessorFn: (row) => rowMetrics.get(row.mint)?.consensusQuality ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="Consensus Q" align="right" />,
      cell: ({ row }) => {
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <HeatmapMetricCell
            value={metrics.consensusQuality}
            scale={heatmapScales.consensusQuality}
            displayValue={formatMetricScore(metrics.consensusQuality)}
            align="right"
          />
        );
      },
    },
    {
      id: "setup",
      accessorFn: (row) => rowMetrics.get(row.mint)?.edgePp ?? Number.NEGATIVE_INFINITY,
      header: ({ column }) => <SortHeader column={column} label="Setup" align="right" />,
      cell: ({ row }) => {
        const setup = tradeSetups.get(row.original.mint) ?? null;
        const metrics = rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS;
        return (
          <div className="min-w-[11rem] space-y-1.5 text-right">
            <MetricLine label="Capital" value={setup && setup.suggestedCapitalUsd !== null ? formatCurrency(setup.suggestedCapitalUsd) : "—"} compact />
            <MetricLine label="Risk$" value={formatSignedCurrency(metrics.riskUsd, false)} compact />
            <MetricLine label="Edge" value={formatSignedPp(metrics.edgePp)} compact />
            <button
              type="button"
              onClick={() => setSelectedMint(row.original.mint)}
              className="btn-ghost mt-1 inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs"
            >
              <Eye className="h-4 w-4" />
              Details
            </button>
          </div>
        );
      },
    },
  ], [heatmapScales, rowMetrics, tradeSetups]);

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  function renderBoard(immersive: boolean) {
    return (
      <div className={clsx(immersive ? "h-full" : "space-y-6")}>
        <Panel
          title="Token board"
          eyebrow="Deduplicated results"
          description="One row per mint with conservative setup EV and run-relative quant heat."
          action={immersive ? (
            <Dialog.Close asChild>
              <button className="btn-ghost inline-flex items-center gap-2 border border-bg-border">
                <X className="h-4 w-4" />
                Close full screen
              </button>
            </Dialog.Close>
          ) : report ? (
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              className="btn-ghost inline-flex items-center gap-2 border border-bg-border"
            >
              <Maximize2 className="h-4 w-4" />
              Full screen
            </button>
          ) : null}
        >
          {report ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <BoardStat label="Unique tokens" value={formatInteger(boardStats.uniqueTokens)} detail={`${formatInteger(boardStats.totalEvaluations)} strategy hits before dedupe`} />
                <BoardStat label="Pass-grade tokens" value={formatInteger(boardStats.passTokens)} detail={`${formatInteger(boardStats.winnerTokens)} winner${boardStats.winnerTokens === 1 ? "" : "s"} surfaced`} />
                <BoardStat label="Overlap tokens" value={formatInteger(boardStats.overlapTokens)} detail="Seen in more than one strategy" />
                <BoardStat label="Duplicate hits removed" value={formatInteger(boardStats.duplicateHitsRemoved)} detail="Strategy repeats collapsed into unique mints" />
                <BoardStat label="Avg strategies / token" value={formatNumber(boardStats.avgRecipesPerToken)} detail="How concentrated the package is" />
                <BoardStat label="Visible rows" value={formatInteger(visibleRows.length)} detail={`${humanizeFilterLabel(resultFilter)} filter applied`} />
              </div>

              <MarketRegimeStrip
                regime={marketRegime}
                loading={marketRegimeLoading}
                error={marketRegimeError}
              />

              <div className="flex flex-col gap-3 border-t border-bg-border/80 pt-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {RESULT_FILTERS.map((filter) => (
                    <button
                      type="button"
                      key={filter.id}
                      onClick={() => setResultFilter(filter.id)}
                      className={clsx(
                        "rounded-full border px-3 py-2 text-xs font-semibold transition",
                        resultFilter === filter.id
                          ? "border-[rgba(163,230,53,0.3)] bg-[#11130f] text-text-primary"
                          : "border-bg-border bg-[#0d0d0f] text-text-secondary hover:text-text-primary",
                      )}
                    >
                      {filter.label}
                    </button>
                  ))}
                  {reportGeneratedAt ? <span className="meta-chip">Scored {formatTimestamp(reportGeneratedAt)}</span> : null}
                  {runDurationLabel ? <span className="meta-chip">Run {runDurationLabel}</span> : null}
                </div>

                <label className="relative block w-full xl:w-[18rem]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Search symbol, mint, strategy, source"
                    className="w-full rounded-[12px] border border-bg-border bg-[#0d0d0f] py-2 pl-9 pr-3 text-sm text-text-primary outline-none"
                  />
                </label>
              </div>

              {visibleRows.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                        {table.getRowModel().rows.map((row) => (
                          <TokenCard
                            key={row.id}
                            row={row.original}
                            reportGeneratedAt={reportGeneratedAt}
                            runDurationLabel={runDurationLabel}
                            metrics={rowMetrics.get(row.original.mint) ?? EMPTY_ROW_METRICS}
                            onViewDetails={() => setSelectedMint(row.original.mint)}
                          />
                        ))}
                      </div>

                  <div className="hidden md:block overflow-hidden rounded-[16px] border border-bg-border/80 bg-bg-card/45">
                    <div className={clsx("overflow-auto", immersive ? "max-h-[calc(100vh-24rem)]" : "")}>
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-bg-hover/60">
                          {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                              {headerGroup.headers.map((header) => (
                                <th key={header.id} className="table-header whitespace-nowrap">
                                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                </th>
                              ))}
                            </tr>
                          ))}
                        </thead>
                        <tbody>
                          {table.getRowModel().rows.map((row) => (
                            <tr key={row.id} className="table-row align-top">
                              {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className="table-cell">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <ResultPagination
                    showingCount={table.getRowModel().rows.length}
                    totalCount={visibleRows.length}
                    pageIndex={table.getState().pagination.pageIndex}
                    pageCount={table.getPageCount()}
                    canPrevious={table.getCanPreviousPage()}
                    canNext={table.getCanNextPage()}
                    onPrevious={() => table.previousPage()}
                    onNext={() => table.nextPage()}
                  />
                </>
              ) : (
                <EmptyState
                  title="No tokens match this filter"
                  detail="Change the search or filter to bring rows back into view."
                />
              )}

              <details className="rounded-[16px] border border-bg-border bg-[#101012]">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-text-primary">
                  Raw strategy hits ({formatInteger(report.deepEvaluations.length)})
                </summary>
                <div className="border-t border-bg-border/80 px-4 py-4">
                  {report.deepEvaluations.length > 0 ? (
                    <div className="space-y-3">
                      <div className="text-xs text-text-muted">Showing the first 60 raw rows from the current report.</div>
                      <div className="space-y-3 md:hidden">
                        {report.deepEvaluations.slice(0, 60).map((row) => (
                          <RawHitCard key={`${row.planKey}-${row.mint}`} row={row} />
                        ))}
                      </div>
                      <div className="hidden md:block overflow-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-bg-hover/50">
                            <tr>
                              <th className="table-header whitespace-nowrap">Strategy</th>
                              <th className="table-header whitespace-nowrap">Token</th>
                              <th className="table-header whitespace-nowrap">Source</th>
                              <th className="table-header whitespace-nowrap">Outcome</th>
                              <th className="table-header whitespace-nowrap text-right">Play</th>
                              <th className="table-header whitespace-nowrap">Reject reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.deepEvaluations.slice(0, 60).map((row) => (
                              <tr key={`${row.planKey}-${row.mint}`} className="table-row align-top">
                                <td className="table-cell text-text-secondary">{row.recipeName}</td>
                                <td className="table-cell">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-text-primary">{row.symbol}</div>
                                    <TokenMarketLinks mint={row.mint} symbol={row.symbol} />
                                  </div>
                                  <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">{row.mint}</div>
                                </td>
                                <td className="table-cell text-text-secondary">{humanizeLabel(row.source)}</td>
                                <td className="table-cell">
                                  <OutcomePill outcome={row.pass ? "pass" : "reject"} />
                                </td>
                                <td className="table-cell text-right tabular-nums text-text-secondary">{formatNumber(row.playScore)}</td>
                                <td className="table-cell">
                                  <span className="line-clamp-2 text-text-muted">{row.rejectReason ?? "—"}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <EmptyState title="No raw rows" detail="Completed runs expose per-strategy hits here if you need the unmerged view." />
                  )}
                </div>
              </details>
            </div>
          ) : (
            <EmptyState
              title="No report loaded"
              detail="Run the lab or open a completed run to get the deduplicated token board."
            />
          )}
        </Panel>
      </div>
    );
  }

  return (
    <Dialog.Root open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
      {renderBoard(false)}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content className="fixed inset-3 z-50 overflow-hidden rounded-[24px] border border-bg-border bg-[#070708] p-4 shadow-2xl outline-none">
          <Dialog.Title className="sr-only">Discovery lab results full screen</Dialog.Title>
          <div className="h-full overflow-auto">
            {renderBoard(true)}
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {selectedRow ? (
        <TokenDetailsDrawer
          row={selectedRow}
          tradeSetup={selectedSetup}
          metrics={selectedMetrics ?? EMPTY_ROW_METRICS}
          onClose={() => setSelectedMint(null)}
        />
      ) : null}
    </Dialog.Root>
  );
}

export function DiscoveryLabResearchSummary({ runDetail }: { runDetail: DiscoveryLabRunDetail | null }) {
  const report = runDetail?.report ?? null;
  const tokenRows = useMemo(() => buildTokenRows(report), [report]);
  const topSources = useMemo(
    () => [...(report?.sourceSummaries ?? [])]
      .sort((left, right) => (right.uniqueGoodTokens - left.uniqueGoodTokens) || (right.totalGoodTokens - left.totalGoodTokens))
      .slice(0, 3),
    [report],
  );
  const topQueries = useMemo(
    () => [...(report?.querySummaries ?? [])]
      .sort((left, right) => (right.goodCount - left.goodCount) || (right.avgGoodPlayScore - left.avgGoodPlayScore))
      .slice(0, 4),
    [report],
  );
  const topRows = useMemo(
    () => tokenRows
      .filter((row) => row.outcome !== "reject")
      .sort((left, right) => (right.winnerScore ?? right.bestPlayScore) - (left.winnerScore ?? left.bestPlayScore))
      .slice(0, 4),
    [tokenRows],
  );

  return (
    <Panel title="Research summary" description="Compact signal readouts from the current run without flooding the page with secondary tables.">
      {report ? (
        <div className="space-y-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Source leaders</div>
            <div className="mt-3 space-y-2">
              {topSources.length > 0 ? topSources.map((source) => (
                <div key={source.source} className="rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{humanizeLabel(source.source)}</div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {formatInteger(source.uniqueGoodTokens)} unique pass-grade · {formatInteger(source.totalReturned)} returned
                      </div>
                    </div>
                    <div className="text-right text-xs text-text-muted">
                      <div>Best quality</div>
                      <div className="mt-1 text-text-primary">{source.bestByQuality ?? source.bestByAverageScore ?? "—"}</div>
                    </div>
                  </div>
                </div>
              )) : <EmptyState title="No source rollups" detail="Source-level summaries land with a completed report." />}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Strategy leaders</div>
            <div className="mt-3 space-y-2">
              {topQueries.length > 0 ? topQueries.map((query) => (
                <div key={query.key} className="rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{query.recipeName}</div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {humanizeLabel(query.source)} · {formatInteger(query.goodCount)} good / {formatInteger(query.selectedCount)} selected
                      </div>
                    </div>
                    <div className="text-right text-xs text-text-secondary">
                      <div>Avg good play</div>
                      <div className="mt-1 text-sm font-semibold text-text-primary">{formatNumber(query.avgGoodPlayScore)}</div>
                    </div>
                  </div>
                </div>
              )) : <EmptyState title="No query rollups" detail="Strategy-level leaders appear after the report is written." />}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
              <Trophy className="h-3.5 w-3.5" />
              Best tokens
            </div>
            <div className="mt-3 space-y-2">
              {topRows.length > 0 ? topRows.map((row) => (
                <div key={row.mint} className="rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{row.symbol}</div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {row.outcome === "winner" ? "Winner" : "Pass-grade"} · {formatInteger(row.overlapCount)} strategy{row.overlapCount === 1 ? "" : "ies"}
                      </div>
                    </div>
                    <OutcomePill outcome={row.outcome} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <MetricTile label="Best play" value={formatNumber(row.bestPlayScore)} />
                    <MetricTile label={row.winnerScore !== null ? "Winner score" : "Best entry"} value={formatNumber(row.winnerScore ?? row.bestEntryScore)} />
                  </div>
                </div>
              )) : <EmptyState title="No pass-grade tokens" detail="This run did not produce any pass-grade or winner rows." />}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState title="No report loaded" detail="Load a completed run to populate source, strategy, and token leaders." />
      )}
    </Panel>
  );
}

function ResultPagination(props: {
  showingCount: number;
  totalCount: number;
  pageIndex: number;
  pageCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bg-border/80 px-1 pt-3">
      <div className="text-xs text-text-muted">
        Showing {formatInteger(props.showingCount)} of {formatInteger(props.totalCount)} unique tokens
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={props.onPrevious}
          disabled={!props.canPrevious}
          className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <div className="text-xs text-text-secondary">
          Page {formatInteger(props.pageIndex + 1)} of {formatInteger(props.pageCount || 1)}
        </div>
        <button
          onClick={props.onNext}
          disabled={!props.canNext}
          className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function MarketRegimeStrip(props: {
  regime: MarketRegimeSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  const toneClass = props.regime?.tone === "risk_on"
    ? "border-[rgba(163,230,53,0.35)] bg-[rgba(163,230,53,0.1)] text-[var(--success)]"
    : props.regime?.tone === "risk_off"
      ? "border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]"
      : "border-bg-border bg-[#0d0d0f] text-text-secondary";
  const statusLabel = props.regime?.label
    ?? (props.loading ? "Loading regime…" : props.error ? "Regime unavailable" : "No regime snapshot");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-bg-border bg-[#0d0d0f] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Market regime</div>
      <span className={clsx("rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", toneClass)}>
        {statusLabel}
      </span>
      {props.regime?.confidencePercent !== null && props.regime?.confidencePercent !== undefined ? (
        <span className="rounded-full border border-bg-border bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary">
          Conf {formatPercent(props.regime.confidencePercent, 0)}
        </span>
      ) : null}
      {props.regime?.chips.map((chip) => (
        <span key={`${chip.label}-${chip.value}`} className="rounded-full border border-bg-border bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary">
          {chip.label} {chip.value}
        </span>
      ))}
      {props.regime?.updatedAt ? (
        <span className="ml-auto text-[10px] text-text-muted">Updated {formatTimestamp(props.regime.updatedAt)}</span>
      ) : null}
    </div>
  );
}

function TokenCard(props: {
  row: TokenBoardRow;
  reportGeneratedAt: string | null;
  runDurationLabel: string | null;
  metrics: TokenRowMetrics;
  onViewDetails: () => void;
}) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-text-primary">{props.row.symbol}</div>
            <TokenMarketLinks mint={props.row.mint} symbol={props.row.symbol} />
          </div>
          <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">{props.row.mint}</div>
          {props.reportGeneratedAt ? (
            <div className="mt-2 text-[11px] text-text-muted">
              Scored {formatTimestamp(props.reportGeneratedAt)}
              {props.runDurationLabel ? ` · Run ${props.runDurationLabel}` : ""}
            </div>
          ) : null}
        </div>
        <OutcomePill outcome={props.row.outcome} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {props.row.sources.map((source) => (
          <span key={source} className="rounded-full border border-bg-border bg-[#0d0d0f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            {humanizeLabel(source)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricTile label="Consensus" value={`${formatInteger(props.row.overlapCount)} strategies`} />
        <MetricTile label="EV%" value={formatSignedPercent(props.metrics.evPercent)} />
        <MetricTile label="EV$" value={formatSignedCurrency(props.metrics.evUsd)} />
        <MetricTile label="EV/R" value={formatSignedRatio(props.metrics.evToRisk)} />
        <MetricTile label="Net flow" value={formatMetricScore(props.metrics.netFlowScore)} />
        <MetricTile label="Runway" value={formatRunway(props.metrics.liquidityRunway)} />
        <MetricTile label="Conc risk" value={formatMetricScore(props.metrics.concentrationRisk)} />
        <MetricTile label="Fresh decay" value={formatMetricScore(props.metrics.freshnessDecay)} />
        <MetricTile label="Consensus Q" value={formatMetricScore(props.metrics.consensusQuality)} />
      </div>

      <div className="mt-4 rounded-[14px] border border-bg-border bg-[#0d0d0f] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Watchout</div>
        <div className="mt-2 text-sm text-text-secondary">
          {props.row.topRejectReason ?? "No dominant reject pressure."}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sliceLabels(props.row.recipes, 4).map((recipe) => (
            <span key={recipe} className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary">
              {recipe}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onViewDetails}
          className="btn-ghost mt-3 inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs"
        >
          <Eye className="h-4 w-4" />
          View details
        </button>
      </div>
    </div>
  );
}

function TokenDetailsDrawer(props: {
  row: TokenBoardRow;
  tradeSetup: TokenTradeSetup | null;
  metrics: TokenRowMetrics;
  onClose: () => void;
}) {
  const signal = props.row.signal;

  return (
    <>
      <button
        type="button"
        aria-label="Close token details"
        onClick={props.onClose}
        className="fixed inset-0 z-[70] bg-black/70"
      />
      <aside className="fixed inset-y-3 right-3 z-[71] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[24px] border border-bg-border bg-[#090a0b] shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-bg-border bg-[#090a0b]/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-semibold text-text-primary">{props.row.symbol}</div>
                <OutcomePill outcome={props.row.outcome} />
              </div>
              <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">{props.row.mint}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <TokenMarketLinks mint={props.row.mint} symbol={props.row.symbol} />
              </div>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              className="btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section className="space-y-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Trade setup</div>
              <div className="mt-1 text-xs leading-5 text-text-secondary">Conservative EV model uses confidence plus stop/TP asymmetry.</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Suggested capital" value={props.tradeSetup && props.tradeSetup.suggestedCapitalUsd !== null ? formatCurrency(props.tradeSetup.suggestedCapitalUsd) : "—"} />
              <MetricTile label="Entry reference" value={formatTokenPrice(props.tradeSetup?.entryPriceUsd ?? signal?.priceUsd ?? null)} />
              <MetricTile label="Stop loss" value={formatTargetValue(props.tradeSetup?.stopLossPriceUsd ?? null, props.tradeSetup ? -props.tradeSetup.stopLossPercent : null)} />
              <MetricTile label="Take profit 1" value={formatTargetValue(props.tradeSetup?.tp1PriceUsd ?? null, props.tradeSetup?.tp1Percent ?? null)} />
              <MetricTile label="Take profit 2" value={formatTargetValue(props.tradeSetup?.tp2PriceUsd ?? null, props.tradeSetup?.tp2Percent ?? null)} />
              <MetricTile label="Max hold" value={props.tradeSetup ? formatRelativeMinutes(props.tradeSetup.maxHoldMinutes) : "—"} />
              <MetricTile label="Time stop" value={props.tradeSetup ? `${formatRelativeMinutes(props.tradeSetup.timeStopMinutes)} if under ${formatPercent(props.tradeSetup.timeStopMinReturnPercent, 0)}` : "—"} />
              <MetricTile label="2x confidence" value={props.tradeSetup ? formatPercent(props.tradeSetup.doubleUpConfidencePercent, 0) : "—"} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Expected value</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="EV%" value={formatSignedPercent(props.metrics.evPercent)} />
              <MetricTile label="EV$" value={formatSignedCurrency(props.metrics.evUsd)} />
              <MetricTile label="Risk$" value={formatSignedCurrency(props.metrics.riskUsd, false)} />
              <MetricTile label="EV/R" value={formatSignedRatio(props.metrics.evToRisk)} />
              <MetricTile label="Edge (pp)" value={formatSignedPp(props.metrics.edgePp)} />
              <MetricTile label="Runway" value={formatRunway(props.metrics.liquidityRunway)} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Market snapshot</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Liquidity" value={formatCompactCurrency(signal?.liquidityUsd)} />
              <MetricTile label="Market cap" value={formatCompactCurrency(signal?.marketCapUsd ?? props.row.winnerMarketCapUsd)} />
              <MetricTile label="5m volume" value={formatCompactCurrency(signal?.volume5mUsd ?? props.row.winnerVolume5mUsd)} />
              <MetricTile label="5m buyers" value={formatInteger(signal?.uniqueWallets5m)} />
              <MetricTile label="Buy / sell" value={signal?.buySellRatio !== null && signal?.buySellRatio !== undefined ? formatNumber(signal.buySellRatio) : "—"} />
              <MetricTile label="5m momentum" value={formatPercent(signal?.priceChange5mPercent)} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Structure and timing</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricTile label="Holders" value={formatInteger(signal?.holders)} />
              <MetricTile label="Top10 concentration" value={formatPercent(signal?.top10HolderPercent ?? props.row.winnerTop10HolderPercent)} />
              <MetricTile label="Largest holder" value={formatPercent(signal?.largestHolderPercent)} />
              <MetricTile label="Since graduation" value={formatRelativeMinutes(signal?.timeSinceGraduationMin ?? props.row.winnerTimeSinceGraduationMin)} />
              <MetricTile label="Since creation" value={formatRelativeMinutes(signal?.timeSinceCreationMin)} />
              <MetricTile label="Consensus Q" value={formatMetricScore(props.metrics.consensusQuality)} />
              <MetricTile label="Concentration risk" value={formatMetricScore(props.metrics.concentrationRisk)} />
              <MetricTile label="Freshness decay" value={formatMetricScore(props.metrics.freshnessDecay)} />
              <MetricTile label="Net flow" value={formatMetricScore(props.metrics.netFlowScore)} />
              <MetricTile label="Exit profile" value={props.tradeSetup ? humanizeProfile(props.tradeSetup.profile) : "—"} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Coverage</div>
            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
              <div className="text-sm text-text-secondary">
                {formatInteger(props.row.overlapCount)} strategy hits across {formatInteger(props.row.sources.length)} source{props.row.sources.length === 1 ? "" : "s"}.
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {props.row.recipes.map((recipe) => (
                  <span key={recipe} className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary">
                    {recipe}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">Watchouts</div>
            <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4 text-sm leading-6 text-text-secondary">
              {props.row.topRejectReason ? (
                <div>
                  <span className="font-semibold text-text-primary">Primary reject pressure:</span> {props.row.topRejectReason}
                </div>
              ) : (
                <div>No shared reject pressure captured on the best path.</div>
              )}
              <div className="mt-3">
                <span className="font-semibold text-text-primary">Soft issues:</span>{" "}
                {props.row.softIssues.length > 0 ? props.row.softIssues.join(", ") : "None recorded."}
              </div>
              <div className="mt-3">
                <span className="font-semibold text-text-primary">Notes:</span>{" "}
                {props.row.notes.length > 0 ? props.row.notes.join(" · ") : "No extra notes."}
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

function RawHitCard(props: {
  row: DiscoveryLabRunReport["deepEvaluations"][number];
}) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#0d0d0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">{props.row.recipeName}</div>
          <div className="mt-1 text-xs text-text-secondary">{humanizeLabel(props.row.source)}</div>
        </div>
        <OutcomePill outcome={props.row.pass ? "pass" : "reject"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="text-sm text-text-primary">{props.row.symbol}</div>
        <TokenMarketLinks mint={props.row.mint} symbol={props.row.symbol} />
      </div>
      <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">{props.row.mint}</div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricTile label="Play" value={formatNumber(props.row.playScore)} />
        <MetricTile label="Grade" value={props.row.grade} />
      </div>

      <div className="mt-4 text-sm text-text-secondary">
        {props.row.rejectReason ?? "No reject reason captured."}
      </div>
    </div>
  );
}

function buildTokenRows(report: DiscoveryLabRunReport | null): TokenBoardRow[] {
  if (!report) {
    return [];
  }

  const rows = new Map<string, MutableTokenBoardRow>();

  for (const evaluation of report.deepEvaluations) {
    const current = getOrCreateRow(rows, evaluation.mint, evaluation.symbol);
    current.symbol = choosePreferredSymbol(current.symbol, evaluation.symbol);
    current.sources.add(evaluation.source);
    current.recipes.add(evaluation.recipeName);
    current.modes.add(evaluation.mode);
    current.evaluationCount += 1;
    current.playScoreTotal += evaluation.playScore;
    current.bestPlayScore = Math.max(current.bestPlayScore, evaluation.playScore);
    current.bestEntryScore = Math.max(current.bestEntryScore, evaluation.entryScore);
    current.grades.add(evaluation.grade);
    if (evaluation.pass) {
      current.passedRecipes.add(evaluation.recipeName);
    } else {
      current.failedRecipes.add(evaluation.recipeName);
    }
    if (evaluation.rejectReason) {
      current.rejectReasons.set(evaluation.rejectReason, (current.rejectReasons.get(evaluation.rejectReason) ?? 0) + 1);
    }
    evaluation.softIssues.forEach((issue) => current.softIssues.add(issue));
    evaluation.notes.forEach((note) => current.notes.add(note));

    const signalPriority = evaluation.pass ? 2 : 1;
    if (
      current.signal === null
      || signalPriority > current.signalPriority
      || (signalPriority === current.signalPriority && evaluation.playScore > current.signalScore)
    ) {
      current.signal = {
        mode: evaluation.mode,
        priceUsd: evaluation.priceUsd,
        liquidityUsd: evaluation.liquidityUsd,
        marketCapUsd: evaluation.marketCapUsd,
        holders: evaluation.holders,
        volume5mUsd: evaluation.volume5mUsd,
        volume30mUsd: evaluation.volume30mUsd,
        uniqueWallets5m: evaluation.uniqueWallets5m,
        buySellRatio: evaluation.buySellRatio,
        priceChange5mPercent: evaluation.priceChange5mPercent,
        priceChange30mPercent: evaluation.priceChange30mPercent,
        top10HolderPercent: evaluation.top10HolderPercent,
        largestHolderPercent: evaluation.largestHolderPercent,
        timeSinceGraduationMin: evaluation.timeSinceGraduationMin,
        timeSinceCreationMin: evaluation.timeSinceCreationMin,
      };
      current.signalPriority = signalPriority;
      current.signalScore = evaluation.playScore;
    }
  }

  for (const winner of report.winners) {
    const current = getOrCreateRow(rows, winner.address, winner.tokenName);
    current.symbol = choosePreferredSymbol(current.symbol, winner.tokenName);
    current.winnerScore = winner.score;
    current.winnerVolume5mUsd = winner.volume5mUsd;
    current.winnerMarketCapUsd = winner.marketCapUsd;
    current.winnerTop10HolderPercent = winner.top10HolderPercent;
    current.winnerTimeSinceGraduationMin = winner.timeSinceGraduationMin;
    winner.whichRecipes.forEach((recipe) => {
      current.recipes.add(recipe);
      current.passedRecipes.add(recipe);
    });
  }

  return [...rows.values()]
    .map((row) => {
      const recipes = [...row.recipes].sort();
      const passedRecipes = [...row.passedRecipes].sort();
      const failedRecipes = [...row.failedRecipes].sort();
      const grades = [...row.grades].sort();
      const topRejectReason = [...row.rejectReasons.entries()]
        .sort((left, right) => (right[1] - left[1]) || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
      const outcome: TokenOutcome = row.winnerScore !== null ? "winner" : passedRecipes.length > 0 ? "pass" : "reject";
      const symbol = row.symbol.trim().length > 0 ? row.symbol : "Unknown token";
      return {
        mint: row.mint,
        symbol,
        outcome,
        modes: [...row.modes].sort(),
        sources: [...row.sources].sort(),
        recipes,
        passedRecipes,
        failedRecipes,
        evaluationCount: row.evaluationCount,
        overlapCount: recipes.length,
        bestPlayScore: row.bestPlayScore > Number.NEGATIVE_INFINITY ? row.bestPlayScore : 0,
        avgPlayScore: row.evaluationCount > 0 ? row.playScoreTotal / row.evaluationCount : 0,
        bestEntryScore: row.bestEntryScore > Number.NEGATIVE_INFINITY ? row.bestEntryScore : 0,
        winnerScore: row.winnerScore,
        winnerVolume5mUsd: row.winnerVolume5mUsd,
        winnerMarketCapUsd: row.winnerMarketCapUsd,
        winnerTop10HolderPercent: row.winnerTop10HolderPercent,
        winnerTimeSinceGraduationMin: row.winnerTimeSinceGraduationMin,
        grades,
        topRejectReason,
        softIssues: [...row.softIssues],
        notes: [...row.notes],
        signal: row.signal,
        searchText: [
          symbol,
          row.mint,
          ...row.modes,
          ...recipes,
          ...row.sources,
          ...passedRecipes,
          ...failedRecipes,
          ...grades,
          topRejectReason ?? "",
          ...row.softIssues,
          ...row.notes,
        ].join(" ").toLowerCase(),
      };
    })
    .sort((left, right) => (right.winnerScore ?? right.bestPlayScore) - (left.winnerScore ?? left.bestPlayScore));
}

function getOrCreateRow(rows: Map<string, MutableTokenBoardRow>, mint: string, symbol: string): MutableTokenBoardRow {
  const existing = rows.get(mint);
  if (existing) {
    return existing;
  }

  const next: MutableTokenBoardRow = {
    mint,
    symbol,
    sources: new Set<string>(),
    recipes: new Set<string>(),
    passedRecipes: new Set<string>(),
    failedRecipes: new Set<string>(),
    evaluationCount: 0,
    playScoreTotal: 0,
    bestPlayScore: Number.NEGATIVE_INFINITY,
    bestEntryScore: Number.NEGATIVE_INFINITY,
    winnerScore: null,
    winnerVolume5mUsd: null,
    winnerMarketCapUsd: null,
    winnerTop10HolderPercent: null,
    winnerTimeSinceGraduationMin: null,
    grades: new Set<string>(),
    rejectReasons: new Map<string, number>(),
    softIssues: new Set<string>(),
    notes: new Set<string>(),
    modes: new Set<DiscoveryLabRunReport["deepEvaluations"][number]["mode"]>(),
    signal: null,
    signalPriority: 0,
    signalScore: Number.NEGATIVE_INFINITY,
  };
  rows.set(mint, next);
  return next;
}

function buildBoardStats(report: DiscoveryLabRunReport | null, rows: TokenBoardRow[]) {
  const totalEvaluations = report?.deepEvaluations.length ?? 0;
  const uniqueTokens = rows.length;
  const passTokens = rows.filter((row) => row.passedRecipes.length > 0).length;
  const winnerTokens = rows.filter((row) => row.outcome === "winner").length;
  const overlapTokens = rows.filter((row) => row.overlapCount > 1).length;
  return {
    totalEvaluations,
    uniqueTokens,
    passTokens,
    winnerTokens,
    overlapTokens,
    duplicateHitsRemoved: Math.max(0, totalEvaluations - uniqueTokens),
    avgRecipesPerToken: uniqueTokens > 0 ? totalEvaluations / uniqueTokens : 0,
  };
}

function matchesResultFilter(row: TokenBoardRow, filter: ResultFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "winner") {
    return row.outcome === "winner";
  }
  if (filter === "pass") {
    return row.outcome === "winner" || row.outcome === "pass";
  }
  if (filter === "overlap") {
    return row.overlapCount > 1;
  }
  return row.outcome === "reject";
}

function matchesSearch(row: TokenBoardRow, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }
  return row.searchText.includes(query);
}

function choosePreferredSymbol(current: string, next: string): string {
  const nextValue = next.trim();
  if (nextValue.length === 0) {
    return current;
  }
  if (current.trim().length === 0 || current === "Unknown token") {
    return nextValue;
  }
  return current;
}

function humanizeLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function humanizeFilterLabel(value: ResultFilter): string {
  return RESULT_FILTERS.find((item) => item.id === value)?.label ?? "All rows";
}

function TokenMarketLinks(props: { mint: string; symbol: string }) {
  return (
    <>
      <a
        href={buildAxiomHref(props.mint)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-bg-border bg-[#0d0d0f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:text-text-primary"
        title={`Open ${props.symbol} in Axiom Pulse`}
      >
        Axiom
        <ExternalLink className="h-3 w-3" />
      </a>
      <a
        href={buildDexScreenerHref(props.mint)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-bg-border bg-[#0d0d0f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:text-text-primary"
        title={`Open ${props.symbol} on DexScreener`}
      >
        Dex
        <ExternalLink className="h-3 w-3" />
      </a>
    </>
  );
}

function buildAxiomHref(_mint: string): string {
  // Axiom's published docs expose Pulse as the stable direct entry point.
  return "https://axiom.trade/pulse";
}

function buildDexScreenerHref(mint: string): string {
  return `https://dexscreener.com/solana/${mint}`;
}

function formatRunDuration(runDetail: DiscoveryLabRunDetail | null): string | null {
  if (!runDetail) {
    return null;
  }

  const startedAt = Date.parse(runDetail.startedAt);
  const completedAt = Date.parse(runDetail.completedAt ?? "");
  if (!Number.isFinite(startedAt)) {
    return null;
  }

  const endedAt = Number.isFinite(completedAt) ? completedAt : Date.now();
  const durationMs = Math.max(0, endedAt - startedAt);
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function buildTokenTradeSetup(
  row: TokenBoardRow,
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null,
): TokenTradeSetup | null {
  if (!runtimeSnapshot) {
    return null;
  }

  const entryScore = clamp(row.bestEntryScore, 0, 1);
  const presetId = inferPresetId(row);
  const exitPlan = buildExitPlan(runtimeSnapshot.settings, entryScore, presetId);
  const entryPriceUsd = row.signal?.priceUsd ?? null;

  return {
    presetId,
    profile: exitPlan.profile,
    suggestedCapitalUsd: calculateSuggestedCapitalUsd(runtimeSnapshot, entryScore),
    entryPriceUsd,
    stopLossPercent: exitPlan.stopLossPercent,
    stopLossPriceUsd: entryPriceUsd !== null ? entryPriceUsd * (1 - exitPlan.stopLossPercent / 100) : null,
    tp1Percent: (exitPlan.tp1Multiplier - 1) * 100,
    tp1PriceUsd: entryPriceUsd !== null ? entryPriceUsd * exitPlan.tp1Multiplier : null,
    tp2Percent: (exitPlan.tp2Multiplier - 1) * 100,
    tp2PriceUsd: entryPriceUsd !== null ? entryPriceUsd * exitPlan.tp2Multiplier : null,
    maxHoldMinutes: exitPlan.timeLimitMinutes,
    timeStopMinutes: exitPlan.timeStopMinutes,
    timeStopMinReturnPercent: exitPlan.timeStopMinReturnPercent,
    doubleUpConfidencePercent: calculateDoubleUpConfidencePercent(row, runtimeSnapshot.settings.filters),
  };
}

function inferPresetId(row: TokenBoardRow): StrategyPresetId {
  return row.modes.includes("pregrad")
    ? "LATE_CURVE_MIGRATION_SNIPE"
    : "FIRST_MINUTE_POSTGRAD_CONTINUATION";
}

function calculateSuggestedCapitalUsd(
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot,
  entryScore: number,
): number {
  const cashUsd = runtimeSnapshot.botState.cashUsd;
  const baseSizeUsd = runtimeSnapshot.settings.capital.positionSizeUsd;
  const openPositions = runtimeSnapshot.openPositions;
  const maxOpenPositions = Math.max(runtimeSnapshot.settings.capital.maxOpenPositions, 1);

  if (cashUsd <= 0) {
    return 0;
  }

  const remainingSlots = Math.max(maxOpenPositions - openPositions, 1);
  const minimumTicketUsd = Math.min(cashUsd, Math.max(10, Math.min(baseSizeUsd * 0.6, 15)));
  const standardCapUsd = Math.min(cashUsd, Math.min(baseSizeUsd, cashUsd / remainingSlots));
  const exposureScale = openPositions === 0
    ? 1
    : openPositions === 1
      ? 0.94
      : 0.82;

  let plannedSizeUsd = minimumTicketUsd + Math.max(standardCapUsd - minimumTicketUsd, 0) * entryScore;
  plannedSizeUsd *= exposureScale;

  if (entryScore >= 0.88 && openPositions <= 1) {
    const boostedCapUsd = Math.min(
      cashUsd,
      Math.max(baseSizeUsd + 5, baseSizeUsd * 1.2),
    );
    const boostProgress = clamp((entryScore - 0.88) / 0.12, 0, 1);
    plannedSizeUsd = Math.max(
      plannedSizeUsd,
      standardCapUsd + Math.max(boostedCapUsd - standardCapUsd, 0) * boostProgress,
    );
  }

  const floorUsd = Math.min(cashUsd, openPositions >= maxOpenPositions - 1 ? 10 : minimumTicketUsd);
  return Math.round(clamp(plannedSizeUsd, floorUsd, cashUsd) * 100) / 100;
}

function buildExitPlan(
  settings: BotSettings,
  entryScore: number,
  presetId: StrategyPresetId,
): {
  profile: "scalp" | "balanced" | "runner";
  stopLossPercent: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  timeStopMinutes: number;
  timeStopMinReturnPercent: number;
  timeLimitMinutes: number;
} {
  const presetOverrides = presetId === "LATE_CURVE_MIGRATION_SNIPE"
    ? {
      stopLossPercent: 16,
      tp1Multiplier: 1.4,
      tp2Multiplier: 2.0,
      timeStopMinutes: 3,
      timeStopMinReturnPercent: 6,
      timeLimitMinutes: 6,
    }
    : {
      stopLossPercent: 14,
      tp1Multiplier: 1.3,
      tp2Multiplier: 2.0,
      timeStopMinutes: 4,
      timeStopMinReturnPercent: 5,
      timeLimitMinutes: 8,
    };

  const exits = {
    ...settings.exits,
    ...presetOverrides,
  };

  if (entryScore >= 0.82) {
    const timeStopMinutes = scaleMinutes(exits.timeStopMinutes, 1.7, exits.timeStopMinutes + 1, 60);
    return {
      profile: "runner",
      stopLossPercent: clamp(exits.stopLossPercent * 1.05, 12, 35),
      tp1Multiplier: Math.max(exits.tp1Multiplier + 0.15, 1.55),
      tp2Multiplier: Math.max(exits.tp2Multiplier + 0.4, 2.6),
      timeStopMinutes,
      timeStopMinReturnPercent: Math.max(exits.timeStopMinReturnPercent + 3, 8),
      timeLimitMinutes: ensureTimeLimit(
        scaleMinutes(exits.timeLimitMinutes, 1.6, exits.timeLimitMinutes + 2, 90),
        timeStopMinutes,
      ),
    };
  }

  if (entryScore >= 0.62) {
    return {
      profile: "balanced",
      stopLossPercent: exits.stopLossPercent,
      tp1Multiplier: exits.tp1Multiplier,
      tp2Multiplier: exits.tp2Multiplier,
      timeStopMinutes: exits.timeStopMinutes,
      timeStopMinReturnPercent: exits.timeStopMinReturnPercent,
      timeLimitMinutes: exits.timeLimitMinutes,
    };
  }

  const timeStopMinutes = scaleMinutes(exits.timeStopMinutes, 0.8, 1.5, exits.timeStopMinutes);
  return {
    profile: "scalp",
    stopLossPercent: clamp(exits.stopLossPercent * 0.8, 10, 25),
    tp1Multiplier: Math.max(exits.tp1Multiplier - 0.1, 1.28),
    tp2Multiplier: Math.max(exits.tp2Multiplier - 0.3, exits.tp1Multiplier + 0.25),
    timeStopMinutes,
    timeStopMinReturnPercent: Math.max(exits.timeStopMinReturnPercent - 2, 2),
    timeLimitMinutes: ensureTimeLimit(
      scaleMinutes(exits.timeLimitMinutes, 0.75, Math.max(exits.timeStopMinutes + 1, 3), exits.timeLimitMinutes),
      timeStopMinutes,
    ),
  };
}

function calculateDoubleUpConfidencePercent(
  row: TokenBoardRow,
  filters: BotSettings["filters"],
): number {
  const signal = row.signal;
  let confidence = 0.22;
  confidence += normalize(row.bestPlayScore, 0.58, 1.08) * 0.28;
  confidence += normalize(row.bestEntryScore, 0.58, 0.92) * 0.2;
  confidence += normalize(row.overlapCount, 1, 4) * 0.08;
  confidence += normalize(signal?.buySellRatio ?? filters.minBuySellRatio, filters.minBuySellRatio, filters.minBuySellRatio + 0.45) * 0.1;
  confidence += normalize(signal?.uniqueWallets5m ?? 0, filters.minUniqueBuyers5m * 0.6, filters.minUniqueBuyers5m * 2.2) * 0.06;
  confidence += normalize(signal?.liquidityUsd ?? 0, filters.minLiquidityUsd * 0.7, filters.minLiquidityUsd * 2.5) * 0.08;
  confidence += normalize(signal?.priceChange5mPercent ?? 0, -5, 25) * 0.06;

  if (row.outcome === "winner") {
    confidence += 0.06;
  } else if (row.outcome === "reject") {
    confidence -= 0.08;
  }

  if ((signal?.top10HolderPercent ?? 0) > filters.maxTop10HolderPercent) {
    confidence -= 0.05;
  }
  if ((signal?.largestHolderPercent ?? 0) > filters.maxSingleHolderPercent) {
    confidence -= 0.04;
  }

  confidence -= Math.min(row.softIssues.length, 3) * 0.04;

  return Math.round(clamp(confidence, 0.12, 0.94) * 100);
}

function buildTokenRowMetrics(row: TokenBoardRow, setup: TokenTradeSetup | null): TokenRowMetrics {
  const evModel = calculateConservativeExpectedValue(row, setup);
  return {
    ...evModel,
    netFlowScore: calculateNetFlowScore(row),
    liquidityRunway: calculateLiquidityRunway(row, setup),
    concentrationRisk: calculateConcentrationRisk(row),
    freshnessDecay: calculateFreshnessDecay(row),
    consensusQuality: calculateConsensusQuality(row),
  };
}

function calculateConservativeExpectedValue(row: TokenBoardRow, setup: TokenTradeSetup | null): Pick<TokenRowMetrics, "evPercent" | "evUsd" | "riskUsd" | "evToRisk" | "edgePp"> {
  if (!setup || setup.suggestedCapitalUsd === null) {
    return {
      evPercent: null,
      evUsd: null,
      riskUsd: null,
      evToRisk: null,
      edgePp: null,
    };
  }

  const confidence = clamp(setup.doubleUpConfidencePercent / 100, 0.08, 0.94);
  const outcomeTilt = row.outcome === "winner" ? 1.03 : row.outcome === "reject" ? 0.87 : 0.95;
  const winProbability = clamp((confidence * 0.62 * outcomeTilt) + 0.08, 0.12, 0.72);
  const conservativeRewardPercent = Math.max(((setup.tp1Percent * 0.78) + (setup.tp2Percent * 0.22)) * 0.68, 0);
  const conservativeLossPercent = Math.max(setup.stopLossPercent * 1.12, 0.1);

  const evPercent = (winProbability * conservativeRewardPercent) - ((1 - winProbability) * conservativeLossPercent);
  const riskUsd = setup.suggestedCapitalUsd * (conservativeLossPercent / 100);
  const evUsd = setup.suggestedCapitalUsd * (evPercent / 100);
  const evToRisk = riskUsd > 0 ? evUsd / riskUsd : null;
  const breakEvenProbability = conservativeLossPercent / Math.max(conservativeLossPercent + conservativeRewardPercent, 0.0001);
  const edgePp = (winProbability - breakEvenProbability) * 100;

  return {
    evPercent,
    evUsd,
    riskUsd,
    evToRisk,
    edgePp,
  };
}

function calculateNetFlowScore(row: TokenBoardRow): number | null {
  const signal = row.signal;
  if (!signal) {
    return null;
  }
  const ratio = normalize(signal.buySellRatio ?? 1, 0.9, 2.1);
  const buyers = normalize(signal.uniqueWallets5m ?? 0, 8, 140);
  const momentum = normalize(signal.priceChange5mPercent ?? 0, -12, 25);
  const driftPenalty = normalize(Math.abs(signal.priceChange30mPercent ?? 0), 0, 42);
  const raw = (ratio * 42) + (buyers * 25) + (momentum * 33) - (driftPenalty * 20);
  return clamp(raw, 0, 100);
}

function calculateLiquidityRunway(row: TokenBoardRow, setup: TokenTradeSetup | null): number | null {
  const capital = setup?.suggestedCapitalUsd ?? null;
  const liquidity = row.signal?.liquidityUsd ?? null;
  if (capital === null || liquidity === null || capital <= 0) {
    return null;
  }
  return liquidity / capital;
}

function calculateConcentrationRisk(row: TokenBoardRow): number | null {
  const top10 = row.signal?.top10HolderPercent ?? row.winnerTop10HolderPercent;
  const largest = row.signal?.largestHolderPercent;
  if (top10 === null || top10 === undefined) {
    return null;
  }
  const top10Risk = normalize(top10, 25, 92) * 65;
  const largestRisk = normalize(largest ?? 0, 8, 45) * 35;
  return clamp(top10Risk + largestRisk, 0, 100);
}

function calculateFreshnessDecay(row: TokenBoardRow): number | null {
  const sinceGrad = row.signal?.timeSinceGraduationMin ?? row.winnerTimeSinceGraduationMin;
  const sinceCreation = row.signal?.timeSinceCreationMin;
  if (sinceGrad === null || sinceGrad === undefined) {
    return null;
  }
  const agePressure = normalize(sinceGrad, 2, 65) * 72;
  const creationPressure = normalize(sinceCreation ?? sinceGrad, 4, 180) * 18;
  const momentumRelief = normalize(row.signal?.priceChange5mPercent ?? 0, -8, 18) * 12;
  return clamp(agePressure + creationPressure - momentumRelief, 0, 100);
}

function calculateConsensusQuality(row: TokenBoardRow): number {
  const passRate = row.overlapCount > 0 ? row.passedRecipes.length / row.overlapCount : 0;
  const overlapSignal = normalize(row.overlapCount, 1, 5);
  const playSignal = normalize(row.bestPlayScore, 0.58, 1.08);
  const entrySignal = normalize(row.bestEntryScore, 0.55, 0.95);
  const outcomeBonus = row.outcome === "winner" ? 8 : row.outcome === "reject" ? -10 : 2;
  const raw = (passRate * 34) + (overlapSignal * 20) + (playSignal * 28) + (entrySignal * 18) + outcomeBonus;
  return clamp(raw, 0, 100);
}

function buildHeatmapScales(rows: TokenBoardRow[], metricsByMint: Map<string, TokenRowMetrics>): Record<HeatmapMetricKey, HeatmapScale | null> {
  const scales = {} as Record<HeatmapMetricKey, HeatmapScale | null>;
  for (const config of HEATMAP_METRIC_CONFIG) {
    const values = rows
      .map((row) => metricsByMint.get(row.mint)?.[config.key])
      .filter(isFiniteNumber);
    scales[config.key] = values.length >= 3
      ? {
        direction: config.direction,
        thresholds: buildQuantileThresholds(values),
      }
      : null;
  }
  return scales;
}

function buildQuantileThresholds(values: number[]): [number, number, number, number] {
  const sorted = [...values].sort((left, right) => left - right);
  return [
    quantile(sorted, 0.2),
    quantile(sorted, 0.4),
    quantile(sorted, 0.6),
    quantile(sorted, 0.8),
  ];
}

function quantile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0] ?? 0;
  }
  const safePercentile = clamp(percentile, 0, 1);
  const index = (sortedValues.length - 1) * safePercentile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lowerValue = sortedValues[lowerIndex] ?? 0;
  const upperValue = sortedValues[upperIndex] ?? lowerValue;
  if (lowerIndex === upperIndex) {
    return lowerValue;
  }
  return lowerValue + ((upperValue - lowerValue) * (index - lowerIndex));
}

function getHeatmapBand(value: number, scale: HeatmapScale | null): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (!scale) {
    return 2;
  }
  const [q20, q40, q60, q80] = scale.thresholds;
  let band = 0;
  if (value > q80) {
    band = 4;
  } else if (value > q60) {
    band = 3;
  } else if (value > q40) {
    band = 2;
  } else if (value > q20) {
    band = 1;
  }
  return scale.direction === "lower_better" ? 4 - band : band;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatPercent(Math.abs(value), 1)}`;
}

function formatSignedCurrency(value: number | null, includePlus = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 && includePlus ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(value), 2)}`;
}

function formatSignedRatio(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value))}R`;
}

function formatSignedPp(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value))}pp`;
}

function formatMetricScore(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return formatNumber(Math.round(value));
}

function formatRunway(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  if (value >= 100) {
    return `${formatNumber(value)}x`;
  }
  if (value >= 10) {
    return `${formatNumber(Math.round(value * 10) / 10)}x`;
  }
  return `${formatNumber(Math.round(value * 100) / 100)}x`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeMarketRegime(payload: unknown): MarketRegimeSnapshot | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const metrics = asRecord(root.metrics);
  const scores = asRecord(root.scores);
  const sources = [root, metrics, scores].filter(Boolean) as Record<string, unknown>[];

  const label = pickString(sources, ["regime", "marketRegime", "label", "state", "phase", "classification"]);
  const updatedAt = pickString(sources, ["updatedAt", "asOf", "timestamp", "calculatedAt"]);
  const confidence = normalizePercentLike(pickNumber(sources, ["confidencePercent", "confidence", "probability"]));
  const chips = collectRegimeChips(sources);
  const tone = inferRegimeTone(label, chips);

  if (!label && confidence === null && chips.length === 0) {
    return null;
  }

  return {
    label: label ?? "Balanced",
    tone,
    confidencePercent: confidence,
    updatedAt,
    chips: chips.slice(0, 4),
  };
}

function collectRegimeChips(sources: Record<string, unknown>[]): Array<{ label: string; value: string }> {
  const definitions: Array<{ label: string; keys: string[] }> = [
    { label: "Momentum", keys: ["momentumScore", "momentum", "trendScore"] },
    { label: "Breadth", keys: ["breadthScore", "breadth", "participationScore"] },
    { label: "Vol", keys: ["volatilityScore", "volatility", "volatilityRisk"] },
    { label: "Liquidity", keys: ["liquidityScore", "depthScore", "liquidity"] },
  ];
  const chips: Array<{ label: string; value: string }> = [];

  for (const definition of definitions) {
    const rawValue = pickNumber(sources, definition.keys);
    if (rawValue === null) {
      continue;
    }
    if (Math.abs(rawValue) <= 1) {
      chips.push({ label: definition.label, value: formatPercent(rawValue * 100, 0) });
      continue;
    }
    if (Math.abs(rawValue) <= 100) {
      chips.push({ label: definition.label, value: formatNumber(rawValue) });
      continue;
    }
    chips.push({ label: definition.label, value: formatCompactCurrency(rawValue) });
  }

  return chips;
}

function inferRegimeTone(label: string | null, chips: Array<{ label: string; value: string }>): MarketRegimeTone {
  const text = `${label ?? ""} ${chips.map((chip) => `${chip.label} ${chip.value}`).join(" ")}`.toLowerCase();
  if (text.includes("risk_on") || text.includes("risk on") || text.includes("bull") || text.includes("expansion")) {
    return "risk_on";
  }
  if (text.includes("risk_off") || text.includes("risk off") || text.includes("bear") || text.includes("stress") || text.includes("defensive")) {
    return "risk_off";
  }
  return "balanced";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickNumber(sources: Record<string, unknown>[], keys: string[]): number | null {
  for (const source of sources) {
    for (const key of keys) {
      const candidate = source[key];
      const numeric = typeof candidate === "number" ? candidate : Number(candidate);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return null;
}

function pickString(sources: Record<string, unknown>[], keys: string[]): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const candidate = source[key];
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }
  return null;
}

function normalizePercentLike(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (Math.abs(value) <= 1) {
    return value * 100;
  }
  return value;
}

function sliceLabels(values: string[], limit: number): string[] {
  return values.slice(0, limit);
}

function SortHeader(props: { column: Column<TokenBoardRow, unknown>; label: string; align?: "left" | "right" }) {
  const canSort = props.column.getCanSort();
  const direction = props.column.getIsSorted();
  return (
    <button
      type="button"
      onClick={canSort ? props.column.getToggleSortingHandler() : undefined}
      className={clsx(
        "inline-flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted",
        props.align === "right" ? "justify-end" : "justify-start",
        canSort ? "cursor-pointer" : "cursor-default",
      )}
    >
      {props.label}
      {canSort ? (
        <ChevronsUpDown className={clsx("h-3.5 w-3.5", direction ? "text-text-secondary" : "text-text-muted")} />
      ) : null}
    </button>
  );
}

function BoardStat(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">{props.label}</div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">{props.value}</div>
      <div className="mt-2 text-xs leading-5 text-text-secondary">{props.detail}</div>
    </div>
  );
}

function HeatmapMetricCell(props: {
  value: number | null;
  scale: HeatmapScale | null;
  displayValue: string;
  align?: "left" | "right";
}) {
  const band = props.value !== null ? getHeatmapBand(props.value, props.scale) : null;
  const toneClass = band === null
    ? "border-bg-border bg-[#0f1011] text-text-muted"
    : HEATMAP_BAND_CLASSES[band];
  return (
    <div className={clsx("min-w-[5.75rem]", props.align === "right" ? "text-right" : "text-left")}>
      <span className={clsx("inline-flex min-w-[5.75rem] justify-end rounded-[9px] border px-2 py-1 text-xs font-semibold tabular-nums", toneClass)}>
        {props.displayValue}
      </span>
    </div>
  );
}

function OutcomePill(props: { outcome: TokenOutcome; compact?: boolean }) {
  const tone = props.outcome === "winner"
    ? "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
    : props.outcome === "pass"
      ? "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]"
      : "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]";

  return (
    <span className={clsx(
      "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.14em]",
      props.compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
      tone,
    )}>
      {props.outcome === "winner" ? "Winner" : props.outcome === "pass" ? "Pass grade" : "Reject"}
    </span>
  );
}

function MetricLine(props: { label: string; value: string; emphasis?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={clsx("uppercase tracking-[0.16em] text-text-muted", props.compact ? "text-[10px]" : "text-[11px]")}>{props.label}</span>
      <span className={clsx(
        "font-medium tabular-nums",
        props.compact ? "text-xs" : "text-sm",
        props.emphasis ? "text-text-primary" : "text-text-secondary",
      )}>
        {props.value}
      </span>
    </div>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-[#0d0d0f] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">{props.label}</div>
      <div className="mt-2 text-sm font-semibold tabular-nums text-text-primary">{props.value}</div>
    </div>
  );
}

function formatTokenPrice(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  const digits = value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return formatCurrency(value, digits);
}

function formatTargetValue(priceUsd: number | null, percent: number | null): string {
  const direction = percent !== null && percent < 0 ? "" : "+";
  if (priceUsd === null || priceUsd === undefined) {
    return percent === null || percent === undefined ? "—" : `${direction}${formatPercent(percent, 0)}`;
  }
  if (percent === null || percent === undefined) {
    return formatTokenPrice(priceUsd);
  }
  return `${formatTokenPrice(priceUsd)} · ${direction}${formatPercent(percent, 0)}`;
}

function humanizeProfile(value: "scalp" | "balanced" | "runner"): string {
  return value === "scalp" ? "Scalp" : value === "balanced" ? "Balanced" : "Runner";
}

function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }
  return clamp((value - min) / (max - min), 0, 1);
}

function ensureTimeLimit(value: number, timeStopMinutes: number): number {
  return Math.max(value, Math.round((timeStopMinutes + 1) * 10) / 10);
}

function scaleMinutes(value: number, multiplier: number, min: number, max: number): number {
  return clamp(Math.round(value * multiplier * 10) / 10, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const EMPTY_ROW_METRICS: TokenRowMetrics = {
  evPercent: null,
  evUsd: null,
  riskUsd: null,
  evToRisk: null,
  edgePp: null,
  netFlowScore: null,
  liquidityRunway: null,
  concentrationRisk: null,
  freshnessDecay: null,
  consensusQuality: null,
};

const HEATMAP_METRIC_CONFIG: Array<{ key: HeatmapMetricKey; direction: HeatmapScale["direction"] }> = [
  { key: "evPercent", direction: "higher_better" },
  { key: "evUsd", direction: "higher_better" },
  { key: "evToRisk", direction: "higher_better" },
  { key: "netFlowScore", direction: "higher_better" },
  { key: "concentrationRisk", direction: "lower_better" },
  { key: "freshnessDecay", direction: "lower_better" },
  { key: "consensusQuality", direction: "higher_better" },
];

const HEATMAP_BAND_CLASSES = [
  "border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.14)] text-[var(--danger)]",
  "border-[rgba(251,146,60,0.35)] bg-[rgba(251,146,60,0.14)] text-[#FDBA74]",
  "border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.05)] text-text-secondary",
  "border-[rgba(163,230,53,0.28)] bg-[rgba(163,230,53,0.12)] text-[#BEF264]",
  "border-[rgba(163,230,53,0.4)] bg-[rgba(163,230,53,0.2)] text-[var(--success)]",
] as const;

const RESULT_FILTERS: Array<{ id: ResultFilter; label: string }> = [
  { id: "all", label: "All unique" },
  { id: "pass", label: "Pass grade" },
  { id: "winner", label: "Winners" },
  { id: "overlap", label: "Overlap" },
  { id: "reject", label: "Rejects" },
];
