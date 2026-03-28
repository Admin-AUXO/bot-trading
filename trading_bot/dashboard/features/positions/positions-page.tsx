"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  dashboardQueryKeys,
  operatorSessionQueryOptions,
  positionHistoryQueryOptions,
  positionsQueryOptions,
  skippedSignalsQueryOptions,
} from "@/lib/dashboard-query-options";
import { manualEntry, manualExit } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Pagination } from "@/components/ui/pagination";
import { StatCardSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { SummaryTile } from "@/components/ui/summary-tile";
import { Tabs } from "@/components/ui/tabs";
import {
  cn,
  exitReasonLabel,
  exportCsv,
  formatPercent,
  formatSol,
  formatUsd,
  pnlClass,
  strategyColor,
  strategyLabel,
  timeAgo,
} from "@/lib/utils";
import {
  AlertTriangle,
  Crosshair,
  Download,
  History,
  LogIn,
  LogOut,
  ShieldAlert,
  Timer,
} from "lucide-react";

const STRATEGY_TIME_STOPS: Record<string, number> = {
  S1_COPY: 120,
  S2_GRADUATION: 15,
  S3_MOMENTUM: 5,
};

const STRATEGY_STOP_LOSS: Record<string, number> = {
  S1_COPY: 20,
  S2_GRADUATION: 25,
  S3_MOMENTUM: 10,
};

function getNextExit(position: { exit1Done: boolean; exit2Done: boolean; exit3Done: boolean; strategy: string }) {
  if (!position.exit1Done) {
    if (position.strategy === "S3_MOMENTUM") return "+20% (50%)";
    if (position.strategy === "S2_GRADUATION") return "2x (50%)";
    return "+30% (50%)";
  }
  if (!position.exit2Done) {
    if (position.strategy === "S3_MOMENTUM") return "+40% (25%)";
    if (position.strategy === "S2_GRADUATION") return "3-4x (30%)";
    return "+60% (25%)";
  }
  if (!position.exit3Done) return "Trailing";
  return "Done";
}

export default function PositionsPage() {
  const [tab, setTab] = useState<"open" | "history" | "skipped">("open");
  const [page, setPage] = useState(1);
  const [skippedPage, setSkippedPage] = useState(1);
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState<{ id: string; symbol: string } | null>(null);
  const { mode, selectedStrategy } = useDashboardStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
    setSkippedPage(1);
  }, [selectedStrategy]);

  const openPositionsQuery = useQuery(positionsQueryOptions(mode));
  const historyQuery = useQuery({
    ...positionHistoryQueryOptions(page, selectedStrategy, mode),
    enabled: tab === "history",
  });
  const skippedSignalsQuery = useQuery({
    ...skippedSignalsQueryOptions(skippedPage, selectedStrategy, mode),
    enabled: tab === "skipped",
  });
  const operatorSessionQuery = useQuery(operatorSessionQueryOptions());

  const controlsLocked = operatorSessionQuery.data?.configured !== false && !operatorSessionQuery.data?.authenticated;
  const controlsUnavailable = operatorSessionQuery.data?.configured === false;

  const entryMutation = useMutation({
    mutationFn: manualEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.positions(mode) });
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.skippedSignals(skippedPage, selectedStrategy, mode) });
      queryClient.invalidateQueries({ queryKey: ["position-history"] });
    },
  });

  const exitMutation = useMutation({
    mutationFn: (positionId: string) => manualExit(positionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.positions(mode) });
      queryClient.invalidateQueries({ queryKey: ["position-history"] });
    },
  });

  const filteredPositions = selectedStrategy
    ? openPositionsQuery.data?.filter((position) => position.strategy === selectedStrategy)
    : openPositionsQuery.data;
  const focusLabel = selectedStrategy ? strategyLabel(selectedStrategy) : "All strategies";

  const openSummary = useMemo(() => {
    const positions = filteredPositions ?? [];
    const openPnlUsd = positions.reduce((sum, position) => sum + (position.pnlUsd ?? 0), 0);
    const deployedSol = positions.reduce((sum, position) => sum + position.amountSol, 0);
    const urgentCount = positions.filter((position) => {
      const stopDistance = position.pnlPercent + (STRATEGY_STOP_LOSS[position.strategy] ?? 20);
      const timeRemaining = Math.max(
        0,
        (STRATEGY_TIME_STOPS[position.strategy] ?? 30) - (position.holdMinutes ?? 0),
      );
      return stopDistance <= 5 || timeRemaining <= 5;
    }).length;
    const manualCount = positions.filter((position) => position.tradeSource === "MANUAL").length;

    return { deployedSol, manualCount, openPnlUsd, urgentCount };
  }, [filteredPositions]);

  const historySummary = historyQuery.data?.summary;
  const skippedSummary = skippedSignalsQuery.data?.summary;

  const handleExportHistory = () => {
    if (!historyQuery.data?.data.length) return;

    exportCsv(
      "position-history",
      ["Strategy", "Token", "Entry", "Exit", "P&L $", "P&L %", "Exit Reason", "Closed"],
      historyQuery.data.data.map((position) => [
        strategyLabel(position.strategy),
        position.tokenSymbol,
        position.entryPriceUsd.toFixed(6),
        position.currentPriceUsd.toFixed(6),
        (position.pnlUsd ?? 0).toFixed(2),
        position.pnlPercent.toFixed(2),
        position.exitReason ?? "",
        position.closedAt ?? "",
      ]),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Position Risk</div>
          <div className="mt-1 text-sm text-text-secondary">
            {mode === "LIVE" ? "Live" : "Simulation"} mode · {selectedStrategy ? strategyLabel(selectedStrategy) : "All strategies"}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs
            tabs={[
              { id: "open", label: "Open", icon: <Crosshair className="h-3.5 w-3.5" />, count: filteredPositions?.length ?? 0 },
              { id: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
              { id: "skipped", label: "Skipped", icon: <LogIn className="h-3.5 w-3.5" />, count: skippedSignalsQuery.data?.total ?? 0 },
            ]}
            active={tab}
            onChange={(nextTab) => {
              setTab(nextTab);
              setPage(1);
              setSkippedPage(1);
            }}
          />

          {tab === "history" && historyQuery.data?.data.length ? (
            <button onClick={handleExportHistory} className="btn-ghost flex items-center gap-1 text-xs">
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          ) : null}
        </div>
      </div>

      {(controlsLocked || controlsUnavailable) ? (
        <div className="flex items-center gap-2 rounded-xl border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-xs text-accent-yellow">
          <ShieldAlert className="h-3.5 w-3.5" />
          {controlsUnavailable
            ? "Manual controls unavailable until a dashboard operator secret is configured."
            : "Manual controls are locked. Unlock operator access in Settings to act from this page."}
        </div>
      ) : null}

      {tab === "open" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryTile
              label="Open Positions"
              value={String(filteredPositions?.length ?? 0)}
              sub={selectedStrategy ? strategyLabel(selectedStrategy) : "All strategies"}
              icon={<Crosshair className="h-3.5 w-3.5 text-accent-blue" />}
            />
            <SummaryTile
              label="Open P&L"
              value={formatUsd(openSummary.openPnlUsd)}
              sub={`${openSummary.urgentCount} urgent`}
              valueClass={pnlClass(openSummary.openPnlUsd)}
              tone={openSummary.openPnlUsd < 0 ? "danger" : "default"}
            />
            <SummaryTile
              label="Capital Deployed"
              value={formatSol(openSummary.deployedSol)}
              sub="Current exposure"
            />
            <SummaryTile
              label="Urgent Exits"
              value={String(openSummary.urgentCount)}
              sub="Stop or time pressure"
              icon={<AlertTriangle className="h-3.5 w-3.5 text-accent-yellow" />}
              tone={openSummary.urgentCount > 0 ? "warning" : "default"}
            />
            <SummaryTile
              label="Manual Positions"
              value={String(openSummary.manualCount)}
              sub="Override entries"
            />
          </div>

          <ErrorBoundary>
            {openPositionsQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-4">
                <StatCardSkeleton />
                <TableSkeleton rows={4} cols={11} />
              </div>
            ) : (
              <div className="card overflow-x-auto">
                <table className="table-sticky-header w-full">
                  <thead>
                    <tr className="border-b border-bg-border">
                      <th className="table-header">Strategy</th>
                      <th className="table-header">Token</th>
                      <th className="table-header">Size</th>
                      <th className="table-header">Entry</th>
                      <th className="table-header">Current</th>
                      <th className="table-header">P&amp;L</th>
                      <th className="table-header">Stop</th>
                      <th className="table-header">Time</th>
                      <th className="table-header">Next Exit</th>
                      <th className="table-header">Source</th>
                      <th className="table-header">Exit</th>
                    </tr>
                  </thead>
                  <motion.tbody layout>
                    <AnimatePresence mode="popLayout">
                      {filteredPositions?.map((position, index) => {
                        const stopDistance = position.pnlPercent + (STRATEGY_STOP_LOSS[position.strategy] ?? 20);
                        const timeBudget = STRATEGY_TIME_STOPS[position.strategy] ?? 30;
                        const holdMinutes = position.holdMinutes ?? 0;
                        const timeRemaining = Math.max(0, timeBudget - holdMinutes);
                        const nextExit = getNextExit(position);

                        return (
                          <motion.tr
                            key={position.id}
                            className="table-row"
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ duration: 0.18, delay: index * 0.015 }}
                          >
                            <td className={cn("table-cell font-medium", strategyColor(position.strategy))}>
                              {strategyLabel(position.strategy)}
                            </td>
                            <td className="table-cell">
                              <div className="font-medium text-text-primary">{position.tokenSymbol}</div>
                              <div className="text-[10px] text-text-muted">
                                {position.walletSource ? `${position.walletSource.slice(0, 6)}…${position.walletSource.slice(-4)}` : "Tracked position"}
                              </div>
                            </td>
                            <td className="table-cell tabular-nums">{formatSol(position.amountSol)}</td>
                            <td className="table-cell tabular-nums text-text-muted">{formatUsd(position.entryPriceUsd)}</td>
                            <td className="table-cell tabular-nums">{formatUsd(position.currentPriceUsd)}</td>
                            <td className={cn("table-cell font-medium tabular-nums", pnlClass(position.pnlUsd ?? 0))}>
                              <div>{formatPercent(position.pnlPercent)}</div>
                              <div className="text-[10px]">{formatUsd(position.pnlUsd ?? 0)}</div>
                            </td>
                            <td className="table-cell">
                              <div className={cn("font-medium", stopDistance <= 5 ? "text-accent-red" : stopDistance <= 10 ? "text-accent-yellow" : "text-text-secondary")}>
                                {stopDistance.toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-text-muted">to stop</div>
                            </td>
                            <td className="table-cell">
                              <div className={cn("font-medium", timeRemaining <= 3 ? "text-accent-red" : timeRemaining <= 10 ? "text-accent-yellow" : "text-text-secondary")}>
                                {timeRemaining.toFixed(0)}m
                              </div>
                              <div className="text-[10px] text-text-muted">{holdMinutes.toFixed(0)}m held</div>
                            </td>
                            <td className="table-cell text-xs text-text-secondary">{nextExit}</td>
                            <td className="table-cell">
                              <span className={position.tradeSource === "MANUAL" ? "badge badge-yellow text-[10px]" : "badge badge-blue text-[10px]"}>
                                {position.tradeSource ?? "AUTO"}
                              </span>
                            </td>
                            <td className="table-cell">
                              <motion.button
                                className={cn(
                                  "btn-ghost text-xs text-accent-red transition-shadow disabled:opacity-40",
                                  exitMutation.isPending && exitingId === position.id
                                    ? "shadow-[0_0_12px_rgba(239,68,68,0.35)]"
                                    : "hover:shadow-[0_0_12px_rgba(239,68,68,0.35)]",
                                )}
                                disabled={controlsLocked || controlsUnavailable || (exitMutation.isPending && exitingId === position.id)}
                                title={
                                  controlsUnavailable
                                    ? "Dashboard operator secret is not configured"
                                    : controlsLocked
                                      ? "Unlock operator access in Settings"
                                      : "Exit position"
                                }
                                onClick={() => setConfirmExit({ id: position.id, symbol: position.tokenSymbol })}
                                whileTap={{ scale: 0.95 }}
                              >
                                {exitMutation.isPending && exitingId === position.id ? (
                                  <motion.div
                                    className="inline-block h-3.5 w-3.5 rounded-full border-2 border-accent-red/30 border-t-accent-red"
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                  />
                                ) : (
                                  <LogOut className="inline h-3.5 w-3.5" />
                                )}
                              </motion.button>
                            </td>
                          </motion.tr>
                        );
                      })}

                      {!filteredPositions?.length ? (
                        <tr>
                          <td colSpan={11}>
                            <EmptyState
                              icon={<Crosshair className="h-5 w-5" />}
                              title="No open positions"
                              description="The bot is scanning. Open risk will appear here once entries are active."
                            />
                          </td>
                        </tr>
                      ) : null}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>
            )}
          </ErrorBoundary>
        </>
      ) : null}

      {tab === "history" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryTile
              label="Closed"
              value={String(historySummary?.closedCount ?? 0)}
              sub={`${focusLabel} · page ${page}`}
              icon={<History className="h-3.5 w-3.5 text-accent-purple" />}
            />
            <SummaryTile
              label="Wins / Losses"
              value={`${historySummary?.wins ?? 0} / ${historySummary?.losses ?? 0}`}
              sub="Across filtered history"
            />
            <SummaryTile
              label="Net P&L"
              value={formatUsd(historySummary?.netPnlUsd ?? 0)}
              sub="Closed positions only"
              valueClass={pnlClass(historySummary?.netPnlUsd ?? 0)}
              tone={(historySummary?.netPnlUsd ?? 0) < 0 ? "danger" : "default"}
            />
            <SummaryTile
              label="Avg P&L %"
              value={`${(historySummary?.avgPnlPercent ?? 0).toFixed(1)}%`}
              sub="Average close outcome"
              valueClass={pnlClass(historySummary?.avgPnlPercent ?? 0)}
            />
            <SummaryTile
              label="Last Page Size"
              value={String(historyQuery.data?.data.length ?? 0)}
              sub="Visible rows"
            />
          </div>

          <ErrorBoundary>
            {historyQuery.isLoading ? (
              <TableSkeleton rows={5} cols={8} />
            ) : (
              <>
                <div className="card overflow-x-auto">
                  <table className="table-sticky-header w-full">
                    <thead>
                      <tr className="border-b border-bg-border">
                        <th className="table-header">Strategy</th>
                        <th className="table-header">Token</th>
                        <th className="table-header">Entry</th>
                        <th className="table-header">Exit</th>
                        <th className="table-header">P&amp;L $</th>
                        <th className="table-header">P&amp;L %</th>
                        <th className="table-header">Exit Reason</th>
                        <th className="table-header">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyQuery.data?.data.map((position) => {
                        const exit = exitReasonLabel(position.exitReason);
                        return (
                          <tr key={position.id} className="table-row">
                            <td className={cn("table-cell font-medium", strategyColor(position.strategy))}>
                              {strategyLabel(position.strategy)}
                            </td>
                            <td className="table-cell font-medium">{position.tokenSymbol}</td>
                            <td className="table-cell tabular-nums">{formatUsd(position.entryPriceUsd)}</td>
                            <td className="table-cell tabular-nums">{formatUsd(position.currentPriceUsd)}</td>
                            <td className={cn("table-cell font-medium tabular-nums", pnlClass(position.pnlUsd ?? 0))}>
                              {formatUsd(position.pnlUsd ?? 0)}
                            </td>
                            <td className={cn("table-cell tabular-nums", pnlClass(position.pnlPercent))}>
                              {formatPercent(position.pnlPercent)}
                            </td>
                            <td className="table-cell">
                              <span className={`badge ${exit.class}`}>{exit.label}</span>
                            </td>
                            <td className="table-cell text-text-muted">{position.closedAt ? timeAgo(position.closedAt) : "—"}</td>
                          </tr>
                        );
                      })}

                      {!historyQuery.data?.data.length ? (
                        <tr>
                          <td colSpan={8}>
                            <EmptyState
                              icon={<History className="h-5 w-5" />}
                              title="No closed positions"
                              description="Closed positions will appear here once exits start printing."
                            />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  totalPages={historyQuery.data?.totalPages ?? 1}
                  onPageChange={setPage}
                  className="mt-4"
                />
              </>
            )}
          </ErrorBoundary>
        </>
      ) : null}

      {tab === "skipped" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryTile
              label="Blocked Signals"
              value={String(skippedSummary?.totalSignals ?? 0)}
              sub={`${focusLabel} · page ${skippedPage}`}
              icon={<LogIn className="h-3.5 w-3.5 text-accent-cyan" />}
            />
            <SummaryTile
              label="Top Reject"
              value={skippedSummary?.topRejectReason?.replace(/_/g, " ") ?? "MAX_POSITIONS"}
              sub={skippedSummary?.topRejectCount ? `×${skippedSummary.topRejectCount}` : "No dominant reject"}
              tone="warning"
            />
            <SummaryTile
              label="Last Signal"
              value={skippedSummary?.lastDetectedAt ? timeAgo(skippedSummary.lastDetectedAt) : "—"}
              sub="Most recent blocked entry"
              icon={<Timer className="h-3.5 w-3.5 text-accent-yellow" />}
            />
            <SummaryTile
              label="Manual Entry"
              value={controlsLocked || controlsUnavailable ? "Locked" : "Ready"}
              sub="Enter directly from this queue"
              tone={controlsLocked || controlsUnavailable ? "warning" : "positive"}
            />
            <SummaryTile
              label="Action Errors"
              value={actionError ? "1" : "0"}
              sub={actionError ?? "No current action failures"}
              tone={actionError ? "danger" : "default"}
            />
          </div>

          <ErrorBoundary>
            {skippedSignalsQuery.isLoading ? (
              <TableSkeleton rows={4} cols={9} />
            ) : (
              <>
                {actionError ? (
                  <div className="rounded-xl border border-accent-red/25 bg-accent-red/8 px-3 py-2 text-xs text-accent-red">
                    {actionError}
                  </div>
                ) : null}

                <div className="card overflow-x-auto">
                  <table className="table-sticky-header w-full">
                    <thead>
                      <tr className="border-b border-bg-border">
                        <th className="table-header">Strategy</th>
                        <th className="table-header">Token</th>
                        <th className="table-header">Price</th>
                        <th className="table-header">Mcap</th>
                        <th className="table-header">Liq.</th>
                        <th className="table-header">Vol 5m</th>
                        <th className="table-header">Buy%</th>
                        <th className="table-header">Blocked</th>
                        <th className="table-header">Enter</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skippedSignalsQuery.data?.data.map((signal) => (
                        <tr key={signal.id} className="table-row">
                          <td className={cn("table-cell font-medium", strategyColor(signal.strategy))}>
                            {strategyLabel(signal.strategy)}
                          </td>
                          <td className="table-cell">
                            <div className="font-medium">{signal.tokenSymbol || "—"}</div>
                            <div className="max-w-[90px] truncate text-[10px] text-text-muted" title={signal.tokenAddress}>
                              {signal.tokenAddress.slice(0, 6)}...
                            </div>
                          </td>
                          <td className="table-cell text-text-muted">{signal.priceAtSignal ? formatUsd(signal.priceAtSignal) : "—"}</td>
                          <td className="table-cell text-text-muted">{signal.tokenMcap ? `$${(signal.tokenMcap / 1000).toFixed(0)}K` : "—"}</td>
                          <td className="table-cell text-text-muted">{signal.tokenLiquidity ? `$${(signal.tokenLiquidity / 1000).toFixed(0)}K` : "—"}</td>
                          <td className="table-cell text-text-muted">{signal.tokenVolume5m ? `$${(signal.tokenVolume5m / 1000).toFixed(1)}K` : "—"}</td>
                          <td className="table-cell">
                            {signal.buyPressure != null ? (
                              <span className={signal.buyPressure > 60 ? "text-accent-green" : "text-text-muted"}>
                                {(signal.buyPressure * 100).toFixed(0)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="table-cell text-xs text-text-muted">{timeAgo(signal.detectedAt)}</td>
                          <td className="table-cell">
                            <button
                              className="btn-ghost text-xs text-accent-green disabled:opacity-40"
                              disabled={controlsLocked || controlsUnavailable || (entryMutation.isPending && enteringId === signal.id)}
                              title={
                                controlsUnavailable
                                  ? "Dashboard operator secret is not configured"
                                  : controlsLocked
                                    ? "Unlock operator access in Settings"
                                    : "Enter position"
                              }
                              onClick={async () => {
                                setEnteringId(signal.id);
                                setActionError(null);

                                try {
                                  const result = await entryMutation.mutateAsync({
                                    tokenAddress: signal.tokenAddress,
                                    tokenSymbol: signal.tokenSymbol,
                                    strategy: signal.strategy,
                                  });

                                  if (!result.success) setActionError(result.error ?? "entry failed");
                                } catch {
                                  setActionError("entry failed");
                                } finally {
                                  setEnteringId(null);
                                }
                              }}
                            >
                              <LogIn className="inline h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}

                      {!skippedSignalsQuery.data?.data.length ? (
                        <tr>
                          <td colSpan={9}>
                            <EmptyState
                              icon={<LogIn className="h-5 w-5" />}
                              title="No skipped signals"
                              description="Signals rejected by max-position pressure will queue here for manual review."
                            />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={skippedPage}
                  totalPages={skippedSignalsQuery.data?.totalPages ?? 1}
                  onPageChange={setSkippedPage}
                  className="mt-4"
                />
              </>
            )}
          </ErrorBoundary>
        </>
      ) : null}

      <ConfirmDialog
        open={confirmExit !== null}
        title={`Exit ${confirmExit?.symbol ?? ""}`}
        description="This will execute a market sell of the full remaining position."
        confirmLabel="Exit Position"
        danger
        onConfirm={async () => {
          if (!confirmExit) return;

          setExitingId(confirmExit.id);
          setActionError(null);
          setConfirmExit(null);

          try {
            const result = await exitMutation.mutateAsync(confirmExit.id);
            if (!result.success) setActionError(result.error ?? "exit failed");
          } catch {
            setActionError("exit failed");
          } finally {
            setExitingId(null);
          }
        }}
        onCancel={() => setConfirmExit(null)}
      />
    </div>
  );
}
