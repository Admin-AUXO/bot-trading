"use client";

import * as Dialog from "@radix-ui/react-dialog";
import clsx from "clsx";
import {
  type ColDef,
  type GetRowIdParams,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  ExternalLink,
  Maximize2,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { EmptyState, Panel, ScanStat } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  WorkflowBadge,
  WorkflowSection,
  WorkflowStat,
} from "@/components/workflow-ui";
import { fetchJson } from "@/lib/api";
import {
  formatCompactCurrency,
  formatCurrency,
  formatInteger,
  formatNumber,
  formatPercent,
  formatRelativeMinutes,
  formatTimestamp,
} from "@/lib/format";
import type {
  AdaptiveDecisionBand,
  AdaptiveWinnerCohort,
  BotSettings,
  DiscoveryLabManualEntryResponse,
  DiscoveryLabRunDetail,
  DiscoveryLabRunReport,
  DiscoveryLabRuntimeSnapshot,
  DiscoveryLabTokenInsight,
  PositionBookPayload,
  PositionBookRow,
} from "@/lib/types";
import { useHydrated } from "@/lib/use-hydrated";

type ResultFilter = "all" | "winner" | "pass" | "overlap" | "reject";
type TokenOutcome = "winner" | "pass" | "reject";
type StrategyPresetId =
  | "FIRST_MINUTE_POSTGRAD_CONTINUATION"
  | "LATE_CURVE_MIGRATION_SNIPE";

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
  tp1SellFractionPercent: number;
  tp2Percent: number;
  tp2PriceUsd: number | null;
  tp2SellFractionPercent: number;
  postTp1RetracePercent: number;
  trailingStopPercent: number;
  maxHoldMinutes: number;
  timeStopMinutes: number;
  timeStopMinReturnPercent: number;
  doubleUpConfidencePercent: number;
};

type ManualTradeDraft = {
  positionSizeUsd: string;
  stopLossPercent: string;
  tp1Percent: string;
  tp1SellFractionPercent: string;
  tp2Percent: string;
  tp2SellFractionPercent: string;
  postTp1RetracePercent: string;
  trailingStopPercent: string;
  timeStopMinutes: string;
  timeStopMinReturnPercent: string;
  timeLimitMinutes: string;
};

type ManualTradeIssue = {
  level: "error" | "warning";
  message: string;
};

type ManualExitPresetId = "calibrated" | "scalp" | "balanced" | "runner";

type TokenBoardRow = {
  mint: string;
  pairAddress: string | null;
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
  tradeSetup:
    | DiscoveryLabRunReport["deepEvaluations"][number]["tradeSetup"]
    | null;
  searchText: string;
};

type InsightState = {
  loading: boolean;
  data: DiscoveryLabTokenInsight | null;
  error: string | null;
};

