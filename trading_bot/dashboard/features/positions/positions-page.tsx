"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { fetchPositions, fetchPositionHistory, fetchSkippedSignals, manualEntry, manualExit, getErrorMessage } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { formatUsd, formatPercent, formatSol, pnlClass, strategyLabel, strategyColor, timeAgo, exitReasonLabel, exportCsv } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { motion, AnimatePresence } from "motion/react";
import { Crosshair, History, LogIn, LogOut, Download } from "lucide-react";

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

function getNextExit(pos: { exit1Done: boolean; exit2Done: boolean; exit3Done: boolean; strategy: string }) {
  if (!pos.exit1Done) {
    if (pos.strategy === "S3_MOMENTUM") return "+20% (50%)";
    if (pos.strategy === "S2_GRADUATION") return "2x (50%)";
    return "+30% (50%)";
  }
  if (!pos.exit2Done) {
    if (pos.strategy === "S3_MOMENTUM") return "+40% (25%)";
    if (pos.strategy === "S2_GRADUATION") return "3-4x (30%)";
    return "+60% (25%)";
  }
  if (!pos.exit3Done) return "Trailing";
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

  const { data: openPositions, isLoading: loadingOpen, error: errorOpen } = useQuery({
    queryKey: ["positions", mode],
    queryFn: () => fetchPositions(mode),
    refetchInterval: (query) => query.state.status === "error" ? 30_000 : 3000,
  });

  const { data: history, isLoading: loadingHistory, error: errorHistory } = useQuery({
    queryKey: ["position-history", page, selectedStrategy, mode],
    queryFn: () => fetchPositionHistory(page, selectedStrategy ?? undefined, mode),
    enabled: tab === "history",
  });

  const { data: skippedSignals, isLoading: loadingSkipped } = useQuery({
    queryKey: ["skipped-signals", skippedPage],
    queryFn: () => fetchSkippedSignals(skippedPage),
    enabled: tab === "skipped",
    refetchInterval: (query) => query.state.status === "error" ? 30_000 : 15_000,
  });

  const entryMutation = useMutation({
    mutationFn: manualEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["skipped-signals"] });
      queryClient.invalidateQueries({ queryKey: ["position-history"] });
    },
  });

  const exitMutation = useMutation({
    mutationFn: (positionId: string) => manualExit(positionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });

  const filteredPositions = selectedStrategy
    ? openPositions?.filter((p) => p.strategy === selectedStrategy)
    : openPositions;

  const handleExportHistory = () => {
    if (!history?.data) return;
    exportCsv("position-history",
      ["Strategy", "Token", "Entry", "Exit", "P&L $", "P&L %", "Exit Reason", "Closed"],
      history.data.map((p) => [
        strategyLabel(p.strategy), p.tokenSymbol,
        p.entryPriceUsd.toFixed(6), p.currentPriceUsd.toFixed(6),
        (p.pnlUsd ?? 0).toFixed(2), p.pnlPercent.toFixed(2),
        p.exitReason ?? "", p.closedAt ?? "",
      ])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs
          tabs={[
            { id: "open", label: "Open", icon: <Crosshair className="w-3.5 h-3.5" />, count: filteredPositions?.length ?? 0 },
            { id: "history", label: "History", icon: <History className="w-3.5 h-3.5" /> },
            { id: "skipped", label: "Skipped", icon: <LogIn className="w-3.5 h-3.5" />, count: skippedSignals?.total ?? 0 },
          ]}
          active={tab}
          onChange={(id) => { setTab(id); setPage(1); setSkippedPage(1); }}
        />
        {tab === "history" && history?.data && history.data.length > 0 && (
          <button onClick={handleExportHistory} className="btn-ghost text-xs flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}
      </div>

      {tab === "open" && (
        <ErrorBoundary>
          {loadingOpen ? (
            <TableSkeleton rows={3} cols={10} />
          ) : errorOpen ? (
            <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
              Failed to load positions — {getErrorMessage(errorOpen)}
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bg-border">
                    <th className="table-header">Strategy</th>
                    <th className="table-header">Token</th>
                    <th className="table-header">Entry</th>
                    <th className="table-header">Current</th>
                    <th className="table-header">P&L</th>
                    <th className="table-header">Size</th>
                    <th className="table-header">Stop Dist.</th>
                    <th className="table-header">Time Left</th>
                    <th className="table-header">Next Exit</th>
                    <th className="table-header">Tranches</th>
                    <th className="table-header">Hold</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Exit</th>
                  </tr>
                </thead>
                <motion.tbody layout>
                  <AnimatePresence mode="popLayout">
                    {filteredPositions?.map((pos, idx) => {
                      const stopPct = STRATEGY_STOP_LOSS[pos.strategy] ?? 20;
                      const stopDist = pos.pnlPercent - (-stopPct);
                      const timeStopMin = STRATEGY_TIME_STOPS[pos.strategy] ?? 30;
                      const holdMin = pos.holdMinutes ?? 0;
                      const timeLeft = Math.max(0, timeStopMin - holdMin);

                      return (
                        <motion.tr key={pos.id} className="table-row" layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2, delay: idx * 0.02 }}>
                          <td className={`table-cell ${strategyColor(pos.strategy)} font-medium`}>
                            <div>{strategyLabel(pos.strategy)}</div>
                            {pos.walletSource && (
                              <div className="text-[10px] text-text-muted truncate max-w-[80px]" title={pos.walletSource}>
                                {pos.walletSource.slice(0, 6)}...
                              </div>
                            )}
                          </td>
                          <td className="table-cell font-medium">{pos.tokenSymbol}</td>
                          <td className="table-cell text-text-muted">{formatUsd(pos.entryPriceUsd)}</td>
                          <td className="table-cell">{formatUsd(pos.currentPriceUsd)}</td>
                          <td className={`table-cell font-medium transition-colors duration-300 ${pnlClass(pos.pnlPercent)}`}>
                            {formatPercent(pos.pnlPercent)}
                          </td>
                          <td className="table-cell">{formatSol(pos.amountSol)}</td>
                          <td className="table-cell">
                            <span className={stopDist < 5 ? "text-accent-red font-medium" : "text-text-muted"}>
                              {stopDist.toFixed(1)}%
                            </span>
                          </td>
                          <td className="table-cell">
                            {pos.pnlPercent < 5 ? (
                              <span className={timeLeft < 1 ? "text-accent-red font-medium" : "text-text-muted"}>
                                {timeLeft.toFixed(0)}m
                              </span>
                            ) : (
                              <span className="text-accent-green text-xs">passed</span>
                            )}
                          </td>
                          <td className="table-cell text-xs">
                            {getNextExit(pos)}
                          </td>
                          <td className="table-cell">
                            <span className={pos.tranche1Filled ? "text-accent-green" : "text-text-muted"}>T1</span>
                            {" / "}
                            <span className={pos.tranche2Filled ? "text-accent-green" : "text-text-muted"}>T2</span>
                          </td>
                          <td className="table-cell text-text-muted">
                            {holdMin.toFixed(0)}m
                          </td>
                          <td className="table-cell">
                            {pos.tradeSource === "MANUAL" ? (
                              <span className="badge badge-yellow text-[10px]">MANUAL</span>
                            ) : (
                              <span className="text-text-muted text-[10px]">AUTO</span>
                            )}
                          </td>
                          <td className="table-cell">
                            <motion.button
                              className={`btn-ghost text-xs text-accent-red disabled:opacity-40 ${
                                exitMutation.isPending && exitingId === pos.id
                                  ? "shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                                  : "hover:shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                              } transition-shadow`}
                              disabled={exitMutation.isPending && exitingId === pos.id}
                              onClick={() => setConfirmExit({ id: pos.id, symbol: pos.tokenSymbol })}
                              whileTap={{ scale: 0.95 }}
                            >
                              {exitMutation.isPending && exitingId === pos.id ? (
                                <motion.div
                                  className="w-3.5 h-3.5 border-2 border-accent-red/30 border-t-accent-red rounded-full inline-block"
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                />
                              ) : (
                                <LogOut className="w-3.5 h-3.5 inline" />
                              )}
                            </motion.button>
                          </td>
                        </motion.tr>
                      );
                    })}
                    {(!filteredPositions || filteredPositions.length === 0) && (
                      <tr>
                        <td colSpan={13}>
                          <EmptyState
                            icon={<Crosshair className="w-5 h-5" />}
                            title="No open positions"
                            description="The bot is watching for signals. Open positions will appear here."
                          />
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </motion.tbody>
              </table>
            </div>
          )}
        </ErrorBoundary>
      )}

      {tab === "history" && (
        <ErrorBoundary>
          {loadingHistory ? (
            <TableSkeleton rows={5} cols={8} />
          ) : errorHistory ? (
            <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
              Failed to load history — {getErrorMessage(errorHistory)}
            </div>
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bg-border">
                      <th className="table-header">Strategy</th>
                      <th className="table-header">Token</th>
                      <th className="table-header">Entry</th>
                      <th className="table-header">Exit</th>
                      <th className="table-header">P&L $</th>
                      <th className="table-header">P&L %</th>
                      <th className="table-header">Exit Reason</th>
                      <th className="table-header">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history?.data.map((pos) => {
                      const exit = exitReasonLabel(pos.exitReason);
                      return (
                        <tr key={pos.id} className="table-row">
                          <td className={`table-cell ${strategyColor(pos.strategy)} font-medium`}>
                            {strategyLabel(pos.strategy)}
                          </td>
                          <td className="table-cell font-medium">{pos.tokenSymbol}</td>
                          <td className="table-cell">{formatUsd(pos.entryPriceUsd)}</td>
                          <td className="table-cell">{formatUsd(pos.currentPriceUsd)}</td>
                          <td className={`table-cell font-medium ${pnlClass(pos.pnlUsd ?? 0)}`}>
                            {formatUsd(pos.pnlUsd ?? 0)}
                          </td>
                          <td className={`table-cell ${pnlClass(pos.pnlPercent)}`}>
                            {formatPercent(pos.pnlPercent)}
                          </td>
                          <td className="table-cell">
                            <span className={`badge ${exit.class}`}>
                              {exit.label}
                            </span>
                          </td>
                          <td className="table-cell text-text-muted">
                            {pos.closedAt ? timeAgo(pos.closedAt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {(!history?.data || history.data.length === 0) && (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState
                            icon={<History className="w-5 h-5" />}
                            title="No closed positions"
                            description="Position history will appear here once the bot closes positions."
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination page={page} totalPages={history?.totalPages ?? 1} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </ErrorBoundary>
      )}

      {tab === "skipped" && (
        <ErrorBoundary>
          {loadingSkipped ? (
            <TableSkeleton rows={3} cols={9} />
          ) : (
            <>
              {actionError && (
                <div className="text-accent-red text-xs px-2 py-1">{actionError}</div>
              )}
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bg-border">
                      <th className="table-header">Strategy</th>
                      <th className="table-header">Token</th>
                      <th className="table-header">Price</th>
                      <th className="table-header">Mcap</th>
                      <th className="table-header">Liq.</th>
                      <th className="table-header">Vol 5m</th>
                      <th className="table-header">Buy%</th>
                      <th className="table-header">Skipped</th>
                      <th className="table-header">Enter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skippedSignals?.data.map((sig) => (
                      <tr key={sig.id} className="table-row">
                        <td className={`table-cell ${strategyColor(sig.strategy)} font-medium`}>
                          {strategyLabel(sig.strategy)}
                        </td>
                        <td className="table-cell">
                          <div className="font-medium">{sig.tokenSymbol || "—"}</div>
                          <div className="text-[10px] text-text-muted truncate max-w-[80px]" title={sig.tokenAddress}>
                            {sig.tokenAddress.slice(0, 6)}...
                          </div>
                        </td>
                        <td className="table-cell text-text-muted">
                          {sig.priceAtSignal ? formatUsd(sig.priceAtSignal) : "—"}
                        </td>
                        <td className="table-cell text-text-muted">
                          {sig.tokenMcap ? `$${(sig.tokenMcap / 1000).toFixed(0)}K` : "—"}
                        </td>
                        <td className="table-cell text-text-muted">
                          {sig.tokenLiquidity ? `$${(sig.tokenLiquidity / 1000).toFixed(0)}K` : "—"}
                        </td>
                        <td className="table-cell text-text-muted">
                          {sig.tokenVolume5m ? `$${(sig.tokenVolume5m / 1000).toFixed(1)}K` : "—"}
                        </td>
                        <td className="table-cell">
                          {sig.buyPressure != null ? (
                            <span className={sig.buyPressure > 60 ? "text-accent-green" : "text-text-muted"}>
                              {(sig.buyPressure * 100).toFixed(0)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="table-cell text-text-muted text-xs">
                          {timeAgo(sig.detectedAt)}
                        </td>
                        <td className="table-cell">
                          <button
                            className="btn-ghost text-xs text-accent-green disabled:opacity-40"
                            disabled={entryMutation.isPending && enteringId === sig.id}
                            onClick={async () => {
                              setEnteringId(sig.id);
                              setActionError(null);
                              try {
                                const res = await entryMutation.mutateAsync({
                                  tokenAddress: sig.tokenAddress,
                                  tokenSymbol: sig.tokenSymbol,
                                  strategy: sig.strategy,
                                });
                                if (!res.success) setActionError(res.error ?? "entry failed");
                              } catch {
                                setActionError("entry failed");
                              } finally {
                                setEnteringId(null);
                              }
                            }}
                          >
                            <LogIn className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!skippedSignals?.data.length) && (
                      <tr>
                        <td colSpan={9}>
                          <EmptyState
                            icon={<LogIn className="w-5 h-5" />}
                            title="No skipped signals"
                            description="Signals rejected due to max positions will appear here."
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination page={skippedPage} totalPages={skippedSignals?.totalPages ?? 1} onPageChange={setSkippedPage} className="mt-4" />
            </>
          )}
        </ErrorBoundary>
      )}

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
            const res = await exitMutation.mutateAsync(confirmExit.id);
            if (!res.success) setActionError(res.error ?? "exit failed");
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
