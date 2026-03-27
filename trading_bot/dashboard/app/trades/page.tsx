"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { fetchTrades, fetchSignalsPaginated } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { formatUsd, formatSol, pnlClass, strategyLabel, strategyColor, timeAgo, exitReasonLabel, exportCsv } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeftRight, Radio, ExternalLink, Download } from "lucide-react";

export default function TradesPage() {
  const [tab, setTab] = useState<"trades" | "signals">("trades");
  const [page, setPage] = useState(1);
  const [signalPage, setSignalPage] = useState(1);
  const { mode, selectedStrategy } = useDashboardStore();

  useEffect(() => {
    setPage(1);
    setSignalPage(1);
  }, [selectedStrategy]);

  const { data: trades, isLoading: loadingTrades } = useQuery({
    queryKey: ["trades", page, selectedStrategy, mode],
    queryFn: () => fetchTrades(page, selectedStrategy ?? undefined, mode),
    enabled: tab === "trades",
  });

  const { data: signals, isLoading: loadingSignals } = useQuery({
    queryKey: ["signals-paginated", signalPage, selectedStrategy],
    queryFn: () => fetchSignalsPaginated(signalPage, selectedStrategy ?? undefined),
    enabled: tab === "signals",
  });

  const handleExportTrades = () => {
    if (!trades?.data) return;
    exportCsv("trades",
      ["Time", "Strategy", "Token", "Side", "Size", "Price", "P&L", "Exit", "Fees", "Tx"],
      trades.data.map((t) => [
        new Date(t.executedAt).toISOString(), strategyLabel(t.strategy),
        t.tokenSymbol, t.side, t.amountSol.toFixed(4),
        t.priceUsd.toFixed(6), t.pnlUsd.toFixed(2),
        t.exitReason ?? "", (t.gasFee + t.jitoTip).toFixed(4), t.txSignature,
      ])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs
          tabs={[
            { id: "trades", label: "Trades", icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
            { id: "signals", label: "Signals", icon: <Radio className="w-3.5 h-3.5" /> },
          ]}
          active={tab}
          onChange={(id) => { setTab(id); setPage(1); setSignalPage(1); }}
        />

        {tab === "trades" && trades?.data && trades.data.length > 0 && (
          <button onClick={handleExportTrades} className="btn-ghost text-xs flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}
      </div>

      {tab === "trades" && trades?.data && trades.data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const sells = trades.data.filter((t) => t.side === "SELL");
            const wins  = sells.filter((t) => t.pnlUsd > 0).length;
            const losses = sells.filter((t) => t.pnlUsd <= 0).length;
            const netPnl = sells.reduce((s, t) => s + t.pnlUsd, 0);
            const totalFees = trades.data.reduce((s, t) => s + t.gasFee + t.jitoTip, 0);
            return (
              <>
                <SummaryTile label="Exits" value={String(sells.length)} sub={`of ${trades.data.length} trades`} />
                <SummaryTile label="W / L" value={`${wins} / ${losses}`} valueClass={wins > losses ? "pnl-positive" : wins < losses ? "pnl-negative" : ""} sub={sells.length > 0 ? `${((wins / sells.length) * 100).toFixed(0)}% win rate` : ""} />
                <SummaryTile label="Net P&L" value={formatUsd(netPnl)} valueClass={pnlClass(netPnl)} sub="this page" />
                <SummaryTile label="Fees" value={formatSol(totalFees)} sub="gas + jito" />
              </>
            );
          })()}
        </div>
      )}

      {tab === "trades" && (
        <ErrorBoundary>
          {loadingTrades ? (
            <TableSkeleton rows={8} cols={10} />
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bg-border">
                      <th className="table-header">Time</th>
                      <th className="table-header">Strategy</th>
                      <th className="table-header">Token</th>
                      <th className="table-header">Side</th>
                      <th className="table-header">Size</th>
                      <th className="table-header">Price</th>
                      <th className="table-header">P&L</th>
                      <th className="table-header">Exit</th>
                      <th className="table-header">Fees</th>
                      <th className="table-header">Tx</th>
                    </tr>
                  </thead>
                  <motion.tbody layout>
                    <AnimatePresence mode="popLayout">
                      {trades?.data.map((t, idx) => {
                        const isDryRun = t.txSignature?.startsWith("dryrun_");
                        const exit = exitReasonLabel(t.exitReason);
                        return (
                          <motion.tr key={t.id} className="table-row" layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2, delay: idx * 0.02 }}>
                          <td className="table-cell text-text-muted text-xs">{timeAgo(t.executedAt)}</td>
                          <td className={`table-cell ${strategyColor(t.strategy)}`}>
                            {strategyLabel(t.strategy)}
                          </td>
                          <td className="table-cell font-medium">{t.tokenSymbol}</td>
                          <td className="table-cell">
                            <span className={t.side === "BUY" ? "badge badge-green" : "badge badge-red"}>
                              {t.side}
                            </span>
                          </td>
                          <td className="table-cell">{formatSol(t.amountSol)}</td>
                          <td className="table-cell">{formatUsd(t.priceUsd)}</td>
                          <td className={`table-cell font-medium ${pnlClass(t.pnlUsd)}`}>
                            {t.side === "SELL" ? formatUsd(t.pnlUsd) : "—"}
                          </td>
                          <td className="table-cell">
                            {t.exitReason ? (
                              <span className={`badge ${exit.class}`}>{exit.label}</span>
                            ) : "—"}
                          </td>
                          <td className="table-cell text-text-muted text-xs">
                            {formatSol(t.gasFee + t.jitoTip)}
                          </td>
                          <td className="table-cell">
                            {isDryRun ? (
                              <span className="sim-badge" title="Simulated trade (dry run)">SIM</span>
                            ) : (
                              <a
                                href={`https://solscan.io/tx/${t.txSignature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent-blue hover:text-accent-blue/80"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </td>
                          </motion.tr>
                        );
                      })}
                      {(!trades?.data || trades.data.length === 0) && (
                        <tr>
                          <td colSpan={10}>
                            <EmptyState
                              icon={<ArrowLeftRight className="w-5 h-5" />}
                              title="No trades recorded"
                              description="Trades will appear here after the bot executes its first position."
                            />
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>

              <Pagination page={page} totalPages={trades?.totalPages ?? 1} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </ErrorBoundary>
      )}

      {tab === "signals" && signals?.data && signals.data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            const passed = signals.data.filter((s) => s.passed).length;
            const rejected = signals.data.filter((s) => !s.passed).length;
            const passRate = signals.data.length > 0 ? (passed / signals.data.length) * 100 : 0;
            const rejectReasons = signals.data
              .filter((s) => !s.passed && s.rejectReason)
              .reduce<Record<string, number>>((acc, s) => {
                acc[s.rejectReason!] = (acc[s.rejectReason!] ?? 0) + 1;
                return acc;
              }, {});
            const topReason = Object.entries(rejectReasons).sort((a, b) => b[1] - a[1])[0];
            return (
              <>
                <SummaryTile label="Signals" value={String(signals.data.length)} sub={`page ${signalPage}`} />
                <SummaryTile label="Passed" value={String(passed)} valueClass="pnl-positive" sub={`${passRate.toFixed(0)}% pass rate`} />
                <SummaryTile label="Rejected" value={String(rejected)} valueClass={rejected > passed ? "pnl-negative" : ""} sub="" />
                <SummaryTile label="Top Reject" value={topReason ? topReason[0].replace(/_/g, " ") : "—"} sub={topReason ? `×${topReason[1]}` : ""} />
              </>
            );
          })()}
        </div>
      )}

      {tab === "signals" && (
        <ErrorBoundary>
          {loadingSignals ? (
            <TableSkeleton rows={8} cols={6} />
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-bg-border">
                      <th className="table-header">Time</th>
                      <th className="table-header">Strategy</th>
                      <th className="table-header">Token</th>
                      <th className="table-header">Type</th>
                      <th className="table-header">Result</th>
                      <th className="table-header">Reason</th>
                    </tr>
                  </thead>
                  <motion.tbody layout>
                    <AnimatePresence mode="popLayout">
                      {signals?.data?.map((s, idx) => (
                        <motion.tr key={s.id} className="table-row" layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2, delay: idx * 0.02 }}>
                          <td className="table-cell text-text-muted text-xs">{timeAgo(s.detectedAt)}</td>
                          <td className={`table-cell ${strategyColor(s.strategy)}`}>
                            {strategyLabel(s.strategy)}
                          </td>
                          <td className="table-cell font-medium">{s.tokenSymbol || s.tokenAddress.slice(0, 8)}</td>
                          <td className="table-cell text-text-muted">{s.signalType}</td>
                          <td className="table-cell">
                            <span className={s.passed ? "badge badge-green" : "badge badge-red"}>
                              {s.passed ? "PASS" : "REJECT"}
                            </span>
                          </td>
                          <td className="table-cell text-text-muted text-xs max-w-[200px] truncate" title={s.rejectReason ?? ""}>
                            {s.rejectReason ?? "—"}
                          </td>
                        </motion.tr>
                      ))}
                      {(!signals?.data || signals.data.length === 0) && (
                        <tr>
                          <td colSpan={6}>
                            <EmptyState
                              icon={<Radio className="w-5 h-5" />}
                              title="No signals recorded"
                              description="Strategy signals will appear here as the bot scans the market."
                            />
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </motion.tbody>
                </table>
              </div>

              <Pagination page={signalPage} totalPages={signals?.totalPages ?? 1} onPageChange={setSignalPage} className="mt-4" />
            </>
          )}
        </ErrorBoundary>
      )}
    </div>
  );
}

function SummaryTile({ label, value, valueClass = "", sub }: {
  label: string;
  value: string;
  valueClass?: string;
  sub: string;
}) {
  return (
    <div className="card py-3">
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-base font-bold tabular-nums ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