type MutableTokenBoardRow = {
  mint: string;
  pairAddress: string | null;
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
  tradeSetup:
    | DiscoveryLabRunReport["deepEvaluations"][number]["tradeSetup"]
    | null;
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

type HeatmapMetricKey =
  | "evPercent"
  | "evUsd"
  | "evToRisk"
  | "netFlowScore"
  | "concentrationRisk"
  | "freshnessDecay"
  | "consensusQuality";

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

const MOBILE_PAGE_SIZE = 12;

export function DiscoveryLabResultsBoard(props: {
  runDetail: DiscoveryLabRunDetail | null;
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null;
  onRuntimeSnapshotChange: (snapshot: DiscoveryLabRuntimeSnapshot) => void;
}) {
  const { runDetail, runtimeSnapshot, onRuntimeSnapshotChange } = props;
  const report = runDetail?.report ?? null;
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [mobilePageIndex, setMobilePageIndex] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [tradeTicketMint, setTradeTicketMint] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeSnapshot | null>(
    null,
  );
  const [marketRegimeLoading, setMarketRegimeLoading] = useState(false);
  const [marketRegimeError, setMarketRegimeError] = useState<string | null>(
    null,
  );
  const [manualEntryPendingMint, setManualEntryPendingMint] = useState<
    string | null
  >(null);
  const [manualEntryError, setManualEntryError] = useState<string | null>(null);
  const [manualEntrySuccess, setManualEntrySuccess] = useState<{
    mint: string;
    symbol: string;
    positionId: string;
  } | null>(null);
  const [openPositionRows, setOpenPositionRows] = useState<PositionBookRow[]>(
    [],
  );
  const [insightByMint, setInsightByMint] = useState<
    Record<string, InsightState>
  >({});
  const hydrated = useHydrated();
  const deferredSearchText = useDeferredValue(searchText);

  const tokenRows = useMemo(() => buildTokenRows(report), [report]);
  const tradeSetups = useMemo(
    () =>
      new Map(
        tokenRows.map((row) => [
          row.mint,
          buildTokenTradeSetup(row, runtimeSnapshot),
        ]),
      ),
    [runtimeSnapshot, tokenRows],
  );
  const rowMetrics = useMemo(
    () =>
      new Map(
        tokenRows.map((row) => [
          row.mint,
          buildTokenRowMetrics(row, tradeSetups.get(row.mint) ?? null),
        ]),
      ),
    [tokenRows, tradeSetups],
  );
  const boardStats = useMemo(
    () => buildBoardStats(report, tokenRows),
    [report, tokenRows],
  );
  const cohortSummaries = useMemo(
    () =>
      runDetail?.strategyCalibration?.winnerCohorts ??
      buildCohortSummaries(tokenRows),
    [runDetail?.strategyCalibration?.winnerCohorts, tokenRows],
  );
  const decisionBands = useMemo(
    () =>
      runDetail?.strategyCalibration?.decisionBands ??
      buildDecisionBands(cohortSummaries),
    [cohortSummaries, runDetail?.strategyCalibration?.decisionBands],
  );
  const visibleRows = useMemo(
    () =>
      tokenRows.filter(
        (row) =>
          matchesResultFilter(row, resultFilter) &&
          matchesSearch(row, deferredSearchText),
      ),
    [deferredSearchText, resultFilter, tokenRows],
  );
  const mobileSortedRows = useMemo(
    () => [...visibleRows].sort(compareDiscoveryRowsForMobile),
    [visibleRows],
  );
  const mobilePageCount = Math.max(
    1,
    Math.ceil(mobileSortedRows.length / MOBILE_PAGE_SIZE),
  );
  const mobilePageRows = useMemo(() => {
    const start = mobilePageIndex * MOBILE_PAGE_SIZE;
    return mobileSortedRows.slice(start, start + MOBILE_PAGE_SIZE);
  }, [mobilePageIndex, mobileSortedRows]);
  const selectedRow = useMemo(
    () => tokenRows.find((row) => row.mint === selectedMint) ?? null,
    [selectedMint, tokenRows],
  );
  const tradeTicketRow = useMemo(
    () => tokenRows.find((row) => row.mint === tradeTicketMint) ?? null,
    [tokenRows, tradeTicketMint],
  );
  const selectedSetup = selectedRow
    ? (tradeSetups.get(selectedRow.mint) ?? null)
    : null;
  const selectedMetrics = selectedRow
    ? (rowMetrics.get(selectedRow.mint) ?? null)
    : null;
  const tradeTicketSetup = tradeTicketRow
    ? (tradeSetups.get(tradeTicketRow.mint) ?? null)
    : null;
  const tradeTicketMetrics = tradeTicketRow
    ? (rowMetrics.get(tradeTicketRow.mint) ?? null)
    : null;
  const openPositionByMint = useMemo(
    () => new Map(openPositionRows.map((row) => [row.mint, row])),
    [openPositionRows],
  );
  const selectedTrackedPosition = selectedRow
    ? (openPositionByMint.get(selectedRow.mint) ?? null)
    : null;
  const tradeTicketTrackedPosition = tradeTicketRow
    ? (openPositionByMint.get(tradeTicketRow.mint) ?? null)
    : null;
  const selectedInsightState = selectedRow
    ? (insightByMint[selectedRow.mint] ?? EMPTY_INSIGHT_STATE)
    : EMPTY_INSIGHT_STATE;
  const tradeTicketInsightState = tradeTicketRow
    ? (insightByMint[tradeTicketRow.mint] ?? EMPTY_INSIGHT_STATE)
    : EMPTY_INSIGHT_STATE;

  async function refreshOpenPositions() {
    try {
      const payload = await fetchJson<PositionBookPayload>(
        "/operator/positions?book=open",
      );
      setOpenPositionRows(payload.rows);
    } catch {
      setOpenPositionRows([]);
    }
  }

  async function ensureTokenInsight(mint: string) {
    const current = insightByMint[mint];
    if (current?.loading || current?.data) {
      return;
    }

    setInsightByMint((state) => ({
      ...state,
      [mint]: {
        loading: true,
        data: state[mint]?.data ?? null,
        error: null,
      },
    }));

    try {
      const payload = await fetchJson<DiscoveryLabTokenInsight>(
        `/operator/discovery-lab/token-insight?mint=${encodeURIComponent(mint)}`,
      );
      setInsightByMint((state) => ({
        ...state,
        [mint]: {
          loading: false,
          data: payload,
          error: null,
        },
      }));
    } catch (error) {
      setInsightByMint((state) => ({
        ...state,
        [mint]: {
          loading: false,
          data: state[mint]?.data ?? null,
          error:
            error instanceof Error
              ? error.message
              : "token insight unavailable",
        },
      }));
    }
  }

  useEffect(() => {
    setMobilePageIndex(0);
  }, [deferredSearchText, resultFilter, runDetail?.id]);

  useEffect(() => {
    if (mobilePageIndex >= mobilePageCount) {
      setMobilePageIndex(Math.max(0, mobilePageCount - 1));
    }
  }, [mobilePageCount, mobilePageIndex]);

  useEffect(() => {
    if (selectedMint && !selectedRow) {
      setSelectedMint(null);
    }
  }, [selectedMint, selectedRow]);

  useEffect(() => {
    if (tradeTicketMint && !tradeTicketRow) {
      setTradeTicketMint(null);
    }
  }, [tradeTicketMint, tradeTicketRow]);

  useEffect(() => {
    void refreshOpenPositions();
  }, [runDetail?.id]);

  useEffect(() => {
    if (selectedRow) {
      void ensureTokenInsight(selectedRow.mint);
    }
  }, [selectedRow?.mint]);

  useEffect(() => {
    if (tradeTicketRow) {
      void ensureTokenInsight(tradeTicketRow.mint);
    }
  }, [tradeTicketRow?.mint]);

  async function submitManualTrade(
    row: TokenBoardRow,
    draft: ManualTradeDraft,
  ) {
    const disabledReason = getManualTradeDisabledReason(
      row,
      runtimeSnapshot,
      runDetail,
      openPositionByMint.get(row.mint) ?? null,
    );
    if (disabledReason) {
      setManualEntryError(disabledReason);
      setManualEntrySuccess(null);
      return;
    }
    if (!runDetail) {
      return;
    }

    setManualEntryPendingMint(row.mint);
    setManualEntryError(null);
    setManualEntrySuccess(null);

    try {
      const response = await fetchJson<DiscoveryLabManualEntryResponse>(
        "/operator/discovery-lab/manual-entry",
        {
          method: "POST",
          body: JSON.stringify({
            runId: runDetail.id,
            mint: row.mint,
            positionSizeUsd: Number(draft.positionSizeUsd),
            exitOverrides: {
              stopLossPercent: Number(draft.stopLossPercent),
              tp1Percent: Number(draft.tp1Percent),
              tp1SellFractionPercent: Number(draft.tp1SellFractionPercent),
              tp2Percent: Number(draft.tp2Percent),
              tp2SellFractionPercent: Number(draft.tp2SellFractionPercent),
              postTp1RetracePercent: Number(draft.postTp1RetracePercent),
              trailingStopPercent: Number(draft.trailingStopPercent),
              timeStopMinutes: Number(draft.timeStopMinutes),
              timeStopMinReturnPercent: Number(draft.timeStopMinReturnPercent),
              timeLimitMinutes: Number(draft.timeLimitMinutes),
            },
          }),
        },
      );
      const [nextRuntime, nextOpenPositions] = await Promise.all([
        fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
        fetchJson<PositionBookPayload>("/operator/positions?book=open"),
      ]);
      onRuntimeSnapshotChange(nextRuntime);
      setOpenPositionRows(nextOpenPositions.rows);
      setManualEntrySuccess({
        mint: row.mint,
        symbol: response.symbol,
        positionId: response.positionId,
      });
      setManualEntryError(null);
      setTradeTicketMint(null);
    } catch (error) {
      setManualEntryError(
        error instanceof Error ? error.message : "failed to enter manual trade",
      );
      setManualEntrySuccess(null);
    } finally {
      setManualEntryPendingMint(null);
    }
  }

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
        const payload = await fetchJson<unknown>(
          `/operator/discovery-lab/market-regime?runId=${encodeURIComponent(runId)}`,
        );
        if (cancelled) {
          return;
        }
        setMarketRegime(normalizeMarketRegime(payload));
        setMarketRegimeError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setMarketRegimeError(
          error instanceof Error ? error.message : "Market regime unavailable",
        );
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

  const reportGeneratedAt =
    report?.generatedAt ??
    runDetail?.completedAt ??
    runDetail?.startedAt ??
    null;
  const runDurationLabel = hydrated
    ? formatRunDuration(runDetail)
    : "Syncing...";
  const hasAnyTokens = boardStats.uniqueTokens > 0;
  const hasAnyRawHits = Boolean(report?.deepEvaluations.length);
  const showSecondarySynthesis =
    hasAnyTokens &&
    (cohortSummaries.length > 0 || decisionBands.length > 0 || boardStats.overlapTokens > 0);

  const columnDefs = useMemo<ColDef<TokenBoardRow>[]>(
    () => [
      {
        colId: "token",
        headerName: "Token",
        minWidth: 360,
        flex: 1.25,
        wrapText: true,
        autoHeight: true,
        cellClass: "ag-grid-cell-wrap",
        valueGetter: (params) => params.data?.symbol ?? "",
        cellRenderer: (params: ICellRendererParams<TokenBoardRow>) => {
          const row = params.data;
          if (!row) {
            return null;
          }
          const trackedPosition = openPositionByMint.get(row.mint) ?? null;
          const metrics = rowMetrics.get(row.mint) ?? EMPTY_ROW_METRICS;
          const leadSource = row.sources[0] ?? null;
          return (
            <div className="min-w-[17rem] py-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-text-primary">
                  {row.symbol}
                </div>
                <OutcomePill outcome={row.outcome} compact />
                {trackedPosition ? (
                  <Badge variant="default">Open position</Badge>
                ) : null}
                {leadSource ? (
                  <Badge variant="default">{humanizeLabel(leadSource)}</Badge>
                ) : null}
              </div>
              <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">
                {truncateMiddle(row.mint, 8, 6)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="default">
                  {formatInteger(row.overlapCount)} hits
                </Badge>
                <Badge variant="default">
                  {row.winnerScore !== null
                    ? `Winner ${formatNumber(row.winnerScore)}`
                    : `Entry ${formatNumber(row.bestEntryScore)}`}
                </Badge>
                <Badge variant="default">
                  Consensus {formatMetricScore(metrics.consensusQuality)}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <TokenMarketLinks
                  mint={row.mint}
                  pairAddress={row.pairAddress}
                  symbol={row.symbol}
                  creator={null}
                />
              </div>
            </div>
          );
        },
      },
      {
        colId: "flow",
        headerName: "Flow",
        minWidth: 185,
        maxWidth: 220,
        wrapText: true,
        autoHeight: true,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-number",
        valueGetter: (params) =>
          params.data
            ? (rowMetrics.get(params.data.mint)?.netFlowScore ??
              Number.NEGATIVE_INFINITY)
            : Number.NEGATIVE_INFINITY,
        cellRenderer: (params: ICellRendererParams<TokenBoardRow>) => {
          const row = params.data;
          if (!row) {
            return null;
          }
          const signal = row.signal;
          const metrics = rowMetrics.get(row.mint) ?? EMPTY_ROW_METRICS;
          return (
            <div className="min-w-[10rem] text-center">
              <MetricLine
                label="5m vol"
                value={formatCompactCurrency(
                  signal?.volume5mUsd ?? row.winnerVolume5mUsd,
                )}
                compact
              />
              <MetricLine
                label="5m buyers"
                value={formatInteger(signal?.uniqueWallets5m)}
                compact
              />
              <MetricLine
                label="Buy / sell"
                value={
                  signal?.buySellRatio !== null &&
                  signal?.buySellRatio !== undefined
                    ? formatNumber(signal.buySellRatio)
                    : "—"
                }
                compact
              />
              <MetricLine
                label="Flow"
                value={formatMetricScore(metrics.netFlowScore)}
                compact
                emphasis={(metrics.netFlowScore ?? 0) >= 60}
              />
            </div>
          );
        },
      },
      {
        colId: "structure",
        headerName: "Structure",
        minWidth: 185,
        maxWidth: 220,
        wrapText: true,
        autoHeight: true,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-number",
        valueGetter: (params) =>
          params.data
            ? (params.data.signal?.liquidityUsd ?? Number.NEGATIVE_INFINITY)
            : Number.NEGATIVE_INFINITY,
        cellRenderer: (params: ICellRendererParams<TokenBoardRow>) => {
          const row = params.data;
          if (!row) {
            return null;
          }
          const signal = row.signal;
          const outcomeMarketCapLabel = getOutcomeMarketCapLabel(row);
          const outcomeMarketCapUsd = getOutcomeMarketCapUsd(row);
          return (
            <div className="min-w-[10rem] text-center">
              <MetricLine
                label="Liquidity"
                value={formatCompactCurrency(signal?.liquidityUsd)}
                compact
              />
              <MetricLine
                label={outcomeMarketCapLabel ?? "Mcap"}
                value={formatCompactCurrency(outcomeMarketCapUsd)}
                compact
              />
              <MetricLine
                label="Top10"
                value={formatPercent(
                  signal?.top10HolderPercent ?? row.winnerTop10HolderPercent,
                )}
                compact
              />
              <MetricLine
                label="Largest"
                value={formatPercent(signal?.largestHolderPercent)}
                compact
              />
            </div>
          );
        },
      },
      {
        colId: "timing",
        headerName: "Timing",
        minWidth: 185,
        maxWidth: 220,
        wrapText: true,
        autoHeight: true,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-number",
        valueGetter: (params) =>
          params.data
            ? (rowMetrics.get(params.data.mint)?.freshnessDecay ??
              Number.POSITIVE_INFINITY)
            : Number.POSITIVE_INFINITY,
        cellRenderer: (params: ICellRendererParams<TokenBoardRow>) => {
          const row = params.data;
          if (!row) {
            return null;
          }
          const signal = row.signal;
          const metrics = rowMetrics.get(row.mint) ?? EMPTY_ROW_METRICS;
          return (
            <div className="min-w-[10rem] text-center">
              <MetricLine
                label="Since grad"
                value={formatRelativeMinutes(
                  signal?.timeSinceGraduationMin ??
                    row.winnerTimeSinceGraduationMin,
                )}
                compact
              />
              <MetricLine
                label="5m move"
                value={formatPercent(signal?.priceChange5mPercent)}
                compact
              />
              <MetricLine
                label="30m move"
                value={formatPercent(signal?.priceChange30mPercent)}
                compact
              />
              <MetricLine
                label="Freshness"
                value={formatMetricScore(metrics.freshnessDecay)}
                compact
                emphasis={(metrics.freshnessDecay ?? 100) <= 40}
              />
            </div>
          );
        },
      },
      {
        colId: "setup",
        headerName: "Setup",
        minWidth: 240,
        maxWidth: 280,
        pinned: "right",
        wrapText: true,
        autoHeight: true,
        headerClass: "ag-grid-header-center",
        cellClass: "ag-grid-cell-wrap",
        valueGetter: (params) =>
          params.data
            ? (rowMetrics.get(params.data.mint)?.edgePp ??
              Number.NEGATIVE_INFINITY)
            : Number.NEGATIVE_INFINITY,
        cellRenderer: (params: ICellRendererParams<TokenBoardRow>) => {
          const row = params.data;
          if (!row) {
            return null;
          }
          const setup = tradeSetups.get(row.mint) ?? null;
          const metrics = rowMetrics.get(row.mint) ?? EMPTY_ROW_METRICS;
          const trackedPosition = openPositionByMint.get(row.mint) ?? null;
          const manualTradeDisabledReason = getManualTradeDisabledReason(
            row,
            runtimeSnapshot,
            runDetail,
            trackedPosition,
          );
          return (
            <div className="min-w-[12rem] space-y-2 text-right">
              {trackedPosition ? (
                <>
                  <MetricLine
                    label="Open PnL"
                    value={formatSignedPercent(trackedPosition.returnPct)}
                    compact
                    emphasis={trackedPosition.returnPct >= 0}
                  />
                  <MetricLine
                    label="Unrealized"
                    value={formatSignedCurrency(
                      trackedPosition.unrealizedPnlUsd,
                    )}
                    compact
                  />
                  <MetricLine
                    label="Opened"
                    value={safeClientTimestamp(
                      trackedPosition.openedAt,
                      hydrated,
                    )}
                    compact
                  />
                </>
              ) : (
                <>
                  <MetricLine
                    label="Profile"
                    value={setup ? humanizeProfile(setup.profile) : "—"}
                    compact
                  />
                  <MetricLine
                    label="Capital"
                    value={
                      setup?.suggestedCapitalUsd !== null &&
                      setup?.suggestedCapitalUsd !== undefined
                        ? formatCurrency(setup.suggestedCapitalUsd)
                        : "—"
                    }
                    compact
                  />
                  <MetricLine
                    label="Edge"
                    value={formatSignedPp(metrics.edgePp)}
                    compact
                    emphasis={(metrics.edgePp ?? 0) >= 0}
                  />
                </>
              )}
              <div className="flex flex-wrap justify-end gap-1.5">
                <CompactActionButton
                  label="Details"
                  icon={<Eye className="h-3.5 w-3.5" />}
                  onClick={() => setSelectedMint(row.mint)}
                />
                <CompactActionButton
                  label="Ticket"
                  onClick={() => setTradeTicketMint(row.mint)}
                  disabled={
                    Boolean(manualTradeDisabledReason) ||
                    manualEntryPendingMint !== null
                  }
                  title={manualTradeDisabledReason ?? undefined}
                />
              </div>
            </div>
          );
        },
      },
    ],
    [
      hydrated,
      manualEntryPendingMint,
      openPositionByMint,
      rowMetrics,
      runDetail,
      runtimeSnapshot,
      tradeSetups,
    ],
  );

  const defaultColDef = useMemo<ColDef<TokenBoardRow>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressMovable: true,
    }),
    [],
  );

  function renderBoard(immersive: boolean) {
    return (
      <div className={clsx(immersive ? "h-full" : "space-y-6")}>
        <WorkflowSection
          title="Token board"
          eyebrow="Deduplicated results"
          description="One row per mint with conservative setup EV, market context, and direct review flow."
          action={
            immersive ? (
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">
                  <X className="h-4 w-4" />
                  Close full screen
                </Button>
              </Dialog.Close>
            ) : report ? (
              <Button
                type="button"
                onClick={() => setFullscreenOpen(true)}
                variant="ghost"
                size="sm"
              >
                <Maximize2 className="h-4 w-4" />
                Full screen
              </Button>
            ) : null
          }
        >
          {report ? (
            <div className="space-y-5">
              {hasAnyTokens ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <WorkflowStat
                    label="Visible tokens"
                    value={formatInteger(visibleRows.length)}
                    detail={`${humanizeFilterLabel(resultFilter)} in view`}
                    tone="accent"
                  />
                  <WorkflowStat
                    label="Pass-grade"
                    value={formatInteger(boardStats.passTokens)}
                    detail={`${formatInteger(boardStats.winnerTokens)} winner${boardStats.winnerTokens === 1 ? "" : "s"} surfaced`}
                  />
                  <WorkflowStat
                    label="Tracked open"
                    value={formatInteger(openPositionRows.length)}
                    detail={`${formatInteger(Math.max(runtimeSnapshot?.settings.capital.maxOpenPositions ?? 0, openPositionRows.length))} max slots`}
                  />
                  <WorkflowStat
                    label="Coverage"
                    value={formatInteger(boardStats.totalEvaluations)}
                    detail={`${formatInteger(boardStats.uniqueTokens)} unique mints after dedupe`}
                  />
                </div>
              ) : null}

              <MarketRegimeStrip
                regime={marketRegime}
                loading={marketRegimeLoading}
                error={marketRegimeError}
                hydrated={hydrated}
              />

              {manualEntrySuccess ? (
                <div className="rounded-[16px] border border-[rgba(163,230,53,0.24)] bg-[#11170f] px-4 py-3 text-sm text-text-primary">
                  Manual trade opened for {manualEntrySuccess.symbol}. Exit
                  monitoring was refreshed immediately.{" "}
                  <a
                    href={`/positions/${manualEntrySuccess.positionId}?book=open&focus=${manualEntrySuccess.positionId}`}
                    className="font-semibold text-[#d6ff78] underline underline-offset-4"
                  >
                    Open tracked position
                  </a>
                </div>
              ) : null}

              {showSecondarySynthesis ? (
                <details className="rounded-[16px] border border-bg-border bg-[#101012]">
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">
                          Secondary synthesis
                        </div>
                        <div className="mt-1 text-xs text-text-secondary">
                          Cohorts and adaptive band previews stay available
                          without competing with the token board.
                        </div>
                      </div>
                      <span className="meta-chip">
                        {formatInteger(boardStats.overlapTokens)} overlap tokens
                      </span>
                    </div>
                  </summary>
                  <div className="border-t border-bg-border p-4">
                    <div className="grid gap-4 2xl:grid-cols-2">
                      <CohortBoard cohorts={cohortSummaries} />
                      <AdaptiveStrategyPreview bands={decisionBands} />
                    </div>
                  </div>
                </details>
              ) : null}

              {manualEntryError ? (
                <div className="rounded-[16px] border border-[rgba(248,113,113,0.24)] bg-[#1a1011] px-4 py-3 text-sm text-[#f7c0c0]">
                  {manualEntryError}
                </div>
              ) : null}

              {hasAnyTokens ? (
                <div className="rounded-[16px] border border-bg-border bg-[#0d0f10] p-3">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {RESULT_FILTERS.map((filter) => (
                          <Button
                            type="button"
                            key={filter.id}
                            onClick={() => setResultFilter(filter.id)}
                            variant={
                              resultFilter === filter.id ? "secondary" : "ghost"
                            }
                            size="sm"
                            className="rounded-full"
                          >
                            {filter.label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                        {reportGeneratedAt ? (
                          <Badge variant="default">
                            Scored {safeClientTimestamp(reportGeneratedAt, hydrated)}
                          </Badge>
                        ) : null}
                        {runDurationLabel ? (
                          <Badge variant="default">Run {runDurationLabel}</Badge>
                        ) : null}
                        <Badge variant="default">
                          {formatInteger(boardStats.duplicateHitsRemoved)} duplicate hits removed
                        </Badge>
                        <span>
                          Search by symbol, mint, source, or strategy without losing board state.
                        </span>
                      </div>
                    </div>
                    <label className="relative block w-full">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                      <Input
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder="Search symbol, mint, strategy, source"
                        className="h-10 bg-[#101112] pl-9 pr-3"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="rounded-[16px] border border-bg-border bg-[#0d0f10] px-4 py-3 text-sm text-text-secondary">
                  No pass-grade tokens surfaced from this run. Use Studio to adjust the pack, then rerun instead of digging through an empty board.
                </div>
              )}

              {visibleRows.length > 0 ? (
                <>
                  <div className="space-y-3 md:hidden">
                    {mobilePageRows.map((row) => (
                      <TokenCard
                        key={row.mint}
                        row={row}
                        reportGeneratedAt={reportGeneratedAt}
                        runDurationLabel={runDurationLabel}
                        hydrated={hydrated}
                        metrics={rowMetrics.get(row.mint) ?? EMPTY_ROW_METRICS}
                        trackedPosition={
                          openPositionByMint.get(row.mint) ?? null
                        }
                        onStartManualTrade={() => setTradeTicketMint(row.mint)}
                        manualTradeDisabledReason={getManualTradeDisabledReason(
                          row,
                          runtimeSnapshot,
                          runDetail,
                          openPositionByMint.get(row.mint) ?? null,
                        )}
                        manualTradePending={manualEntryPendingMint === row.mint}
                        onViewDetails={() => setSelectedMint(row.mint)}
                      />
                    ))}
                  </div>

                  <div
                    className={clsx(
                      "ag-theme-quartz-dark ag-grid-desk hidden md:block overflow-hidden rounded-[18px] border border-bg-border/80 bg-[linear-gradient(180deg,rgba(13,14,14,0.96),rgba(8,9,9,0.98))]",
                      immersive
                        ? "h-[calc(100vh-22rem)]"
                        : "h-[min(62vh,40rem)]",
                    )}
                  >
                    <AgGridReact<TokenBoardRow>
                      theme="legacy"
                      rowData={visibleRows}
                      columnDefs={columnDefs}
                      defaultColDef={defaultColDef}
                      getRowId={(params: GetRowIdParams<TokenBoardRow>) =>
                        params.data.mint
                      }
                      animateRows={false}
                      rowHeight={60}
                      headerHeight={36}
                      suppressCellFocus
                      pagination
                      paginationPageSize={12}
                    />
                  </div>

                  <ResultPagination
                    className="md:hidden"
                    showingCount={mobilePageRows.length}
                    totalCount={mobileSortedRows.length}
                    pageIndex={mobilePageIndex}
                    pageCount={mobilePageCount}
                    canPrevious={mobilePageIndex > 0}
                    canNext={mobilePageIndex + 1 < mobilePageCount}
                    onPrevious={() =>
                      setMobilePageIndex((current) => Math.max(0, current - 1))
                    }
                    onNext={() =>
                      setMobilePageIndex((current) =>
                        Math.min(mobilePageCount - 1, current + 1),
                      )
                    }
                  />
                </>
              ) : (
                <EmptyState
                  title="No tokens match this filter"
                  detail="Change the search or filter to bring rows back into view."
                />
              )}

              {hasAnyRawHits ? (
                <details className="rounded-[16px] border border-bg-border bg-[#101012]">
                  <summary className="cursor-pointer list-none px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="section-kicker">Secondary evidence</div>
                        <div className="mt-1 text-sm font-semibold text-text-primary">
                          Raw strategy hits (
                          {formatInteger(report.deepEvaluations.length)})
                        </div>
                      </div>
                      <Badge variant="default">Collapsed by default</Badge>
                    </div>
                  </summary>
                  <div className="border-t border-bg-border/80 px-4 py-4">
                    <div className="space-y-3">
                      <div className="text-xs text-text-muted">
                        Showing the first 60 raw rows from the current report.
                      </div>
                      <div className="space-y-3 md:hidden">
                        {report.deepEvaluations.slice(0, 60).map((row) => (
                          <RawHitCard
                            key={`${row.planKey}-${row.mint}`}
                            row={row}
                          />
                        ))}
                      </div>
                      <div className="hidden md:block overflow-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-bg-hover/50">
                            <tr>
                              <th className="table-header whitespace-nowrap">
                                Strategy
                              </th>
                              <th className="table-header whitespace-nowrap">
                                Token
                              </th>
                              <th className="table-header whitespace-nowrap">
                                Source
                              </th>
                              <th className="table-header whitespace-nowrap">
                                Outcome
                              </th>
                              <th className="table-header whitespace-nowrap text-right">
                                Play
                              </th>
                              <th className="table-header whitespace-nowrap">
                                Reject reason
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.deepEvaluations.slice(0, 60).map((row) => (
                              <tr
                                key={`${row.planKey}-${row.mint}`}
                                className="table-row align-top"
                              >
                                <td className="table-cell text-text-secondary">
                                  {row.recipeName}
                                </td>
                                <td className="table-cell">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-text-primary">
                                      {row.symbol}
                                    </div>
                                    <TokenMarketLinks
                                      mint={row.mint}
                                      pairAddress={row.pairAddress}
                                      symbol={row.symbol}
                                    />
                                  </div>
                                  <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">
                                    {row.mint}
                                  </div>
                                </td>
                                <td className="table-cell text-text-secondary">
                                  {humanizeLabel(row.source)}
                                </td>
                                <td className="table-cell">
                                  <OutcomePill
                                    outcome={row.pass ? "pass" : "reject"}
                                  />
                                </td>
                                <td className="table-cell text-right tabular-nums text-text-secondary">
                                  {formatNumber(row.playScore)}
                                </td>
                                <td className="table-cell">
                                  <span className="line-clamp-2 text-text-muted">
                                    {row.rejectReason ?? "—"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No report loaded"
              detail="Run the lab or open a completed run to get the deduplicated token board."
            />
          )}
        </WorkflowSection>
      </div>
    );
  }

  return (
    <Dialog.Root open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
      {renderBoard(false)}

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <Dialog.Content className="fixed inset-3 z-50 overflow-hidden rounded-[24px] border border-bg-border bg-[var(--surface-modal)] p-4 shadow-2xl outline-none">
          <Dialog.Title className="sr-only">
            Discovery lab results full screen
          </Dialog.Title>
          <div className="h-full overflow-auto">{renderBoard(true)}</div>
        </Dialog.Content>
      </Dialog.Portal>

      {selectedRow ? (
        <TokenDetailsModal
          row={selectedRow}
          tradeSetup={selectedSetup}
          metrics={selectedMetrics ?? EMPTY_ROW_METRICS}
          insight={selectedInsightState.data}
          insightLoading={selectedInsightState.loading}
          insightError={selectedInsightState.error}
          trackedPosition={selectedTrackedPosition}
          onStartManualTrade={() => setTradeTicketMint(selectedRow.mint)}
          manualTradeDisabledReason={getManualTradeDisabledReason(
            selectedRow,
            runtimeSnapshot,
            runDetail,
            selectedTrackedPosition,
          )}
          manualTradePending={manualEntryPendingMint === selectedRow.mint}
          onClose={() => setSelectedMint(null)}
        />
      ) : null}

      {tradeTicketRow ? (
        <ManualTradeModal
          row={tradeTicketRow}
          tradeSetup={tradeTicketSetup}
          metrics={tradeTicketMetrics ?? EMPTY_ROW_METRICS}
          insight={tradeTicketInsightState.data}
          insightLoading={tradeTicketInsightState.loading}
          insightError={tradeTicketInsightState.error}
          trackedPosition={tradeTicketTrackedPosition}
          runtimeSnapshot={runtimeSnapshot}
          disabledReason={getManualTradeDisabledReason(
            tradeTicketRow,
            runtimeSnapshot,
            runDetail,
            tradeTicketTrackedPosition,
          )}
          pending={manualEntryPendingMint === tradeTicketRow.mint}
          onSubmit={(draft) => void submitManualTrade(tradeTicketRow, draft)}
          onClose={() => setTradeTicketMint(null)}
        />
      ) : null}
    </Dialog.Root>
  );
}

export function DiscoveryLabResearchSummary({
  runDetail,
}: {
  runDetail: DiscoveryLabRunDetail | null;
}) {
  const report = runDetail?.report ?? null;
  const tokenRows = useMemo(() => buildTokenRows(report), [report]);
  const topSources = useMemo(
    () =>
      [...(report?.sourceSummaries ?? [])]
        .sort(
          (left, right) =>
            right.uniqueGoodTokens - left.uniqueGoodTokens ||
            right.totalGoodTokens - left.totalGoodTokens,
        )
        .slice(0, 3),
    [report],
  );
  const topQueries = useMemo(
    () =>
      [...(report?.querySummaries ?? [])]
        .sort(
          (left, right) =>
            right.goodCount - left.goodCount ||
            right.avgGoodPlayScore - left.avgGoodPlayScore,
        )
        .slice(0, 4),
    [report],
  );
  const topRows = useMemo(
    () =>
      tokenRows
        .filter((row) => row.outcome !== "reject")
        .sort(
          (left, right) =>
            (right.winnerScore ?? right.bestPlayScore) -
            (left.winnerScore ?? left.bestPlayScore),
        )
        .slice(0, 4),
    [tokenRows],
  );

  return (
    <Panel
      title="Research summary"
      description="Secondary rollups for source, strategy, and token leaders."
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
          <span>
            {report
              ? `${formatInteger(topSources.length)} source leader(s), ${formatInteger(topQueries.length)} strategy leader(s)`
              : "No report loaded"}
          </span>
          <span className="text-xs text-text-secondary group-open:hidden">
            Open
          </span>
          <span className="hidden text-xs text-text-secondary group-open:inline">
            Close
          </span>
        </summary>
        {report ? (
          <div className="mt-4 space-y-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Source leaders
              </div>
              <div className="mt-3 space-y-2">
                {topSources.length > 0 ? (
                  topSources.map((source) => (
                    <div
                      key={source.source}
                      className="rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-primary">
                            {humanizeLabel(source.source)}
                          </div>
                          <div className="mt-1 text-xs text-text-secondary">
                            {formatInteger(source.uniqueGoodTokens)} unique
                            pass-grade · {formatInteger(source.totalReturned)}{" "}
                            returned
                          </div>
                        </div>
                        <div className="text-right text-xs text-text-muted">
                          <div>Best quality</div>
                          <div className="mt-1 text-text-primary">
                            {source.bestByQuality ??
                              source.bestByAverageScore ??
                              "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No source rollups"
                    detail="Source-level summaries land with a completed report."
                  />
                )}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Strategy leaders
              </div>
              <div className="mt-3 space-y-2">
                {topQueries.length > 0 ? (
                  topQueries.map((query) => (
                    <div
                      key={query.key}
                      className="rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-primary">
                            {query.recipeName}
                          </div>
                          <div className="mt-1 text-xs text-text-secondary">
                            {humanizeLabel(query.source)} ·{" "}
                            {formatInteger(query.goodCount)} winners /{" "}
                            {formatInteger(query.returnedCount)} returned ·{" "}
                            {formatInteger(query.rejectCount)} rejects
                          </div>
                        </div>
                        <div className="text-right text-xs text-text-secondary">
                          <div>Hit rate</div>
                          <div className="mt-1 text-sm font-semibold text-text-primary">
                            {formatPercent(query.winnerHitRatePercent)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No query rollups"
                    detail="Strategy-level leaders appear after the report is written."
                  />
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                <Trophy className="h-3.5 w-3.5" />
                Best tokens
              </div>
              <div className="mt-3 space-y-2">
                {topRows.length > 0 ? (
                  topRows.map((row) => (
                    <div
                      key={row.mint}
                      className="rounded-[14px] border border-bg-border bg-[#101012] px-3 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-text-primary">
                            {row.symbol}
                          </div>
                          <div className="mt-1 text-xs text-text-secondary">
                            {row.outcome === "winner" ? "Winner" : "Pass-grade"}{" "}
                            · {formatInteger(row.overlapCount)} strategy
                            {row.overlapCount === 1 ? "" : "ies"}
                          </div>
                        </div>
                        <OutcomePill outcome={row.outcome} />
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <MetricTile
                          label="Best play"
                          value={formatNumber(row.bestPlayScore)}
                        />
                        <MetricTile
                          label={
                            row.winnerScore !== null
                              ? "Winner score"
                              : "Best entry"
                          }
                          value={formatNumber(
                            row.winnerScore ?? row.bestEntryScore,
                          )}
                        />
                        {getOutcomeMarketCapLabel(row) &&
                        getOutcomeMarketCapUsd(row) !== null ? (
                          <MetricTile
                            label={
                              getOutcomeMarketCapLabel(row) ?? "Market cap"
                            }
                            value={formatCompactCurrency(
                              getOutcomeMarketCapUsd(row),
                            )}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="No pass-grade tokens"
                    detail="This run did not produce any pass-grade or winner rows."
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No report loaded"
              detail="Load a completed run to populate source, strategy, and token leaders."
            />
          </div>
        )}
      </details>
    </Panel>
  );
}

type CohortSummary = AdaptiveWinnerCohort;
type DecisionBand = AdaptiveDecisionBand;

function CohortBoard(props: { cohorts: CohortSummary[] }) {
  return (
    <WorkflowSection
      title="Winner cohort board"
      eyebrow="Adaptive cohorts"
      description="Secondary cohort rollups from current deduplicated token outcomes."
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
          <span>
            {props.cohorts.length > 0
              ? `${formatInteger(props.cohorts.length)} cohort group(s)`
              : "No winner cohorts yet"}
          </span>
          <span className="text-xs text-text-secondary group-open:hidden">
            Open
          </span>
          <span className="hidden text-xs text-text-secondary group-open:inline">
            Close
          </span>
        </summary>
        {props.cohorts.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No winner cohorts yet"
              detail="Run completion with pass-grade winners will populate cohort summaries here."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {props.cohorts.map((cohort) => (
              <Card key={cohort.id} className="rounded-[14px] bg-[#101012]">
                <CardContent className="px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-text-primary">
                      {cohort.label}
                    </div>
                    <WorkflowBadge variant="accent">
                      {formatInteger(cohort.winnerCount)} winners
                    </WorkflowBadge>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <MetricTile
                      label="Token coverage"
                      value={formatInteger(cohort.tokenCount)}
                    />
                    <MetricTile
                      label="Avg winner score"
                      value={
                        cohort.avgWinnerScore == null
                          ? "—"
                          : formatNumber(cohort.avgWinnerScore)
                      }
                    />
                    <MetricTile
                      label="Avg 5m volume"
                      value={
                        cohort.avgWinnerVolume5mUsd == null
                          ? "—"
                          : formatCompactCurrency(cohort.avgWinnerVolume5mUsd)
                      }
                    />
                    <MetricTile
                      label="Avg age at hit"
                      value={
                        cohort.avgWinnerAgeMin == null
                          ? "—"
                          : `${formatNumber(cohort.avgWinnerAgeMin)}m`
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </details>
    </WorkflowSection>
  );
}

function AdaptiveStrategyPreview(props: { bands: DecisionBand[] }) {
  return (
    <WorkflowSection
      title="Adaptive strategy preview"
      eyebrow="Decision bands"
      description="Secondary band preview derived from winner cohorts."
    >
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] border border-bg-border bg-bg-hover/35 px-4 py-3 text-sm font-medium text-text-primary">
          <span>
            {props.bands.length > 0
              ? `${formatInteger(props.bands.length)} decision band(s)`
              : "No decision bands"}
          </span>
          <span className="text-xs text-text-secondary group-open:hidden">
            Open
          </span>
          <span className="hidden text-xs text-text-secondary group-open:inline">
            Close
          </span>
        </summary>
        {props.bands.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No decision bands"
              detail="Bands appear when winner cohorts have enough evidence to derive adaptive postures."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {props.bands.map((band) => (
              <Card key={band.id} className="rounded-[14px] bg-[#101012]">
                <CardContent className="px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-text-primary">
                      {band.label}
                    </div>
                    <WorkflowBadge variant="default">
                      {band.confidence}
                    </WorkflowBadge>
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">
                    {band.eligibility}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <MetricTile label="Entry" value={band.entryPosture} />
                    <MetricTile label="Size" value={band.sizePosture} />
                    <MetricTile label="Exit" value={band.exitPosture} />
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    {band.support}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </details>
    </WorkflowSection>
  );
}

function buildCohortSummaries(rows: TokenBoardRow[]): CohortSummary[] {
  const groups = new Map<
    string,
    { label: string; rows: TokenBoardRow[]; winnerRows: TokenBoardRow[] }
  >();
  for (const row of rows) {
    if (row.outcome === "reject") {
      continue;
    }
    const key = deriveCohortKey(row);
    const label = deriveCohortLabel(row);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        label,
        rows: [row],
        winnerRows: row.outcome === "winner" ? [row] : [],
      });
      continue;
    }
    existing.rows.push(row);
    if (row.outcome === "winner") {
      existing.winnerRows.push(row);
    }
  }

  return [...groups.entries()]
    .map(([id, value]) => ({
      id,
      key: id,
      label: value.label,
      tokenCount: value.rows.length,
      winnerCount: value.winnerRows.length,
      avgWinnerScore: average(
        value.winnerRows.map((row) => row.winnerScore ?? row.bestEntryScore),
      ),
      avgWinnerVolume5mUsd: average(
        value.winnerRows.map((row) => row.winnerVolume5mUsd),
      ),
      avgWinnerAgeMin: average(
        value.winnerRows.map((row) => row.winnerTimeSinceGraduationMin),
      ),
    }))
    .sort(
      (left, right) =>
        right.winnerCount - left.winnerCount ||
        right.tokenCount - left.tokenCount,
    )
    .slice(0, 6);
}

function buildDecisionBands(cohorts: CohortSummary[]): DecisionBand[] {
  return cohorts.map((cohort, index) => {
    const aggressive =
      (cohort.avgWinnerScore ?? 0) >= 0.82 &&
      (cohort.avgWinnerVolume5mUsd ?? 0) >= 200_000;
    const defensive =
      (cohort.avgWinnerScore ?? 0) < 0.68 ||
      (cohort.avgWinnerVolume5mUsd ?? 0) < 60_000;
    return {
      id: `band-${index + 1}`,
      cohortKey: cohort.key,
      label: `${cohort.label} band`,
      eligibility: `Match token profile near cohort ${cohort.label.toLowerCase()} with volume and freshness inside this cohort envelope.`,
      entryPosture: aggressive
        ? "Faster confirmation"
        : defensive
          ? "Strict confirmation"
          : "Balanced confirmation",
      sizePosture: aggressive
        ? "Expand toward cap"
        : defensive
          ? "Reduce toward floor"
          : "Base sizing with mild modifier",
      exitPosture: aggressive
        ? "Runner bias"
        : defensive
          ? "Scalp bias"
          : "Balanced exits",
      confidence: deriveConfidenceLabel(cohort.winnerCount),
      support: `${formatInteger(cohort.winnerCount)} winner${cohort.winnerCount === 1 ? "" : "s"} across ${formatInteger(cohort.tokenCount)} pass-grade tokens.`,
    };
  });
}

function deriveCohortKey(row: TokenBoardRow) {
  const volume = row.winnerVolume5mUsd ?? 0;
  const age = row.winnerTimeSinceGraduationMin ?? Number.POSITIVE_INFINITY;
  if (age <= 10 && volume >= 200_000) return "fresh-high-volume";
  if (age <= 20 && volume >= 80_000) return "fresh-mid-volume";
  if (age > 20 && volume >= 120_000) return "late-high-liquidity";
  return "defensive-fade-risk";
}

function deriveCohortLabel(row: TokenBoardRow) {
  const key = deriveCohortKey(row);
  switch (key) {
    case "fresh-high-volume":
      return "Very fresh + high volume";
    case "fresh-mid-volume":
      return "Fresh + mid volume";
    case "late-high-liquidity":
      return "Later + high liquidity";
    default:
      return "Defensive fade risk";
  }
}

function deriveConfidenceLabel(winnerCount: number) {
  if (winnerCount >= 8) return "High confidence";
  if (winnerCount >= 4) return "Medium confidence";
  return "Early signal";
}

function average(values: Array<number | null | undefined>) {
  const filtered = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  if (filtered.length === 0) {
    return null;
  }
  return filtered.reduce((total, value) => total + value, 0) / filtered.length;
}

function ResultPagination(props: {
  className?: string;
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
    <div
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 border-t border-bg-border/80 px-1 pt-3",
        props.className,
      )}
    >
      <div className="text-xs text-text-muted">
        Showing {formatInteger(props.showingCount)} of{" "}
        {formatInteger(props.totalCount)} unique tokens
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={props.onPrevious}
          disabled={!props.canPrevious}
          variant="ghost"
          size="sm"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </Button>
        <div className="text-xs text-text-secondary">
          Page {formatInteger(props.pageIndex + 1)} of{" "}
          {formatInteger(props.pageCount || 1)}
        </div>
        <Button
          onClick={props.onNext}
          disabled={!props.canNext}
          variant="ghost"
          size="sm"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MarketRegimeStrip(props: {
  regime: MarketRegimeSnapshot | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;
}) {
  const toneClass =
    props.regime?.tone === "risk_on"
      ? "border-[rgba(163,230,53,0.35)] bg-[rgba(163,230,53,0.1)] text-[var(--success)]"
      : props.regime?.tone === "risk_off"
        ? "border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]"
        : "border-bg-border bg-[#0d0d0f] text-text-secondary";
  const statusLabel =
    props.regime?.label ??
    (props.loading
      ? "Loading regime…"
      : props.error
        ? "Regime unavailable"
        : "No regime snapshot");

  return (
    <Card className="rounded-[14px] bg-[#0d0d0f]">
      <CardContent className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Market regime
        </div>
        <span
          className={clsx(
            "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
            toneClass,
          )}
        >
          {statusLabel}
        </span>
        {props.regime?.confidencePercent !== null &&
        props.regime?.confidencePercent !== undefined ? (
          <Badge variant="default" className="font-medium">
            Conf {formatPercent(props.regime.confidencePercent, 0)}
          </Badge>
        ) : null}
        {props.regime?.chips.map((chip) => (
          <Badge
            key={`${chip.label}-${chip.value}`}
            variant="default"
            className="font-medium"
          >
            {chip.label} {chip.value}
          </Badge>
        ))}
        {props.regime?.updatedAt ? (
          <span className="ml-auto text-[10px] text-text-muted">
            Updated{" "}
            {safeClientTimestamp(props.regime.updatedAt, props.hydrated)}
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TokenCard(props: {
  row: TokenBoardRow;
  reportGeneratedAt: string | null;
  runDurationLabel: string | null;
  hydrated: boolean;
  metrics: TokenRowMetrics;
  trackedPosition: PositionBookRow | null;
  onStartManualTrade: () => void;
  manualTradeDisabledReason: string | null;
  manualTradePending: boolean;
  onViewDetails: () => void;
}) {
  const signal = props.row.signal;
  const setupProfile =
    props.row.outcome === "winner"
      ? "Winner"
      : props.row.outcome === "pass"
        ? "Pass-grade"
        : "Reject";

  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-text-primary">
              {props.row.symbol}
            </div>
            <TokenMarketLinks
              mint={props.row.mint}
              pairAddress={props.row.pairAddress}
              symbol={props.row.symbol}
              creator={null}
            />
            {props.trackedPosition ? (
              <Badge variant="default">Open position</Badge>
            ) : null}
          </div>
          <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">
            {props.row.mint}
          </div>
          {props.reportGeneratedAt ? (
            <div className="mt-2 text-[11px] text-text-muted">
              Scored{" "}
              {safeClientTimestamp(props.reportGeneratedAt, props.hydrated)}
              {props.runDurationLabel ? ` · Run ${props.runDurationLabel}` : ""}
            </div>
          ) : null}
        </div>
        <OutcomePill outcome={props.row.outcome} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {props.row.sources.map((source) => (
          <span
            key={source}
            className="rounded-full border border-bg-border bg-[#0d0d0f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
          >
            {humanizeLabel(source)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricTile label="Setup" value={setupProfile} />
        <MetricTile
          label="Consensus"
          value={`${formatInteger(props.row.overlapCount)} strategies`}
        />
        <MetricTile
          label="5m volume"
          value={formatCompactCurrency(
            signal?.volume5mUsd ?? props.row.winnerVolume5mUsd,
          )}
        />
        <MetricTile
          label="Liquidity"
          value={formatCompactCurrency(signal?.liquidityUsd)}
        />
        <MetricTile
          label="5m buyers"
          value={formatInteger(signal?.uniqueWallets5m)}
        />
        <MetricTile
          label="Buy / sell"
          value={
            signal?.buySellRatio !== null && signal?.buySellRatio !== undefined
              ? formatNumber(signal.buySellRatio)
              : "—"
          }
        />
        <MetricTile
          label="Since grad"
          value={formatRelativeMinutes(
            signal?.timeSinceGraduationMin ??
              props.row.winnerTimeSinceGraduationMin,
          )}
        />
        <MetricTile
          label="5m move"
          value={formatPercent(signal?.priceChange5mPercent)}
        />
        <MetricTile
          label="EV/R"
          value={formatSignedRatio(props.metrics.evToRisk)}
        />
        <MetricTile label="Edge" value={formatSignedPp(props.metrics.edgePp)} />
        <MetricTile
          label="Top10"
          value={formatPercent(
            signal?.top10HolderPercent ?? props.row.winnerTop10HolderPercent,
          )}
        />
        <MetricTile
          label="Flow score"
          value={formatMetricScore(props.metrics.netFlowScore)}
        />
      </div>

      <div className="mt-4 rounded-[14px] border border-bg-border bg-[#0d0d0f] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Desk summary
        </div>
        {props.trackedPosition ? (
          <div className="mt-2 space-y-1 text-sm text-text-secondary">
            <div>
              Open return {formatSignedPercent(props.trackedPosition.returnPct)}
            </div>
            <div>
              Unrealized{" "}
              {formatSignedCurrency(props.trackedPosition.unrealizedPnlUsd)}
            </div>
            <a
              href={`/positions/${props.trackedPosition.id}?book=open&focus=${props.trackedPosition.id}`}
              className="inline-flex items-center gap-1 text-[#d6ff78] hover:text-white"
            >
              Track position
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <div className="mt-2 text-sm text-text-secondary">
            {props.row.topRejectReason ?? "No dominant reject pressure."}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sliceLabels(props.row.recipes, 4).map((recipe) => (
            <span
              key={recipe}
              className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary"
            >
              {recipe}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!props.trackedPosition ? (
            <CompactActionButton
              label="Trade ticket"
              onClick={props.onStartManualTrade}
              disabled={
                Boolean(props.manualTradeDisabledReason) ||
                props.manualTradePending
              }
              title={props.manualTradeDisabledReason ?? undefined}
            />
          ) : null}
          <CompactActionButton
            label="View details"
            icon={<Eye className="h-3.5 w-3.5" />}
            onClick={props.onViewDetails}
          />
        </div>
      </div>
    </div>
  );
}

function TokenDetailsModal(props: {
  row: TokenBoardRow;
  tradeSetup: TokenTradeSetup | null;
  metrics: TokenRowMetrics;
  insight: DiscoveryLabTokenInsight | null;
  insightLoading: boolean;
  insightError: string | null;
  trackedPosition: PositionBookRow | null;
  onStartManualTrade: () => void;
  manualTradeDisabledReason: string | null;
  manualTradePending: boolean;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  const signal = props.row.signal;
  const liveMarket = props.insight?.market ?? null;
  const security = props.insight?.security ?? null;
  const primaryRecipes = sliceLabels(props.row.recipes, 8);
  const passedRecipes = sliceLabels(props.row.passedRecipes, 6);
  const failedRecipes = sliceLabels(props.row.failedRecipes, 4);
  const setupSummary = props.tradeSetup
    ? `Calibrated ${humanizeProfile(props.tradeSetup.profile)} plan with ${formatRelativeMinutes(props.tradeSetup.maxHoldMinutes)} max hold.`
    : "No calibrated setup is available for this row yet.";
  const qualitySummary =
    props.row.outcome === "winner"
      ? "Winner-grade outcome with the strongest combined play and consensus path in this run."
      : props.row.outcome === "pass"
        ? "Pass-grade outcome with actionable setup quality but less dominance than a winner row."
        : "Rejected outcome. Treat this as evidence and watchout context, not as an entry candidate.";
  const creator = props.insight?.creator ?? null;
  const socialLinks = props.insight?.socials ?? null;
  const toolLinks = props.insight?.toolLinks ?? {
    axiom: buildAxiomHref(props.row.pairAddress ?? props.row.mint),
    dexscreener: buildDexScreenerHref(props.row.mint),
    rugcheck: buildRugcheckHref(props.row.mint),
    solscanToken: buildSolscanTokenHref(props.row.mint),
    solscanCreator: buildSolscanAccountHref(creator),
  };
  const socialEntries = [
    { label: "Website", href: socialLinks?.website ?? null },
    { label: "X", href: socialLinks?.twitter ?? null },
    { label: "Telegram", href: socialLinks?.telegram ?? null },
    { label: "Discord", href: socialLinks?.discord ?? null },
  ].filter((entry): entry is { label: string; href: string } =>
    Boolean(entry.href),
  );
  const toolEntries = [
    { label: "Axiom", href: toolLinks.axiom },
    { label: "DexScreener", href: toolLinks.dexscreener },
    { label: "Rugcheck", href: toolLinks.rugcheck },
    { label: "Solscan token", href: toolLinks.solscanToken },
    ...(toolLinks.solscanCreator
      ? [{ label: "Creator wallet", href: toolLinks.solscanCreator }]
      : []),
  ];
  const priceUsd =
    liveMarket?.priceUsd ??
    props.tradeSetup?.entryPriceUsd ??
    signal?.priceUsd ??
    null;
  const marketCapUsd =
    liveMarket?.marketCapUsd ??
    signal?.marketCapUsd ??
    props.row.winnerMarketCapUsd;
  const liquidityUsd = liveMarket?.liquidityUsd ?? signal?.liquidityUsd;
  const holders = liveMarket?.holders ?? signal?.holders;
  const top10HolderPercent =
    security?.top10HolderPercent ??
    signal?.top10HolderPercent ??
    props.row.winnerTop10HolderPercent;
  const largestHolderPercent = signal?.largestHolderPercent ?? null;
  const buySellRatio =
    signal?.buySellRatio !== null && signal?.buySellRatio !== undefined
      ? signal.buySellRatio
      : liveMarket?.buy5m !== null &&
          liveMarket?.buy5m !== undefined &&
          liveMarket?.sell5m !== null &&
          liveMarket?.sell5m !== undefined &&
          liveMarket.sell5m > 0
        ? liveMarket.buy5m / liveMarket.sell5m
        : null;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/85" />
        <Dialog.Content className="fixed inset-2 z-[81] overflow-hidden rounded-[24px] border border-bg-border bg-[var(--surface-modal)] shadow-2xl outline-none">
          <Dialog.Title className="sr-only">
            {props.row.symbol} token details
          </Dialog.Title>
          <div className="flex h-full flex-col">
            <div className="border-b border-bg-border bg-[var(--surface-modal-strong)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {props.insight?.logoUri ? (
                      <img
                        src={props.insight.logoUri}
                        alt=""
                        className="h-10 w-10 rounded-full border border-bg-border object-cover"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-text-primary">
                          {props.insight?.symbol ?? props.row.symbol}
                        </div>
                        {props.insight?.name &&
                        props.insight.name !== props.row.symbol ? (
                          <Badge variant="default">{props.insight.name}</Badge>
                        ) : null}
                        {props.trackedPosition ? (
                          <Badge variant="default">Open position tracked</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-text-secondary">
                        {props.insight?.source
                          ? humanizeLabel(props.insight.source)
                          : "Run insight"}
                        {props.insight?.platformId
                          ? ` · ${props.insight.platformId}`
                          : ""}
                        {liveMarket?.lastTradeAt
                          ? ` · last trade ${safeClientTimestamp(liveMarket.lastTradeAt, hydrated)}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <OutcomePill outcome={props.row.outcome} />
                    <Badge variant="default">
                      {formatInteger(props.row.overlapCount)} strategies
                    </Badge>
                    <Badge variant="default">
                      Best play {formatNumber(props.row.bestPlayScore)}
                    </Badge>
                    <Badge variant="default">
                      Setup{" "}
                      {props.tradeSetup
                        ? humanizeProfile(props.tradeSetup.profile)
                        : "Pending"}
                    </Badge>
                    {props.insightLoading ? (
                      <Badge variant="default">Live insight loading</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">
                    {props.row.mint}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <TokenMarketLinks
                      mint={props.row.mint}
                      pairAddress={props.row.pairAddress}
                      symbol={props.row.symbol}
                      creator={creator}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={props.onClose}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                  Close
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.42fr)]">
                <div className="space-y-5">
                  <section className="space-y-4 rounded-[16px] border border-[rgba(163,230,53,0.18)] bg-[#0f130f] p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <ScanStat
                        label="Suggested capital"
                        value={
                          props.tradeSetup?.suggestedCapitalUsd !== null &&
                          props.tradeSetup?.suggestedCapitalUsd !== undefined
                            ? formatCurrency(
                                props.tradeSetup.suggestedCapitalUsd,
                              )
                            : "—"
                        }
                        detail={
                          props.tradeSetup
                            ? `${humanizeProfile(props.tradeSetup.profile)} setup`
                            : "Setup pending"
                        }
                        tone="accent"
                      />
                      <ScanStat
                        label="Entry reference"
                        value={formatTokenPrice(
                          props.tradeSetup?.entryPriceUsd ??
                            signal?.priceUsd ??
                            null,
                        )}
                        detail={
                          props.tradeSetup
                            ? `Stop ${formatPercent(props.tradeSetup.stopLossPercent, 0)}`
                            : "Price snapshot only"
                        }
                      />
                      <ScanStat
                        label="2x confidence"
                        value={
                          props.tradeSetup
                            ? formatPercent(
                                props.tradeSetup.doubleUpConfidencePercent,
                                0,
                              )
                            : "—"
                        }
                        detail={
                          props.tradeSetup
                            ? `${formatRelativeMinutes(props.tradeSetup.maxHoldMinutes)} max hold`
                            : "No calibrated hold profile"
                        }
                      />
                      <ScanStat
                        label="Edge"
                        value={formatSignedPp(props.metrics.edgePp)}
                        detail={formatSignedCurrency(
                          props.metrics.riskUsd,
                          false,
                        )}
                      />
                    </div>
                    <Card className="rounded-[14px] border-[rgba(163,230,53,0.14)] bg-[#0d100d] shadow-none">
                      <CardContent className="px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                          Read first
                        </div>
                        <div className="mt-2 text-sm leading-6 text-text-primary">
                          {qualitySummary}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-text-secondary">
                          {setupSummary}
                        </div>
                      </CardContent>
                    </Card>
                    {props.insightError ? (
                      <div className="rounded-[14px] border border-[rgba(248,113,113,0.24)] bg-[#1a1011] px-4 py-3 text-sm text-[#f7c0c0]">
                        Live token insight unavailable: {props.insightError}
                      </div>
                    ) : null}
                  </section>

                  <section className="space-y-3 rounded-[16px] border border-bg-border bg-[#101112] p-4">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                        Desk plan
                      </div>
                      <div className="mt-1 text-xs leading-5 text-text-secondary">
                        One section for execution shape: entry ladder, exit
                        path, and conservative desk math.
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <MetricTile
                        label="Entry ref"
                        value={formatTokenPrice(priceUsd)}
                      />
                      <MetricTile
                        label="Stop loss"
                        value={formatTargetValue(
                          props.tradeSetup?.stopLossPriceUsd ?? null,
                          props.tradeSetup
                            ? -props.tradeSetup.stopLossPercent
                            : null,
                        )}
                      />
                      <MetricTile
                        label="Take profit 1"
                        value={formatTargetValue(
                          props.tradeSetup?.tp1PriceUsd ?? null,
                          props.tradeSetup?.tp1Percent ?? null,
                        )}
                      />
                      <MetricTile
                        label="TP1 sell size"
                        value={
                          props.tradeSetup
                            ? formatPercent(
                                props.tradeSetup.tp1SellFractionPercent,
                                0,
                              )
                            : "—"
                        }
                      />
                      <MetricTile
                        label="Take profit 2"
                        value={formatTargetValue(
                          props.tradeSetup?.tp2PriceUsd ?? null,
                          props.tradeSetup?.tp2Percent ?? null,
                        )}
                      />
                      <MetricTile
                        label="TP2 sell size"
                        value={
                          props.tradeSetup
                            ? formatPercent(
                                props.tradeSetup.tp2SellFractionPercent,
                                0,
                              )
                            : "—"
                        }
                      />
                      <MetricTile
                        label="Trail after TP2"
                        value={
                          props.tradeSetup
                            ? formatPercent(
                                props.tradeSetup.trailingStopPercent,
                                0,
                              )
                            : "—"
                        }
                      />
                      <MetricTile
                        label="Time stop"
                        value={
                          props.tradeSetup
                            ? `${formatRelativeMinutes(props.tradeSetup.timeStopMinutes)} if under ${formatPercent(props.tradeSetup.timeStopMinReturnPercent, 0)}`
                            : "—"
                        }
                      />
                      <MetricTile
                        label="Capital"
                        value={
                          props.tradeSetup?.suggestedCapitalUsd
                            ? formatCurrency(
                                props.tradeSetup.suggestedCapitalUsd,
                              )
                            : "—"
                        }
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                      <MetricTile
                        label="EV%"
                        value={formatSignedPercent(props.metrics.evPercent)}
                      />
                      <MetricTile
                        label="EV$"
                        value={formatSignedCurrency(props.metrics.evUsd)}
                      />
                      <MetricTile
                        label="Risk$"
                        value={formatSignedCurrency(
                          props.metrics.riskUsd,
                          false,
                        )}
                      />
                      <MetricTile
                        label="EV/R"
                        value={formatSignedRatio(props.metrics.evToRisk)}
                      />
                      <MetricTile
                        label="Edge (pp)"
                        value={formatSignedPp(props.metrics.edgePp)}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        label="Runway"
                        value={formatRunway(props.metrics.liquidityRunway)}
                      />
                      <MetricTile
                        label="Net flow"
                        value={formatMetricScore(props.metrics.netFlowScore)}
                      />
                      <MetricTile
                        label="Consensus Q"
                        value={formatMetricScore(
                          props.metrics.consensusQuality,
                        )}
                      />
                      <MetricTile
                        label="Freshness decay"
                        value={formatMetricScore(props.metrics.freshnessDecay)}
                      />
                    </div>
                  </section>

                  <section className="space-y-3 rounded-[16px] border border-bg-border bg-[#101112] p-4">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                        Market and timing
                      </div>
                      <div className="mt-1 text-xs leading-5 text-text-secondary">
                        One scan block for structure, liquidity, holder concentration, and pace. No reason to spread this across two fake-important panels.
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        label="Price"
                        value={formatTokenPrice(priceUsd)}
                      />
                      <MetricTile
                        label="Liquidity"
                        value={formatCompactCurrency(liquidityUsd)}
                      />
                      <MetricTile
                        label="Market cap"
                        value={formatCompactCurrency(marketCapUsd)}
                      />
                      <MetricTile
                        label="FDV"
                        value={formatCompactCurrency(liveMarket?.fdvUsd)}
                      />
                      <MetricTile
                        label="Holders"
                        value={formatInteger(holders)}
                      />
                      <MetricTile
                        label="Top10 concentration"
                        value={formatPercent(top10HolderPercent)}
                      />
                      <MetricTile
                        label="Largest holder"
                        value={formatPercent(largestHolderPercent)}
                      />
                      <MetricTile
                        label="Buy / sell"
                        value={
                          buySellRatio !== null
                            ? formatNumber(buySellRatio)
                            : "—"
                        }
                      />
                      <MetricTile
                        label="5m volume"
                        value={formatCompactCurrency(
                          liveMarket?.volume5mUsd ??
                            signal?.volume5mUsd ??
                            props.row.winnerVolume5mUsd,
                        )}
                      />
                      <MetricTile
                        label="1h volume"
                        value={formatCompactCurrency(liveMarket?.volume1hUsd)}
                      />
                      <MetricTile
                        label="24h volume"
                        value={formatCompactCurrency(liveMarket?.volume24hUsd)}
                      />
                      <MetricTile
                        label="30m volume"
                        value={formatCompactCurrency(signal?.volume30mUsd)}
                      />
                      <MetricTile
                        label="5m buyers"
                        value={formatInteger(
                          liveMarket?.uniqueWallet5m ?? signal?.uniqueWallets5m,
                        )}
                      />
                      <MetricTile
                        label="1h wallets"
                        value={formatInteger(liveMarket?.uniqueWallet1h)}
                      />
                      <MetricTile
                        label="24h wallets"
                        value={formatInteger(liveMarket?.uniqueWallet24h)}
                      />
                      <MetricTile
                        label="5m momentum"
                        value={formatPercent(
                          liveMarket?.priceChange5mPercent ??
                            signal?.priceChange5mPercent,
                        )}
                      />
                      <MetricTile
                        label="30m momentum"
                        value={formatPercent(
                          liveMarket?.priceChange30mPercent ??
                            signal?.priceChange30mPercent,
                        )}
                      />
                      <MetricTile
                        label="1h momentum"
                        value={formatPercent(liveMarket?.priceChange1hPercent)}
                      />
                      <MetricTile
                        label="24h momentum"
                        value={formatPercent(liveMarket?.priceChange24hPercent)}
                      />
                      <MetricTile
                        label="5m trades"
                        value={formatInteger(liveMarket?.trade5m)}
                      />
                      <MetricTile
                        label="5m buy / sell"
                        value={formatBuySellCounts(
                          liveMarket?.buy5m,
                          liveMarket?.sell5m,
                        )}
                      />
                      <MetricTile
                        label="Since graduation"
                        value={formatRelativeMinutes(
                          signal?.timeSinceGraduationMin ??
                            props.row.winnerTimeSinceGraduationMin,
                        )}
                      />
                      <MetricTile
                        label="Since creation"
                        value={formatRelativeMinutes(
                          signal?.timeSinceCreationMin,
                        )}
                      />
                      <MetricTile
                        label="Exit profile"
                        value={
                          props.tradeSetup
                            ? humanizeProfile(props.tradeSetup.profile)
                            : "—"
                        }
                      />
                    </div>
                  </section>

                  <section className="space-y-3 rounded-[16px] border border-bg-border bg-[#101112] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                      Consensus and path
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-[12px] border border-bg-border bg-[#0d0f10] px-3 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Consensus
                        </div>
                        <div className="mt-2 text-sm font-semibold text-text-primary">
                          {formatInteger(props.row.overlapCount)} strategy hits
                          across {formatInteger(props.row.sources.length)}{" "}
                          source{props.row.sources.length === 1 ? "" : "s"}.
                        </div>
                        <div className="mt-2 text-xs leading-5 text-text-secondary">
                          Pass rate{" "}
                          {props.row.evaluationCount > 0
                            ? formatPercent(
                                (props.row.passedRecipes.length /
                                  props.row.evaluationCount) *
                                  100,
                                0,
                              )
                            : "—"}{" "}
                          across recorded evaluations.
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-bg-border bg-[#0d0f10] px-3 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Winning path
                        </div>
                        <div className="mt-2 text-sm font-semibold text-text-primary">
                          {props.row.winnerScore !== null
                            ? `Winner score ${formatNumber(props.row.winnerScore)}`
                            : `Best entry ${formatNumber(props.row.bestEntryScore)}`}
                        </div>
                        <div className="mt-2 text-xs leading-5 text-text-secondary">
                          Best play {formatNumber(props.row.bestPlayScore)} from{" "}
                          {props.row.modes.map(humanizeLabel).join(", ") ||
                            "no mode"}{" "}
                          signals.
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      <TagBucket
                        title="Top recipes"
                        labels={primaryRecipes}
                        total={props.row.recipes.length}
                      />
                      <TagBucket
                        title="Pass path"
                        labels={passedRecipes}
                        total={props.row.passedRecipes.length}
                        tone="success"
                      />
                      <TagBucket
                        title="Failed path"
                        labels={failedRecipes}
                        total={props.row.failedRecipes.length}
                        tone="danger"
                        emptyLabel="No failed recipes."
                      />
                    </div>
                  </section>

                  <details className="rounded-[16px] border border-bg-border bg-[#101112]">
                    <summary className="cursor-pointer list-none px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                            Secondary evidence
                          </div>
                          <div className="mt-1 text-sm font-semibold text-text-primary">
                            Security posture and watchouts
                          </div>
                        </div>
                        <Badge variant="default">Collapsed by default</Badge>
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-bg-border px-4 py-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MetricTile
                          label="Creator balance"
                          value={formatPercent(security?.creatorBalancePercent)}
                        />
                        <MetricTile
                          label="Owner balance"
                          value={formatPercent(security?.ownerBalancePercent)}
                        />
                        <MetricTile
                          label="Update auth bal"
                          value={formatPercent(
                            security?.updateAuthorityBalancePercent,
                          )}
                        />
                        <MetricTile
                          label="Top10 user %"
                          value={formatPercent(security?.top10UserPercent)}
                        />
                        <MetricTile
                          label="Transfer fee"
                          value={formatTransferFee(
                            security?.transferFeeEnabled ?? null,
                            security?.transferFeePercent ?? null,
                          )}
                        />
                        <MetricTile
                          label="True token"
                          value={formatBooleanState(
                            security?.trueToken,
                            "Verified",
                            "Unknown",
                          )}
                        />
                        <MetricTile
                          label="Token 2022"
                          value={formatBooleanState(
                            security?.token2022,
                            "Yes",
                            "No",
                          )}
                        />
                        <MetricTile
                          label="Non-transferable"
                          value={formatBooleanState(
                            security?.nonTransferable,
                            "Yes",
                            "No",
                          )}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <StatusFlagCard
                          label="Freezeable"
                          value={security?.freezeable ?? null}
                          dangerWhenTrue
                        />
                        <StatusFlagCard
                          label="Mint authority enabled"
                          value={security?.mintAuthorityEnabled ?? null}
                          dangerWhenTrue
                        />
                        <StatusFlagCard
                          label="Mutable metadata"
                          value={security?.mutableMetadata ?? null}
                          dangerWhenTrue
                        />
                        <StatusFlagCard
                          label="Honeypot risk"
                          value={security?.honeypot ?? null}
                          dangerWhenTrue
                        />
                        <StatusFlagCard
                          label="Fake token risk"
                          value={security?.fakeToken ?? null}
                          dangerWhenTrue
                        />
                        <StatusFlagCard
                          label="Creator account"
                          value={Boolean(toolLinks.solscanCreator)}
                          trueLabel="Present"
                          falseLabel="Unavailable"
                        />
                      </div>
                      <div className="grid gap-3 lg:grid-cols-3">
                        <WatchoutCard
                          title="Primary reject pressure"
                          body={
                            props.row.topRejectReason ??
                            "No shared reject pressure captured on the best path."
                          }
                        />
                        <WatchoutCard
                          title="Soft issues"
                          body={
                            props.row.softIssues.length > 0
                              ? props.row.softIssues.join(", ")
                              : "None recorded."
                          }
                        />
                        <WatchoutCard
                          title="Notes"
                          body={
                            props.row.notes.length > 0
                              ? props.row.notes.join(" · ")
                              : "No extra notes."
                          }
                        />
                      </div>
                    </div>
                  </details>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-[4.5rem] xl:self-start">
                  <section className="rounded-[16px] border border-[rgba(163,230,53,0.2)] bg-[#10150f] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      Summary rail
                    </div>
                    <div className="mt-4 space-y-2 rounded-[14px] border border-bg-border bg-[#0d0f10] p-3">
                      <MetricLine
                        label="Outcome"
                        value={humanizeLabel(props.row.outcome)}
                        compact
                        emphasis
                      />
                      <MetricLine
                        label="Profile"
                        value={
                          props.tradeSetup
                            ? humanizeProfile(props.tradeSetup.profile)
                            : "Pending"
                        }
                        compact
                      />
                      <MetricLine
                        label="Capital"
                        value={
                          props.tradeSetup?.suggestedCapitalUsd
                            ? formatCurrency(props.tradeSetup.suggestedCapitalUsd)
                            : "—"
                        }
                        compact
                      />
                      <MetricLine
                        label="Conc risk"
                        value={formatMetricScore(props.metrics.concentrationRisk)}
                        compact
                      />
                      {props.trackedPosition ? (
                        <>
                          <MetricLine
                            label="Open return"
                            value={formatSignedPercent(props.trackedPosition.returnPct)}
                            compact
                            emphasis={props.trackedPosition.returnPct >= 0}
                          />
                          <MetricLine
                            label="Unrealized"
                            value={formatSignedCurrency(props.trackedPosition.unrealizedPnlUsd)}
                            compact
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {socialEntries.length > 0 ? (
                        socialEntries.map((entry) => (
                          <ExternalChipLink
                            key={entry.label}
                            href={entry.href}
                            label={entry.label}
                          />
                        ))
                      ) : null}
                      {toolEntries.map((entry) => (
                        <ExternalChipLink
                          key={entry.label}
                          href={entry.href}
                          label={entry.label}
                        />
                      ))}
                    </div>
                    <div className="mt-3 text-xs leading-5 text-text-secondary">
                      {props.insight?.description ??
                        "No provider description was returned for this mint."}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-muted">
                      <span>Creator {truncateMiddle(creator)}</span>
                      <span>•</span>
                      <span>
                        {props.insight?.source
                          ? humanizeLabel(props.insight.source)
                          : "Run insight"}
                      </span>
                      {props.insight?.platformId ? (
                        <>
                          <span>•</span>
                          <span>{props.insight.platformId}</span>
                        </>
                      ) : null}
                    </div>
                    {props.trackedPosition ? (
                      <a
                        href={`/positions/${props.trackedPosition.id}?book=open&focus=${props.trackedPosition.id}`}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#d6ff78] hover:text-white"
                      >
                        Track open position
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                    <div className="mt-4 text-xs leading-5 text-text-secondary">
                      Use the trade ticket only after structure, flow, and
                      security all hold up. This view is for review first.
                    </div>
                    <Button
                      type="button"
                      onClick={props.onStartManualTrade}
                      disabled={Boolean(props.manualTradeDisabledReason) || props.manualTradePending}
                      title={props.manualTradeDisabledReason ?? undefined}
                      variant="ghost"
                      size="sm"
                      className="mt-4 w-full"
                    >
                      Open trade ticket
                    </Button>
                  </section>
                </aside>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ManualTradeModal(props: {
  row: TokenBoardRow;
  tradeSetup: TokenTradeSetup | null;
  metrics: TokenRowMetrics;
  insight: DiscoveryLabTokenInsight | null;
  insightLoading: boolean;
  insightError: string | null;
  trackedPosition: PositionBookRow | null;
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null;
  disabledReason: string | null;
  pending: boolean;
  onSubmit: (draft: ManualTradeDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ManualTradeDraft>(() =>
    buildManualTradeDraft(props.tradeSetup),
  );
  const entryPriceUsd =
    props.tradeSetup?.entryPriceUsd ??
    props.insight?.market.priceUsd ??
    props.row.signal?.priceUsd ??
    null;
  const stopLossPercent = parseEditableNumber(draft.stopLossPercent);
  const tp1Percent = parseEditableNumber(draft.tp1Percent);
  const tp2Percent = parseEditableNumber(draft.tp2Percent);
  const draftIssues = useMemo(
    () =>
      getManualTradeDraftIssues(
        draft,
        props.runtimeSnapshot,
        props.tradeSetup,
        entryPriceUsd,
        props.trackedPosition,
      ),
    [
      draft,
      entryPriceUsd,
      props.runtimeSnapshot,
      props.tradeSetup,
      props.trackedPosition,
    ],
  );
  const sizePresets = useMemo(
    () => buildManualTradeSizePresets(props.runtimeSnapshot, props.tradeSetup),
    [props.runtimeSnapshot, props.tradeSetup],
  );
  const pricePreview = useMemo(
    () => buildDraftPricePreview(entryPriceUsd, draft),
    [draft, entryPriceUsd],
  );
  const openSlotsRemaining = props.runtimeSnapshot
    ? Math.max(
        props.runtimeSnapshot.settings.capital.maxOpenPositions -
          props.runtimeSnapshot.openPositions,
        0,
      )
    : null;
  const cashUsd = props.runtimeSnapshot?.botState.cashUsd ?? null;
  const hardDisabledReason =
    props.disabledReason ??
    draftIssues.find((issue) => issue.level === "error")?.message ??
    null;

  useEffect(() => {
    setDraft(buildManualTradeDraft(props.tradeSetup));
  }, [props.row.mint, props.tradeSetup]);

  const canSubmit = !hardDisabledReason && !props.pending;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[82] bg-black/88" />
        <Dialog.Content className="fixed inset-2 z-[83] overflow-hidden rounded-[24px] border border-bg-border bg-[var(--surface-modal)] shadow-2xl outline-none">
          <Dialog.Title className="sr-only">
            {props.row.symbol} trade ticket
          </Dialog.Title>
          <div className="flex h-full flex-col">
            <div className="border-b border-bg-border bg-[var(--surface-modal-strong)] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-text-primary">
                      {props.row.symbol} trade ticket
                    </div>
                    <OutcomePill outcome={props.row.outcome} />
                    <Badge variant="default">
                      {props.tradeSetup
                        ? humanizeProfile(props.tradeSetup.profile)
                        : "Manual"}
                    </Badge>
                    {props.insightLoading ? (
                      <Badge variant="default">Live insight loading</Badge>
                    ) : null}
                    {props.trackedPosition ? (
                      <Badge variant="default">Open position tracked</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Customize size and exit behavior, then open the trade
                    through the normal managed-entry path.
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={props.onClose}
                  variant="ghost"
                  size="sm"
                >
                  <X className="h-4 w-4" />
                  Close
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)]">
                <div className="space-y-5">
                  <section className="rounded-[16px] border border-[rgba(163,230,53,0.18)] bg-[#0f130f] p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <ScanStat
                        label="Entry ref"
                        value={formatTokenPrice(entryPriceUsd)}
                        detail="Current run snapshot"
                        tone="accent"
                      />
                      <ScanStat
                        label="Suggested size"
                        value={
                          props.tradeSetup?.suggestedCapitalUsd
                            ? formatCurrency(
                                props.tradeSetup.suggestedCapitalUsd,
                              )
                            : "—"
                        }
                        detail="Runtime-aware cap"
                      />
                      <ScanStat
                        label="EV/R"
                        value={formatSignedRatio(props.metrics.evToRisk)}
                        detail={formatSignedCurrency(props.metrics.evUsd)}
                      />
                      <ScanStat
                        label="Desk state"
                        value={formatDeskState(cashUsd, openSlotsRemaining)}
                        detail={
                          props.runtimeSnapshot?.botState.tradeMode ??
                          "Snapshot pending"
                        }
                      />
                    </div>
                    {hardDisabledReason ? (
                      <div className="mt-4 rounded-[14px] border border-[rgba(248,113,113,0.24)] bg-[#1a1011] px-4 py-3 text-sm text-[#f7c0c0]">
                        {hardDisabledReason}
                      </div>
                    ) : null}
                    {props.insightError ? (
                      <div className="mt-4 rounded-[14px] border border-bg-border bg-[#0d0f10] px-4 py-3 text-xs text-text-muted">
                        Live insight unavailable: {props.insightError}
                      </div>
                    ) : null}
                    {props.trackedPosition ? (
                      <div className="mt-4 rounded-[14px] border border-[rgba(163,230,53,0.16)] bg-[#0d100d] px-4 py-3 text-sm text-text-secondary">
                        This mint already has an open managed position with{" "}
                        {formatSignedPercent(props.trackedPosition.returnPct)}{" "}
                        return and{" "}
                        {formatSignedCurrency(
                          props.trackedPosition.unrealizedPnlUsd,
                        )}{" "}
                        unrealized PnL.{" "}
                        <a
                          href={`/positions/${props.trackedPosition.id}?book=open&focus=${props.trackedPosition.id}`}
                          className="font-semibold text-[#d6ff78] underline underline-offset-4"
                        >
                          Open tracked position
                        </a>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-[16px] border border-bg-border bg-[#101112] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                          Sizing
                        </div>
                        <div className="mt-1 text-sm text-text-secondary">
                          Pick a fast preset, then fine tune the actual USD
                          ticket if needed.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDraft(buildManualTradeDraft(props.tradeSetup))
                        }
                      >
                        Reset to calibrated
                      </Button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {sizePresets.map((preset) => (
                        <Button
                          key={preset.label}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              positionSizeUsd: formatEditableNumber(
                                preset.usd,
                                2,
                              ),
                            }))
                          }
                        >
                          {preset.label} {formatCurrency(preset.usd)}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <TradeField
                        label="Position size (USD)"
                        value={draft.positionSizeUsd}
                        description={
                          cashUsd !== null
                            ? `${formatCurrency(cashUsd)} cash free`
                            : "Waiting for runtime cash snapshot"
                        }
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            positionSizeUsd: value,
                          }))
                        }
                      />
                      <div className="rounded-[12px] border border-bg-border bg-[#0d0f10] px-3 py-3 md:col-span-2">
                        <div className="space-y-2">
                          <MetricLine
                            label="Outcome"
                            value={humanizeLabel(props.row.outcome)}
                            compact
                            emphasis
                          />
                          <MetricLine
                            label="Best play"
                            value={formatNumber(props.row.bestPlayScore)}
                            compact
                          />
                          <MetricLine
                            label="Consensus"
                            value={formatInteger(props.row.overlapCount)}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[16px] border border-bg-border bg-[#101112] p-4">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                        Exit profiles
                      </div>
                      <div className="mt-1 text-sm text-text-secondary">
                        Apply a calibrated exit shape first, then edit only the
                        fields you actually want to override.
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {MANUAL_EXIT_PRESETS.map((preset) => (
                        <Button
                          key={preset.id}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() =>
                            setDraft((current) =>
                              applyManualExitPreset(
                                current,
                                props.tradeSetup,
                                preset.id,
                              ),
                            )
                          }
                        >
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        label="Stop preview"
                        value={formatTargetValue(
                          pricePreview.stopLossPriceUsd,
                          stopLossPercent !== null ? -stopLossPercent : null,
                        )}
                      />
                      <MetricTile
                        label="TP1 preview"
                        value={formatTargetValue(
                          pricePreview.tp1PriceUsd,
                          tp1Percent,
                        )}
                      />
                      <MetricTile
                        label="TP2 preview"
                        value={formatTargetValue(
                          pricePreview.tp2PriceUsd,
                          tp2Percent,
                        )}
                      />
                      <MetricTile
                        label="Runner left"
                        value={formatRemainingRunnerPercent(draft)}
                      />
                    </div>
                    <div className="mt-5 border-t border-bg-border pt-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                        Exit rules
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                      <TradeField
                        label="Stop loss %"
                        value={draft.stopLossPercent}
                        description="Hard downside guard from entry."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            stopLossPercent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="TP1 %"
                        value={draft.tp1Percent}
                        description="First profit clip."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            tp1Percent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="TP2 %"
                        value={draft.tp2Percent}
                        description="Second profit target."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            tp2Percent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="TP1 sell %"
                        value={draft.tp1SellFractionPercent}
                        description="Size trimmed at TP1."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            tp1SellFractionPercent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="TP2 sell %"
                        value={draft.tp2SellFractionPercent}
                        description="Additional size trimmed at TP2."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            tp2SellFractionPercent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="Post-TP1 retrace %"
                        value={draft.postTp1RetracePercent}
                        description="Giveback allowed after TP1."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            postTp1RetracePercent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="Trail %"
                        value={draft.trailingStopPercent}
                        description="Runner protection after TP2."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            trailingStopPercent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="Time stop (min)"
                        value={draft.timeStopMinutes}
                        description="Review early if momentum stalls."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            timeStopMinutes: value,
                          }))
                        }
                      />
                      <TradeField
                        label="Min return %"
                        value={draft.timeStopMinReturnPercent}
                        description="Required return at time stop."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            timeStopMinReturnPercent: value,
                          }))
                        }
                      />
                      <TradeField
                        label="Max hold (min)"
                        value={draft.timeLimitMinutes}
                        description="Absolute trade expiry."
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            timeLimitMinutes: value,
                          }))
                        }
                      />
                    </div>
                    </div>
                  </section>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                  <section className="rounded-[16px] border border-[rgba(163,230,53,0.2)] bg-[#10150f] p-4">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Final check
                    </div>
                    <div className="mt-4 space-y-2 rounded-[14px] border border-bg-border bg-[#0d0f10] p-3">
                      <MetricLine
                        label="Outcome"
                        value={humanizeLabel(props.row.outcome)}
                        compact
                        emphasis
                      />
                      <MetricLine
                        label="Profile"
                        value={
                          props.tradeSetup
                            ? humanizeProfile(props.tradeSetup.profile)
                            : "Manual"
                        }
                        compact
                      />
                      <MetricLine
                        label="Max hold"
                        value={
                          props.tradeSetup
                            ? formatRelativeMinutes(props.tradeSetup.maxHoldMinutes)
                            : formatDraftMinutes(draft.timeLimitMinutes)
                        }
                        compact
                      />
                      <MetricLine
                        label="Slots left"
                        value={
                          openSlotsRemaining !== null
                            ? formatInteger(openSlotsRemaining)
                            : "—"
                        }
                        compact
                      />
                      <MetricLine
                        label="Size"
                        value={formatDraftCurrency(draft.positionSizeUsd)}
                        compact
                      />
                      <MetricLine
                        label="Stop"
                        value={formatDraftPercent(draft.stopLossPercent)}
                        compact
                      />
                      <MetricLine
                        label="TP ladder"
                        value={`${formatDraftPercent(draft.tp1Percent)} / ${formatDraftPercent(draft.tp2Percent)}`}
                        compact
                      />
                      <MetricLine
                        label="Sell fractions"
                        value={`${formatDraftPercent(draft.tp1SellFractionPercent)} / ${formatDraftPercent(draft.tp2SellFractionPercent)}`}
                        compact
                      />
                      <MetricLine
                        label="Hold rules"
                        value={`${formatDraftMinutes(draft.timeStopMinutes)} / ${formatDraftMinutes(draft.timeLimitMinutes)}`}
                        compact
                      />
                    </div>
                    {draftIssues.length > 0 ? (
                      <div className="mt-4 space-y-2 rounded-[14px] border border-bg-border bg-[#0d0f10] p-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                          Validation
                        </div>
                        {draftIssues.map((issue) => (
                          <div
                            key={`${issue.level}-${issue.message}`}
                            className={clsx(
                              "text-xs leading-5",
                              issue.level === "error"
                                ? "text-[#f7c0c0]"
                                : "text-text-secondary",
                            )}
                          >
                            {issue.level === "error" ? "Error" : "Watch"}:{" "}
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {props.insight ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <ExternalChipLink
                          href={props.insight.toolLinks.axiom}
                          label={props.insight.pairAddress ? "Axiom pair" : "Axiom"}
                        />
                        <ExternalChipLink
                          href={props.insight.toolLinks.dexscreener}
                          label="Dex"
                        />
                        {props.insight.socials.website ? (
                          <ExternalChipLink
                            href={props.insight.socials.website}
                            label="Website"
                          />
                        ) : null}
                        {props.insight.socials.twitter ? (
                          <ExternalChipLink
                            href={props.insight.socials.twitter}
                            label="X"
                          />
                        ) : null}
                        <ExternalChipLink
                          href={props.insight.toolLinks.rugcheck}
                          label="Rugcheck"
                        />
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => props.onSubmit(draft)}
                      disabled={!canSubmit}
                      variant="default"
                      size="sm"
                      className="mt-4 w-full"
                    >
                      {props.pending
                        ? "Opening trade..."
                        : "Open managed trade"}
                    </Button>
                  </section>
                </aside>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TagBucket(props: {
  title: string;
  labels: string[];
  total: number;
  tone?: "default" | "success" | "danger";
  emptyLabel?: string;
}) {
  const toneClass =
    props.tone === "success"
      ? "border-[rgba(163,230,53,0.16)] bg-[#10150f]"
      : props.tone === "danger"
        ? "border-[rgba(248,113,113,0.18)] bg-[#151011]"
        : "border-bg-border bg-[#0d0f10]";
  return (
    <div className={clsx("rounded-[12px] border px-3 py-3", toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {props.title}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {props.labels.length > 0 ? (
          props.labels.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary"
            >
              {label}
            </span>
          ))
        ) : (
          <span className="text-xs text-text-muted">
            {props.emptyLabel ?? "No labels."}
          </span>
        )}
        {props.total > props.labels.length ? (
          <span className="rounded-full border border-bg-border bg-[#111214] px-2 py-1 text-[10px] font-medium text-text-secondary">
            +{props.total - props.labels.length} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WatchoutCard(props: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-[#0d0f10] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {props.title}
      </div>
      <div className="mt-2 text-sm leading-6 text-text-secondary">
        {props.body}
      </div>
    </div>
  );
}

function TradeField(props: {
  label: string;
  value: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {props.label}
      </div>
      <Input
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        inputMode="decimal"
      />
      {props.description ? (
        <div className="mt-2 text-[11px] leading-4 text-text-muted">
          {props.description}
        </div>
      ) : null}
    </label>
  );
}

function buildManualTradeDraft(
  tradeSetup: TokenTradeSetup | null,
): ManualTradeDraft {
  return {
    positionSizeUsd: formatEditableNumber(
      tradeSetup?.suggestedCapitalUsd ?? null,
      2,
    ),
    stopLossPercent: formatEditableNumber(
      tradeSetup?.stopLossPercent ?? null,
      2,
    ),
    tp1Percent: formatEditableNumber(tradeSetup?.tp1Percent ?? null, 2),
    tp1SellFractionPercent: formatEditableNumber(
      tradeSetup?.tp1SellFractionPercent ?? null,
      2,
    ),
    tp2Percent: formatEditableNumber(tradeSetup?.tp2Percent ?? null, 2),
    tp2SellFractionPercent: formatEditableNumber(
      tradeSetup?.tp2SellFractionPercent ?? null,
      2,
    ),
    postTp1RetracePercent: formatEditableNumber(
      tradeSetup?.postTp1RetracePercent ?? null,
      2,
    ),
    trailingStopPercent: formatEditableNumber(
      tradeSetup?.trailingStopPercent ?? null,
      2,
    ),
    timeStopMinutes: formatEditableNumber(
      tradeSetup?.timeStopMinutes ?? null,
      1,
    ),
    timeStopMinReturnPercent: formatEditableNumber(
      tradeSetup?.timeStopMinReturnPercent ?? null,
      2,
    ),
    timeLimitMinutes: formatEditableNumber(
      tradeSetup?.maxHoldMinutes ?? null,
      1,
    ),
  };
}

function formatEditableNumber(value: number | null, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function isManualTradeDraftValid(draft: ManualTradeDraft): boolean {
  return [
    draft.positionSizeUsd,
    draft.stopLossPercent,
    draft.tp1Percent,
    draft.tp1SellFractionPercent,
    draft.tp2Percent,
    draft.tp2SellFractionPercent,
    draft.postTp1RetracePercent,
    draft.trailingStopPercent,
    draft.timeStopMinutes,
    draft.timeStopMinReturnPercent,
    draft.timeLimitMinutes,
  ].every((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

function parseEditableNumber(value: string): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildDraftPricePreview(
  entryPriceUsd: number | null,
  draft: ManualTradeDraft,
) {
  const stopLossPercent = parseEditableNumber(draft.stopLossPercent);
  const tp1Percent = parseEditableNumber(draft.tp1Percent);
  const tp2Percent = parseEditableNumber(draft.tp2Percent);
  if (entryPriceUsd === null || entryPriceUsd <= 0) {
    return {
      stopLossPriceUsd: null,
      tp1PriceUsd: null,
      tp2PriceUsd: null,
    };
  }
  return {
    stopLossPriceUsd:
      stopLossPercent !== null
        ? entryPriceUsd * (1 - stopLossPercent / 100)
        : null,
    tp1PriceUsd:
      tp1Percent !== null ? entryPriceUsd * (1 + tp1Percent / 100) : null,
    tp2PriceUsd:
      tp2Percent !== null ? entryPriceUsd * (1 + tp2Percent / 100) : null,
  };
}

function getMinimumManualTicketUsd(
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null,
): number {
  if (!runtimeSnapshot) {
    return 10;
  }
  return Math.max(
    10,
    Math.min(runtimeSnapshot.settings.capital.positionSizeUsd * 0.5, 15),
  );
}

function getManualTradeDraftIssues(
  draft: ManualTradeDraft,
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null,
  tradeSetup: TokenTradeSetup | null,
  entryPriceUsd: number | null,
  trackedPosition: PositionBookRow | null,
): ManualTradeIssue[] {
  const issues: ManualTradeIssue[] = [];
  const positionSizeUsd = parseEditableNumber(draft.positionSizeUsd);
  const stopLossPercent = parseEditableNumber(draft.stopLossPercent);
  const tp1Percent = parseEditableNumber(draft.tp1Percent);
  const tp2Percent = parseEditableNumber(draft.tp2Percent);
  const tp1SellFractionPercent = parseEditableNumber(
    draft.tp1SellFractionPercent,
  );
  const tp2SellFractionPercent = parseEditableNumber(
    draft.tp2SellFractionPercent,
  );
  const postTp1RetracePercent = parseEditableNumber(
    draft.postTp1RetracePercent,
  );
  const trailingStopPercent = parseEditableNumber(draft.trailingStopPercent);
  const timeStopMinutes = parseEditableNumber(draft.timeStopMinutes);
  const timeStopMinReturnPercent = parseEditableNumber(
    draft.timeStopMinReturnPercent,
  );
  const timeLimitMinutes = parseEditableNumber(draft.timeLimitMinutes);
  const totalTrimPercent =
    (tp1SellFractionPercent ?? 0) + (tp2SellFractionPercent ?? 0);

  if (trackedPosition) {
    issues.push({
      level: "error",
      message: "This mint already has an open managed position.",
    });
  }
  if (entryPriceUsd === null || entryPriceUsd <= 0) {
    issues.push({
      level: "error",
      message: "A valid entry price is required to build the trade ladder.",
    });
  }
  if (positionSizeUsd === null || positionSizeUsd <= 0) {
    issues.push({
      level: "error",
      message: "Position size must be a positive USD value.",
    });
  }
  if (
    runtimeSnapshot &&
    positionSizeUsd !== null &&
    positionSizeUsd > runtimeSnapshot.botState.cashUsd
  ) {
    issues.push({
      level: "error",
      message: "Position size exceeds available cash.",
    });
  }
  if (
    positionSizeUsd !== null &&
    positionSizeUsd < getMinimumManualTicketUsd(runtimeSnapshot)
  ) {
    issues.push({
      level: "error",
      message: `Position size is below the practical ticket floor of ${formatCurrency(getMinimumManualTicketUsd(runtimeSnapshot))}.`,
    });
  }
  if (stopLossPercent === null || stopLossPercent <= 0) {
    issues.push({
      level: "error",
      message: "Stop loss must be greater than 0%.",
    });
  }
  if (tp1Percent === null || tp1Percent <= 0) {
    issues.push({ level: "error", message: "TP1 must be greater than 0%." });
  }
  if (tp2Percent === null || tp2Percent <= 0) {
    issues.push({ level: "error", message: "TP2 must be greater than 0%." });
  }
  if (
    tp1Percent !== null &&
    stopLossPercent !== null &&
    tp1Percent <= stopLossPercent
  ) {
    issues.push({
      level: "warning",
      message:
        "TP1 is very close to the stop distance. Reward-to-risk is thin.",
    });
  }
  if (tp1Percent !== null && tp2Percent !== null && tp2Percent <= tp1Percent) {
    issues.push({ level: "error", message: "TP2 must be above TP1." });
  }
  if (
    tp1SellFractionPercent === null ||
    tp1SellFractionPercent <= 0 ||
    tp1SellFractionPercent >= 100
  ) {
    issues.push({
      level: "error",
      message: "TP1 sell fraction must stay between 0% and 100%.",
    });
  }
  if (
    tp2SellFractionPercent === null ||
    tp2SellFractionPercent <= 0 ||
    tp2SellFractionPercent >= 100
  ) {
    issues.push({
      level: "error",
      message: "TP2 sell fraction must stay between 0% and 100%.",
    });
  }
  if (totalTrimPercent > 100) {
    issues.push({
      level: "error",
      message: "TP1 and TP2 sell fractions cannot exceed 100% combined.",
    });
  } else if (totalTrimPercent > 90) {
    issues.push({
      level: "warning",
      message:
        "More than 90% of the position is scheduled to trim by TP2. Runner upside will be limited.",
    });
  }
  if (postTp1RetracePercent === null || postTp1RetracePercent <= 0) {
    issues.push({
      level: "error",
      message: "Post-TP1 retrace must be above 0%.",
    });
  }
  if (trailingStopPercent === null || trailingStopPercent <= 0) {
    issues.push({ level: "error", message: "Trailing stop must be above 0%." });
  }
  if (timeStopMinutes === null || timeStopMinutes <= 0) {
    issues.push({
      level: "error",
      message: "Time stop must be above 0 minutes.",
    });
  }
  if (timeStopMinReturnPercent === null || timeStopMinReturnPercent < 0) {
    issues.push({
      level: "error",
      message: "Minimum return at time stop cannot be negative.",
    });
  }
  if (timeLimitMinutes === null || timeLimitMinutes <= 0) {
    issues.push({
      level: "error",
      message: "Max hold must be above 0 minutes.",
    });
  }
  if (
    timeLimitMinutes !== null &&
    timeStopMinutes !== null &&
    timeLimitMinutes <= timeStopMinutes
  ) {
    issues.push({
      level: "error",
      message: "Max hold must stay above the early time-stop check.",
    });
  }
  if (
    tradeSetup?.suggestedCapitalUsd &&
    positionSizeUsd !== null &&
    positionSizeUsd > tradeSetup.suggestedCapitalUsd * 1.5
  ) {
    issues.push({
      level: "warning",
      message:
        "Ticket size is materially above the calibrated suggestion for this setup.",
    });
  }

  return issues;
}

function buildManualTradeSizePresets(
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null,
  tradeSetup: TokenTradeSetup | null,
): Array<{ label: string; usd: number }> {
  if (!runtimeSnapshot) {
    return tradeSetup?.suggestedCapitalUsd
      ? [{ label: "Desk", usd: tradeSetup.suggestedCapitalUsd }]
      : [];
  }

  const cashUsd = runtimeSnapshot.botState.cashUsd;
  const baseSizeUsd = runtimeSnapshot.settings.capital.positionSizeUsd;
  const starterUsd = Math.min(
    cashUsd,
    getMinimumManualTicketUsd(runtimeSnapshot),
  );
  const deskUsd = Math.min(
    cashUsd,
    Math.max(starterUsd, tradeSetup?.suggestedCapitalUsd ?? baseSizeUsd),
  );
  const pressUsd = Math.min(
    cashUsd,
    Math.max(starterUsd, Math.max(deskUsd, baseSizeUsd * 1.15)),
  );
  const maxUsd = Math.max(0, cashUsd);
  const seen = new Set<number>();

  return [
    { label: "Starter", usd: starterUsd },
    { label: "Desk", usd: deskUsd },
    { label: "Press", usd: pressUsd },
    { label: "Max", usd: maxUsd },
  ].filter((preset) => {
    const rounded = Math.round(preset.usd * 100);
    if (preset.usd <= 0 || seen.has(rounded)) {
      return false;
    }
    seen.add(rounded);
    return true;
  });
}

function applyManualExitPreset(
  currentDraft: ManualTradeDraft,
  tradeSetup: TokenTradeSetup | null,
  presetId: ManualExitPresetId,
): ManualTradeDraft {
  const baseDraft = tradeSetup
    ? buildManualTradeDraft(tradeSetup)
    : currentDraft;
  const numericBase = {
    stopLossPercent: parseEditableNumber(baseDraft.stopLossPercent) ?? 14,
    tp1Percent: parseEditableNumber(baseDraft.tp1Percent) ?? 30,
    tp1SellFractionPercent:
      parseEditableNumber(baseDraft.tp1SellFractionPercent) ?? 50,
    tp2Percent: parseEditableNumber(baseDraft.tp2Percent) ?? 100,
    tp2SellFractionPercent:
      parseEditableNumber(baseDraft.tp2SellFractionPercent) ?? 20,
    postTp1RetracePercent:
      parseEditableNumber(baseDraft.postTp1RetracePercent) ?? 10,
    trailingStopPercent:
      parseEditableNumber(baseDraft.trailingStopPercent) ?? 12,
    timeStopMinutes: parseEditableNumber(baseDraft.timeStopMinutes) ?? 4,
    timeStopMinReturnPercent:
      parseEditableNumber(baseDraft.timeStopMinReturnPercent) ?? 5,
    timeLimitMinutes: parseEditableNumber(baseDraft.timeLimitMinutes) ?? 8,
  };

  if (presetId === "calibrated" || presetId === "balanced") {
    return {
      ...baseDraft,
      positionSizeUsd: currentDraft.positionSizeUsd,
    };
  }

  const adjusted =
    presetId === "scalp"
      ? {
          stopLossPercent: clamp(numericBase.stopLossPercent * 0.82, 8, 25),
          tp1Percent: clamp(numericBase.tp1Percent * 0.85, 12, 80),
          tp2Percent: clamp(
            numericBase.tp2Percent * 0.76,
            Math.max(numericBase.tp1Percent * 1.2, 20),
            180,
          ),
          tp1SellFractionPercent: clamp(
            numericBase.tp1SellFractionPercent + 12,
            35,
            80,
          ),
          tp2SellFractionPercent: clamp(
            numericBase.tp2SellFractionPercent - 8,
            10,
            35,
          ),
          postTp1RetracePercent: clamp(
            numericBase.postTp1RetracePercent - 2,
            6,
            18,
          ),
          trailingStopPercent: clamp(
            numericBase.trailingStopPercent - 2,
            6,
            20,
          ),
          timeStopMinutes: clamp(numericBase.timeStopMinutes * 0.75, 1, 12),
          timeStopMinReturnPercent: clamp(
            numericBase.timeStopMinReturnPercent - 1,
            0,
            20,
          ),
          timeLimitMinutes: ensureTimeLimit(
            clamp(numericBase.timeLimitMinutes * 0.7, 2, 20),
            clamp(numericBase.timeStopMinutes * 0.75, 1, 12),
          ),
        }
      : {
          stopLossPercent: clamp(numericBase.stopLossPercent * 1.12, 10, 35),
          tp1Percent: clamp(numericBase.tp1Percent * 1.18, 20, 120),
          tp2Percent: clamp(
            numericBase.tp2Percent * 1.35,
            Math.max(numericBase.tp1Percent * 1.35, 45),
            320,
          ),
          tp1SellFractionPercent: clamp(
            numericBase.tp1SellFractionPercent - 15,
            20,
            55,
          ),
          tp2SellFractionPercent: clamp(
            numericBase.tp2SellFractionPercent + 5,
            15,
            40,
          ),
          postTp1RetracePercent: clamp(
            numericBase.postTp1RetracePercent + 2,
            8,
            24,
          ),
          trailingStopPercent: clamp(
            numericBase.trailingStopPercent + 3,
            10,
            28,
          ),
          timeStopMinutes: clamp(numericBase.timeStopMinutes * 1.35, 2, 30),
          timeStopMinReturnPercent: clamp(
            numericBase.timeStopMinReturnPercent + 2,
            1,
            25,
          ),
          timeLimitMinutes: ensureTimeLimit(
            clamp(numericBase.timeLimitMinutes * 1.4, 4, 90),
            clamp(numericBase.timeStopMinutes * 1.35, 2, 30),
          ),
        };

  return {
    positionSizeUsd: currentDraft.positionSizeUsd,
    stopLossPercent: formatEditableNumber(adjusted.stopLossPercent, 2),
    tp1Percent: formatEditableNumber(adjusted.tp1Percent, 2),
    tp1SellFractionPercent: formatEditableNumber(
      adjusted.tp1SellFractionPercent,
      2,
    ),
    tp2Percent: formatEditableNumber(adjusted.tp2Percent, 2),
    tp2SellFractionPercent: formatEditableNumber(
      adjusted.tp2SellFractionPercent,
      2,
    ),
    postTp1RetracePercent: formatEditableNumber(
      adjusted.postTp1RetracePercent,
      2,
    ),
    trailingStopPercent: formatEditableNumber(adjusted.trailingStopPercent, 2),
    timeStopMinutes: formatEditableNumber(adjusted.timeStopMinutes, 1),
    timeStopMinReturnPercent: formatEditableNumber(
      adjusted.timeStopMinReturnPercent,
      2,
    ),
    timeLimitMinutes: formatEditableNumber(adjusted.timeLimitMinutes, 1),
  };
}

function formatRemainingRunnerPercent(draft: ManualTradeDraft): string {
  const tp1Sell = parseEditableNumber(draft.tp1SellFractionPercent) ?? 0;
  const tp2Sell = parseEditableNumber(draft.tp2SellFractionPercent) ?? 0;
  return formatPercent(clamp(100 - tp1Sell - tp2Sell, 0, 100), 0);
}

function formatDeskState(
  cashUsd: number | null,
  openSlotsRemaining: number | null,
): string {
  if (cashUsd === null || openSlotsRemaining === null) {
    return "Syncing";
  }
  return `${formatCurrency(cashUsd)} · ${formatInteger(openSlotsRemaining)} slots`;
}

function formatDraftCurrency(value: string): string {
  return Number.isFinite(Number(value)) ? formatCurrency(Number(value)) : "—";
}

function formatDraftPercent(value: string): string {
  return Number.isFinite(Number(value)) ? formatPercent(Number(value), 0) : "—";
}

function formatDraftMinutes(value: string): string {
  return Number.isFinite(Number(value))
    ? formatRelativeMinutes(Number(value))
    : "—";
}

function formatBooleanState(
  value: boolean | null | undefined,
  trueLabel = "Yes",
  falseLabel = "No",
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return value ? trueLabel : falseLabel;
}

function formatTransferFee(
  enabled: boolean | null,
  percent: number | null,
): string {
  if (enabled === null) {
    return "—";
  }
  if (!enabled) {
    return "Off";
  }
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return "On";
  }
  return formatPercent(percent, 2);
}

function formatBuySellCounts(
  buys: number | null | undefined,
  sells: number | null | undefined,
): string {
  if (
    (buys === null || buys === undefined) &&
    (sells === null || sells === undefined)
  ) {
    return "—";
  }
  return `${formatInteger(buys ?? 0)} / ${formatInteger(sells ?? 0)}`;
}

function truncateMiddle(
  value: string | null,
  leading = 6,
  trailing = 4,
): string {
  if (!value) {
    return "—";
  }
  if (value.length <= leading + trailing + 3) {
    return value;
  }
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`;
}

function RawHitCard(props: {
  row: DiscoveryLabRunReport["deepEvaluations"][number];
}) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#0d0d0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">
            {props.row.recipeName}
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {humanizeLabel(props.row.source)}
          </div>
        </div>
        <OutcomePill outcome={props.row.pass ? "pass" : "reject"} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="text-sm text-text-primary">{props.row.symbol}</div>
        <TokenMarketLinks
          mint={props.row.mint}
          pairAddress={props.row.pairAddress}
          symbol={props.row.symbol}
        />
      </div>
      <div className="mt-1 font-mono text-[11px] tracking-[0.04em] text-text-muted">
        {props.row.mint}
      </div>

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
    current.bestPlayScore = Math.max(
      current.bestPlayScore,
      evaluation.playScore,
    );
    current.bestEntryScore = Math.max(
      current.bestEntryScore,
      evaluation.entryScore,
    );
    current.grades.add(evaluation.grade);
    if (evaluation.pass) {
      current.passedRecipes.add(evaluation.recipeName);
    } else {
      current.failedRecipes.add(evaluation.recipeName);
    }
    if (evaluation.rejectReason) {
      current.rejectReasons.set(
        evaluation.rejectReason,
        (current.rejectReasons.get(evaluation.rejectReason) ?? 0) + 1,
      );
    }
    evaluation.softIssues.forEach((issue) => current.softIssues.add(issue));
    evaluation.notes.forEach((note) => current.notes.add(note));
    current.pairAddress = current.pairAddress ?? evaluation.pairAddress ?? null;

    const signalPriority = evaluation.pass ? 2 : 1;
    if (
      current.signal === null ||
      signalPriority > current.signalPriority ||
      (signalPriority === current.signalPriority &&
        evaluation.playScore > current.signalScore)
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
      current.tradeSetup = evaluation.tradeSetup ?? null;
      current.pairAddress = evaluation.pairAddress ?? current.pairAddress;
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
      const topRejectReason =
        [...row.rejectReasons.entries()].sort(
          (left, right) =>
            right[1] - left[1] || left[0].localeCompare(right[0]),
        )[0]?.[0] ?? null;
      const outcome: TokenOutcome =
        row.winnerScore !== null
          ? "winner"
          : passedRecipes.length > 0
            ? "pass"
            : "reject";
      const symbol =
        row.symbol.trim().length > 0 ? row.symbol : "Unknown token";
      return {
        mint: row.mint,
        pairAddress: row.pairAddress,
        symbol,
        outcome,
        modes: [...row.modes].sort(),
        sources: [...row.sources].sort(),
        recipes,
        passedRecipes,
        failedRecipes,
        evaluationCount: row.evaluationCount,
        overlapCount: recipes.length,
        bestPlayScore:
          row.bestPlayScore > Number.NEGATIVE_INFINITY ? row.bestPlayScore : 0,
        avgPlayScore:
          row.evaluationCount > 0
            ? row.playScoreTotal / row.evaluationCount
            : 0,
        bestEntryScore:
          row.bestEntryScore > Number.NEGATIVE_INFINITY
            ? row.bestEntryScore
            : 0,
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
        tradeSetup: row.tradeSetup,
        searchText: [
          symbol,
          row.mint,
          row.pairAddress ?? "",
          ...row.modes,
          ...recipes,
          ...row.sources,
          ...passedRecipes,
          ...failedRecipes,
          ...grades,
          topRejectReason ?? "",
          ...row.softIssues,
          ...row.notes,
        ]
          .join(" ")
          .toLowerCase(),
      };
    })
    .sort(
      (left, right) =>
        (right.winnerScore ?? right.bestPlayScore) -
        (left.winnerScore ?? left.bestPlayScore),
    );
}

function getOrCreateRow(
  rows: Map<string, MutableTokenBoardRow>,
  mint: string,
  symbol: string,
): MutableTokenBoardRow {
  const existing = rows.get(mint);
  if (existing) {
    return existing;
  }

  const next: MutableTokenBoardRow = {
    mint,
    pairAddress: null,
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
    tradeSetup: null,
  };
  rows.set(mint, next);
  return next;
}

function buildBoardStats(
  report: DiscoveryLabRunReport | null,
  rows: TokenBoardRow[],
) {
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

function compareDiscoveryRowsForMobile(
  left: TokenBoardRow,
  right: TokenBoardRow,
) {
  const rightScore = right.winnerScore ?? right.bestPlayScore;
  const leftScore = left.winnerScore ?? left.bestPlayScore;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }
  if (right.overlapCount !== left.overlapCount) {
    return right.overlapCount - left.overlapCount;
  }
  if (right.bestEntryScore !== left.bestEntryScore) {
    return right.bestEntryScore - left.bestEntryScore;
  }
  return left.symbol.localeCompare(right.symbol);
}

function matchesResultFilter(
  row: TokenBoardRow,
  filter: ResultFilter,
): boolean {
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

function TokenMarketLinks(props: {
  mint: string;
  pairAddress?: string | null;
  symbol: string;
  creator?: string | null;
}) {
  const links = [
    {
      label: "Axiom",
      href: buildAxiomHref(props.pairAddress ?? props.mint),
      title: `Open ${props.symbol} on Axiom`,
    },
    {
      label: "Dex",
      href: buildDexScreenerHref(props.mint),
      title: `Open ${props.symbol} on DexScreener`,
    },
    {
      label: "Rug",
      href: buildRugcheckHref(props.mint),
      title: `Open ${props.symbol} on Rugcheck`,
    },
    {
      label: "Sol",
      href: buildSolscanTokenHref(props.mint),
      title: `Open ${props.symbol} on Solscan`,
    },
    ...(props.creator
      ? [
          {
            label: "Creator",
            href: buildSolscanAccountHref(props.creator) ?? "",
            title: `Open ${props.symbol} creator on Solscan`,
          },
        ]
      : []),
  ].filter((entry) => entry.href.length > 0);

  return (
    <>
      {links.map((entry) => (
        <a
          key={entry.label}
          href={entry.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-bg-border bg-[#0d0d0f] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:text-text-primary"
          title={entry.title}
        >
          {entry.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </>
  );
}

function ExternalChipLink(props: { href: string; label: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-bg-border bg-[#0d0d0f] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:text-text-primary"
    >
      {props.label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function StatusFlagCard(props: {
  label: string;
  value: boolean | null;
  dangerWhenTrue?: boolean;
  trueLabel?: string;
  falseLabel?: string;
}) {
  const toneClass =
    props.value === null
      ? "border-bg-border bg-[#0d0f10] text-text-muted"
      : props.dangerWhenTrue
        ? props.value
          ? "border-[rgba(248,113,113,0.24)] bg-[#151011] text-[#f7c0c0]"
          : "border-[rgba(163,230,53,0.18)] bg-[#10150f] text-[#d6ff78]"
        : props.value
          ? "border-[rgba(163,230,53,0.18)] bg-[#10150f] text-[#d6ff78]"
          : "border-bg-border bg-[#0d0f10] text-text-secondary";
  return (
    <div className={clsx("rounded-[12px] border px-3 py-3", toneClass)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {props.label}
      </div>
      <div className="mt-2 text-sm font-semibold">
        {formatBooleanState(
          props.value,
          props.trueLabel ?? "Enabled",
          props.falseLabel ?? "No",
        )}
      </div>
    </div>
  );
}

function buildAxiomHref(target: string): string {
  return `https://axiom.trade/meme/${target}?chain=sol`;
}

function buildDexScreenerHref(mint: string): string {
  return `https://dexscreener.com/solana/${mint}`;
}

function buildRugcheckHref(mint: string): string {
  return `https://rugcheck.xyz/tokens/${mint}`;
}

function buildSolscanTokenHref(mint: string): string {
  return `https://solscan.io/token/${mint}`;
}

function buildSolscanAccountHref(address: string | null): string | null {
  return address ? `https://solscan.io/account/${address}` : null;
}

function formatRunDuration(
  runDetail: DiscoveryLabRunDetail | null,
): string | null {
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

function safeClientTimestamp(
  value: string | null | undefined,
  hydrated: boolean,
  fallback = "—",
) {
  if (!value) {
    return fallback;
  }
  return hydrated ? formatTimestamp(value) : "Syncing...";
}

function buildTokenTradeSetup(
  row: TokenBoardRow,
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null,
): TokenTradeSetup | null {
  if (row.tradeSetup) {
    return {
      presetId: row.tradeSetup.presetId,
      profile: row.tradeSetup.profile,
      suggestedCapitalUsd: row.tradeSetup.suggestedCapitalUsd,
      entryPriceUsd: row.tradeSetup.entryPriceUsd,
      stopLossPercent: row.tradeSetup.stopLossPercent,
      stopLossPriceUsd: row.tradeSetup.stopLossPriceUsd,
      tp1Percent: row.tradeSetup.tp1Percent,
      tp1PriceUsd: row.tradeSetup.tp1PriceUsd,
      tp1SellFractionPercent: row.tradeSetup.tp1SellFractionPercent,
      tp2Percent: row.tradeSetup.tp2Percent,
      tp2PriceUsd: row.tradeSetup.tp2PriceUsd,
      tp2SellFractionPercent: row.tradeSetup.tp2SellFractionPercent,
      postTp1RetracePercent: row.tradeSetup.postTp1RetracePercent,
      trailingStopPercent: row.tradeSetup.trailingStopPercent,
      maxHoldMinutes: row.tradeSetup.timeLimitMinutes,
      timeStopMinutes: row.tradeSetup.timeStopMinutes,
      timeStopMinReturnPercent: row.tradeSetup.timeStopMinReturnPercent,
      doubleUpConfidencePercent: row.tradeSetup.confidenceScore * 100,
    };
  }

  if (!runtimeSnapshot) {
    return null;
  }

  const entryScore = clamp(row.bestEntryScore, 0, 1);
  const presetId = inferPresetId(row);
  const exitPlan = buildExitPlan(
    runtimeSnapshot.settings,
    entryScore,
    presetId,
  );
  const entryPriceUsd = row.signal?.priceUsd ?? null;

  return {
    presetId,
    profile: exitPlan.profile,
    suggestedCapitalUsd: calculateSuggestedCapitalUsd(
      runtimeSnapshot,
      entryScore,
    ),
    entryPriceUsd,
    stopLossPercent: exitPlan.stopLossPercent,
    stopLossPriceUsd:
      entryPriceUsd !== null
        ? entryPriceUsd * (1 - exitPlan.stopLossPercent / 100)
        : null,
    tp1Percent: (exitPlan.tp1Multiplier - 1) * 100,
    tp1PriceUsd:
      entryPriceUsd !== null ? entryPriceUsd * exitPlan.tp1Multiplier : null,
    tp1SellFractionPercent: exitPlan.tp1SellFraction * 100,
    tp2Percent: (exitPlan.tp2Multiplier - 1) * 100,
    tp2PriceUsd:
      entryPriceUsd !== null ? entryPriceUsd * exitPlan.tp2Multiplier : null,
    tp2SellFractionPercent: exitPlan.tp2SellFraction * 100,
    postTp1RetracePercent: exitPlan.postTp1RetracePercent,
    trailingStopPercent: exitPlan.trailingStopPercent,
    maxHoldMinutes: exitPlan.timeLimitMinutes,
    timeStopMinutes: exitPlan.timeStopMinutes,
    timeStopMinReturnPercent: exitPlan.timeStopMinReturnPercent,
    doubleUpConfidencePercent: calculateDoubleUpConfidencePercent(
      row,
      runtimeSnapshot.settings.filters,
    ),
  };
}

function inferPresetId(row: TokenBoardRow): StrategyPresetId {
  return row.modes.includes("pregrad")
    ? "LATE_CURVE_MIGRATION_SNIPE"
    : "FIRST_MINUTE_POSTGRAD_CONTINUATION";
}

function getManualTradeDisabledReason(
  row: TokenBoardRow,
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot | null,
  runDetail: DiscoveryLabRunDetail | null,
  trackedPosition: PositionBookRow | null,
): string | null {
  if (!runDetail?.id || !runDetail.report) {
    return "Load a completed discovery-lab run before entering a manual trade.";
  }
  if (!runtimeSnapshot) {
    return "Runtime snapshot is unavailable.";
  }
  if (runtimeSnapshot.botState.pauseReason) {
    return runtimeSnapshot.botState.pauseReason;
  }
  if (row.passedRecipes.length === 0) {
    return "Only pass-grade discovery-lab tokens can be entered manually.";
  }
  if (trackedPosition) {
    return "This mint already has an open managed position.";
  }
  if (!row.signal?.priceUsd || row.signal.priceUsd <= 0) {
    return "This token does not have a usable entry price snapshot.";
  }
  if (
    runtimeSnapshot.openPositions >=
    runtimeSnapshot.settings.capital.maxOpenPositions
  ) {
    return `Max open positions reached (${formatInteger(runtimeSnapshot.openPositions)}/${formatInteger(runtimeSnapshot.settings.capital.maxOpenPositions)}).`;
  }
  if (
    runtimeSnapshot.botState.cashUsd <
    getMinimumManualTicketUsd(runtimeSnapshot)
  ) {
    return `Need at least ${formatCurrency(getMinimumManualTicketUsd(runtimeSnapshot))} free cash before opening another managed trade.`;
  }
  return null;
}

function calculateSuggestedCapitalUsd(
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot,
  entryScore: number,
): number {
  const cashUsd = runtimeSnapshot.botState.cashUsd;
  const baseSizeUsd = runtimeSnapshot.settings.capital.positionSizeUsd;
  const openPositions = runtimeSnapshot.openPositions;
  const maxOpenPositions = Math.max(
    runtimeSnapshot.settings.capital.maxOpenPositions,
    1,
  );

  if (cashUsd <= 0) {
    return 0;
  }

  const remainingSlots = Math.max(maxOpenPositions - openPositions, 1);
  const minimumTicketUsd = Math.min(
    cashUsd,
    Math.max(10, Math.min(baseSizeUsd * 0.6, 15)),
  );
  const standardCapUsd = Math.min(
    cashUsd,
    Math.min(baseSizeUsd, cashUsd / remainingSlots),
  );
  const exposureScale =
    openPositions === 0 ? 1 : openPositions === 1 ? 0.94 : 0.82;

  let plannedSizeUsd =
    minimumTicketUsd +
    Math.max(standardCapUsd - minimumTicketUsd, 0) * entryScore;
  plannedSizeUsd *= exposureScale;

  if (entryScore >= 0.88 && openPositions <= 1) {
    const boostedCapUsd = Math.min(
      cashUsd,
      Math.max(baseSizeUsd + 5, baseSizeUsd * 1.2),
    );
    const boostProgress = clamp((entryScore - 0.88) / 0.12, 0, 1);
    plannedSizeUsd = Math.max(
      plannedSizeUsd,
      standardCapUsd +
        Math.max(boostedCapUsd - standardCapUsd, 0) * boostProgress,
    );
  }

  const floorUsd = Math.min(
    cashUsd,
    openPositions >= maxOpenPositions - 1 ? 10 : minimumTicketUsd,
  );
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
  tp1SellFraction: number;
  tp2SellFraction: number;
  postTp1RetracePercent: number;
  trailingStopPercent: number;
  timeStopMinutes: number;
  timeStopMinReturnPercent: number;
  timeLimitMinutes: number;
} {
  const presetOverrides =
    presetId === "LATE_CURVE_MIGRATION_SNIPE"
      ? {
          stopLossPercent: 16,
          tp1Multiplier: 1.4,
          tp2Multiplier: 2.0,
          tp1SellFraction: 0.55,
          tp2SellFraction: 0.25,
          postTp1RetracePercent: 10,
          trailingStopPercent: 14,
          timeStopMinutes: 3,
          timeStopMinReturnPercent: 6,
          timeLimitMinutes: 6,
        }
      : {
          stopLossPercent: 14,
          tp1Multiplier: 1.3,
          tp2Multiplier: 2.0,
          tp1SellFraction: 0.5,
          tp2SellFraction: 0.2,
          postTp1RetracePercent: 9,
          trailingStopPercent: 12,
          timeStopMinutes: 4,
          timeStopMinReturnPercent: 5,
          timeLimitMinutes: 8,
        };

  const exits = {
    ...settings.exits,
    ...presetOverrides,
  };

  if (entryScore >= 0.82) {
    const timeStopMinutes = scaleMinutes(
      exits.timeStopMinutes,
      1.7,
      exits.timeStopMinutes + 1,
      60,
    );
    return {
      profile: "runner",
      stopLossPercent: clamp(exits.stopLossPercent * 1.05, 12, 35),
      tp1Multiplier: Math.max(exits.tp1Multiplier + 0.15, 1.55),
      tp2Multiplier: Math.max(exits.tp2Multiplier + 0.4, 2.6),
      tp1SellFraction: clamp(exits.tp1SellFraction - 0.15, 0.2, 0.45),
      tp2SellFraction: clamp(exits.tp2SellFraction - 0.05, 0.15, 0.35),
      postTp1RetracePercent: clamp(exits.postTp1RetracePercent + 3, 10, 25),
      trailingStopPercent: clamp(exits.trailingStopPercent + 4, 12, 30),
      timeStopMinutes,
      timeStopMinReturnPercent: Math.max(exits.timeStopMinReturnPercent + 3, 8),
      timeLimitMinutes: ensureTimeLimit(
        scaleMinutes(
          exits.timeLimitMinutes,
          1.6,
          exits.timeLimitMinutes + 2,
          90,
        ),
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
      tp1SellFraction: exits.tp1SellFraction,
      tp2SellFraction: exits.tp2SellFraction,
      postTp1RetracePercent: exits.postTp1RetracePercent,
      trailingStopPercent: exits.trailingStopPercent,
      timeStopMinutes: exits.timeStopMinutes,
      timeStopMinReturnPercent: exits.timeStopMinReturnPercent,
      timeLimitMinutes: exits.timeLimitMinutes,
    };
  }

  const timeStopMinutes = scaleMinutes(
    exits.timeStopMinutes,
    0.8,
    1.5,
    exits.timeStopMinutes,
  );
  return {
    profile: "scalp",
    stopLossPercent: clamp(exits.stopLossPercent * 0.8, 10, 25),
    tp1Multiplier: Math.max(exits.tp1Multiplier - 0.1, 1.28),
    tp2Multiplier: Math.max(
      exits.tp2Multiplier - 0.3,
      exits.tp1Multiplier + 0.25,
    ),
    tp1SellFraction: clamp(exits.tp1SellFraction + 0.15, 0.45, 0.75),
    tp2SellFraction: clamp(exits.tp2SellFraction - 0.1, 0.1, 0.3),
    postTp1RetracePercent: clamp(exits.postTp1RetracePercent - 5, 8, 18),
    trailingStopPercent: clamp(exits.trailingStopPercent - 8, 10, 20),
    timeStopMinutes,
    timeStopMinReturnPercent: Math.max(exits.timeStopMinReturnPercent - 2, 2),
    timeLimitMinutes: ensureTimeLimit(
      scaleMinutes(
        exits.timeLimitMinutes,
        0.75,
        Math.max(exits.timeStopMinutes + 1, 3),
        exits.timeLimitMinutes,
      ),
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
  confidence +=
    normalize(
      signal?.buySellRatio ?? filters.minBuySellRatio,
      filters.minBuySellRatio,
      filters.minBuySellRatio + 0.45,
    ) * 0.1;
  confidence +=
    normalize(
      signal?.uniqueWallets5m ?? 0,
      filters.minUniqueBuyers5m * 0.6,
      filters.minUniqueBuyers5m * 2.2,
    ) * 0.06;
  confidence +=
    normalize(
      signal?.liquidityUsd ?? 0,
      filters.minLiquidityUsd * 0.7,
      filters.minLiquidityUsd * 2.5,
    ) * 0.08;
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

function buildTokenRowMetrics(
  row: TokenBoardRow,
  setup: TokenTradeSetup | null,
): TokenRowMetrics {
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

function calculateConservativeExpectedValue(
  row: TokenBoardRow,
  setup: TokenTradeSetup | null,
): Pick<
  TokenRowMetrics,
  "evPercent" | "evUsd" | "riskUsd" | "evToRisk" | "edgePp"
> {
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
  const outcomeTilt =
    row.outcome === "winner" ? 1.03 : row.outcome === "reject" ? 0.87 : 0.95;
  const winProbability = clamp(
    confidence * 0.62 * outcomeTilt + 0.08,
    0.12,
    0.72,
  );
  const conservativeRewardPercent = Math.max(
    (setup.tp1Percent * 0.78 + setup.tp2Percent * 0.22) * 0.68,
    0,
  );
  const conservativeLossPercent = Math.max(setup.stopLossPercent * 1.12, 0.1);

  const evPercent =
    winProbability * conservativeRewardPercent -
    (1 - winProbability) * conservativeLossPercent;
  const riskUsd = setup.suggestedCapitalUsd * (conservativeLossPercent / 100);
  const evUsd = setup.suggestedCapitalUsd * (evPercent / 100);
  const evToRisk = riskUsd > 0 ? evUsd / riskUsd : null;
  const breakEvenProbability =
    conservativeLossPercent /
    Math.max(conservativeLossPercent + conservativeRewardPercent, 0.0001);
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
  const driftPenalty = normalize(
    Math.abs(signal.priceChange30mPercent ?? 0),
    0,
    42,
  );
  const raw = ratio * 42 + buyers * 25 + momentum * 33 - driftPenalty * 20;
  return clamp(raw, 0, 100);
}

function calculateLiquidityRunway(
  row: TokenBoardRow,
  setup: TokenTradeSetup | null,
): number | null {
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
  const sinceGrad =
    row.signal?.timeSinceGraduationMin ?? row.winnerTimeSinceGraduationMin;
  const sinceCreation = row.signal?.timeSinceCreationMin;
  if (sinceGrad === null || sinceGrad === undefined) {
    return null;
  }
  const agePressure = normalize(sinceGrad, 2, 65) * 72;
  const creationPressure = normalize(sinceCreation ?? sinceGrad, 4, 180) * 18;
  const momentumRelief =
    normalize(row.signal?.priceChange5mPercent ?? 0, -8, 18) * 12;
  return clamp(agePressure + creationPressure - momentumRelief, 0, 100);
}

function calculateConsensusQuality(row: TokenBoardRow): number {
  const passRate =
    row.overlapCount > 0 ? row.passedRecipes.length / row.overlapCount : 0;
  const overlapSignal = normalize(row.overlapCount, 1, 5);
  const playSignal = normalize(row.bestPlayScore, 0.58, 1.08);
  const entrySignal = normalize(row.bestEntryScore, 0.55, 0.95);
  const outcomeBonus =
    row.outcome === "winner" ? 8 : row.outcome === "reject" ? -10 : 2;
  const raw =
    passRate * 34 +
    overlapSignal * 20 +
    playSignal * 28 +
    entrySignal * 18 +
    outcomeBonus;
  return clamp(raw, 0, 100);
}

function buildHeatmapScales(
  rows: TokenBoardRow[],
  metricsByMint: Map<string, TokenRowMetrics>,
): Record<HeatmapMetricKey, HeatmapScale | null> {
  const scales = {} as Record<HeatmapMetricKey, HeatmapScale | null>;
  for (const config of HEATMAP_METRIC_CONFIG) {
    const values = rows
      .map((row) => metricsByMint.get(row.mint)?.[config.key])
      .filter(isFiniteNumber);
    scales[config.key] =
      values.length >= 3
        ? {
            direction: config.direction,
            thresholds: buildQuantileThresholds(values),
          }
        : null;
  }
  return scales;
}

function buildQuantileThresholds(
  values: number[],
): [number, number, number, number] {
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
  return lowerValue + (upperValue - lowerValue) * (index - lowerIndex);
}

function getHeatmapBand(
  value: number,
  scale: HeatmapScale | null,
): number | null {
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

function formatSignedCurrency(
  value: number | null,
  includePlus = true,
): string {
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
  const sources = [root, metrics, scores].filter(Boolean) as Record<
    string,
    unknown
  >[];

  const label = pickString(sources, [
    "regime",
    "marketRegime",
    "label",
    "state",
    "phase",
    "classification",
  ]);
  const updatedAt = pickString(sources, [
    "updatedAt",
    "asOf",
    "timestamp",
    "calculatedAt",
  ]);
  const confidence = normalizePercentLike(
    pickNumber(sources, ["confidencePercent", "confidence", "probability"]),
  );
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

function collectRegimeChips(
  sources: Record<string, unknown>[],
): Array<{ label: string; value: string }> {
  const definitions: Array<{ label: string; keys: string[] }> = [
    { label: "Momentum", keys: ["momentumScore", "momentum", "trendScore"] },
    {
      label: "Breadth",
      keys: ["breadthScore", "breadth", "participationScore"],
    },
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
      chips.push({
        label: definition.label,
        value: formatPercent(rawValue * 100, 0),
      });
      continue;
    }
    if (Math.abs(rawValue) <= 100) {
      chips.push({ label: definition.label, value: formatNumber(rawValue) });
      continue;
    }
    chips.push({
      label: definition.label,
      value: formatCompactCurrency(rawValue),
    });
  }

  return chips;
}

function inferRegimeTone(
  label: string | null,
  chips: Array<{ label: string; value: string }>,
): MarketRegimeTone {
  const text =
    `${label ?? ""} ${chips.map((chip) => `${chip.label} ${chip.value}`).join(" ")}`.toLowerCase();
  if (
    text.includes("risk_on") ||
    text.includes("risk on") ||
    text.includes("bull") ||
    text.includes("expansion")
  ) {
    return "risk_on";
  }
  if (
    text.includes("risk_off") ||
    text.includes("risk off") ||
    text.includes("bear") ||
    text.includes("stress") ||
    text.includes("defensive")
  ) {
    return "risk_off";
  }
  return "balanced";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickNumber(
  sources: Record<string, unknown>[],
  keys: string[],
): number | null {
  for (const source of sources) {
    for (const key of keys) {
      const candidate = source[key];
      const numeric =
        typeof candidate === "number" ? candidate : Number(candidate);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }
  return null;
}

function pickString(
  sources: Record<string, unknown>[],
  keys: string[],
): string | null {
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

function BoardStat(props: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[16px] border border-bg-border bg-[#101012] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
        {props.label}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-text-primary">
        {props.value}
      </div>
      <div className="mt-2 text-xs leading-5 text-text-secondary">
        {props.detail}
      </div>
    </div>
  );
}

function HeatmapMetricCell(props: {
  value: number | null;
  scale: HeatmapScale | null;
  displayValue: string;
  align?: "left" | "center" | "right";
}) {
  const band =
    props.value !== null ? getHeatmapBand(props.value, props.scale) : null;
  const toneClass =
    band === null
      ? "border-bg-border bg-[#0f1011] text-text-muted"
      : HEATMAP_BAND_CLASSES[band];
  return (
    <div
      className={clsx(
        "min-w-[5.75rem]",
        props.align === "right"
          ? "text-right"
          : props.align === "center"
            ? "text-center"
            : "text-left",
      )}
    >
      <span
        className={clsx(
          "inline-flex min-w-[5.75rem] rounded-[9px] border px-2 py-1 text-xs font-semibold tabular-nums",
          props.align === "center"
            ? "justify-center"
            : props.align === "right"
              ? "justify-end"
              : "justify-start",
          toneClass,
        )}
      >
        {props.displayValue}
      </span>
    </div>
  );
}

function OutcomePill(props: { outcome: TokenOutcome; compact?: boolean }) {
  const tone =
    props.outcome === "winner"
      ? "border-[rgba(163,230,53,0.26)] bg-[rgba(163,230,53,0.12)] text-[var(--success)]"
      : props.outcome === "pass"
        ? "border-[rgba(250,204,21,0.24)] bg-[rgba(250,204,21,0.12)] text-[var(--warning)]"
        : "border-[rgba(251,113,133,0.26)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]";

  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border font-semibold uppercase tracking-[0.14em]",
        props.compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]",
        tone,
      )}
    >
      {props.outcome === "winner"
        ? "Winner"
        : props.outcome === "pass"
          ? "Pass grade"
          : "Reject"}
    </span>
  );
}

function MetricLine(props: {
  label: string;
  value: string;
  emphasis?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className={clsx(
          "uppercase tracking-[0.16em] text-text-muted",
          props.compact ? "text-[10px]" : "text-[11px]",
        )}
      >
        {props.label}
      </span>
      <span
        className={clsx(
          "font-medium tabular-nums",
          props.compact ? "text-xs" : "text-sm",
          props.emphasis ? "text-text-primary" : "text-text-secondary",
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

function CompactActionButton(props: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      variant="ghost"
      size="sm"
      className="h-7 rounded-full px-2.5 text-[11px]"
    >
      {props.icon}
      {props.label}
    </Button>
  );
}

function MetricTile(props: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-bg-border bg-[#0d0d0f] px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {props.label}
      </div>
      <div className="mt-2 text-sm font-semibold tabular-nums text-text-primary">
        {props.value}
      </div>
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

function formatTargetValue(
  priceUsd: number | null,
  percent: number | null,
): string {
  const direction = percent !== null && percent < 0 ? "" : "+";
  if (priceUsd === null || priceUsd === undefined) {
    return percent === null || percent === undefined
      ? "—"
      : `${direction}${formatPercent(percent, 0)}`;
  }
  if (percent === null || percent === undefined) {
    return formatTokenPrice(priceUsd);
  }
  return `${formatTokenPrice(priceUsd)} · ${direction}${formatPercent(percent, 0)}`;
}

function getOutcomeMarketCapUsd(row: TokenBoardRow): number | null {
  return row.signal?.marketCapUsd ?? row.winnerMarketCapUsd ?? null;
}

function getOutcomeMarketCapLabel(row: TokenBoardRow): string | null {
  if (row.outcome === "winner") {
    return "Winner mcap";
  }
  if (row.outcome === "reject") {
    return "Reject mcap";
  }
  return null;
}

function humanizeProfile(value: "scalp" | "balanced" | "runner"): string {
  return value === "scalp"
    ? "Scalp"
    : value === "balanced"
      ? "Balanced"
      : "Runner";
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

function scaleMinutes(
  value: number,
  multiplier: number,
  min: number,
  max: number,
): number {
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

const EMPTY_INSIGHT_STATE: InsightState = {
  loading: false,
  data: null,
  error: null,
};

const MANUAL_EXIT_PRESETS: Array<{ id: ManualExitPresetId; label: string }> = [
  { id: "calibrated", label: "Calibrated" },
  { id: "scalp", label: "Quick scalp" },
  { id: "balanced", label: "Balanced" },
  { id: "runner", label: "Runner" },
];

const HEATMAP_METRIC_CONFIG: Array<{
  key: HeatmapMetricKey;
  direction: HeatmapScale["direction"];
}> = [
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
