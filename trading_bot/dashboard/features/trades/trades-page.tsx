"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import type { TradeMode, TradeSource } from "@/lib/api";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { signalsQueryOptions, tradesQueryOptions } from "@/lib/dashboard-query-options";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SummaryTile } from "@/components/ui/summary-tile";
import {
  cn,
  exportCsv,
  exitReasonLabel,
  formatSol,
  formatUsd,
  pnlClass,
  strategyColor,
  strategyLabel,
  timeAgo,
} from "@/lib/utils";
import {
  ArrowLeftRight,
  Download,
  ExternalLink,
  Radio,
  SearchSlash,
  TrendingUp,
  Waves,
} from "lucide-react";

export default function TradesPage() {
  const {
    effectiveMode,
    effectiveProfile,
    resolvedTradeSource,
    selectedStrategy,
  } = useDashboardFilters();
  const analysisScopeReady = effectiveMode != null && effectiveProfile != null;

  if (!analysisScopeReady) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-bg-border bg-bg-card/70 text-sm text-text-secondary">
        Waiting for the active analysis lane before loading fills and signals.
      </div>
    );
  }

  return (
    <TradesPageContent
      key={`${selectedStrategy ?? "all"}:${effectiveMode}:${effectiveProfile}:${resolvedTradeSource ?? "all"}`}
      mode={effectiveMode}
      profile={effectiveProfile}
      tradeSource={resolvedTradeSource}
      selectedStrategy={selectedStrategy}
    />
  );
}

function TradesPageContent({
  mode,
  profile,
  tradeSource,
  selectedStrategy,
}: {
  mode: TradeMode;
  profile: string;
  tradeSource: TradeSource | null;
  selectedStrategy: string | null;
}) {
  const [tab, setTab] = useState<"trades" | "signals">("trades");
  const [page, setPage] = useState(1);
  const [signalPage, setSignalPage] = useState(1);

  const tradesQuery = useQuery({
    ...tradesQueryOptions(page, selectedStrategy, mode, profile, tradeSource),
    enabled: tab === "trades",
  });

  const signalsQuery = useQuery({
    ...signalsQueryOptions(signalPage, selectedStrategy, mode, profile),
    enabled: tab === "signals",
  });

  const handleExportTrades = () => {
    if (!tradesQuery.data?.data.length) return;

    exportCsv(
      "trades",
      ["Time", "Strategy", "Token", "Side", "Size", "Price", "P&L", "Exit", "Fees", "Source", "Tx"],
      tradesQuery.data.data.map((trade) => [
        new Date(trade.executedAt).toISOString(),
        strategyLabel(trade.strategy),
        trade.tokenSymbol,
        trade.side,
        trade.amountSol.toFixed(4),
        trade.priceUsd.toFixed(6),
        trade.pnlUsd.toFixed(2),
        trade.exitReason ?? "",
        (trade.gasFee + trade.jitoTip).toFixed(4),
        trade.tradeSource ?? "AUTO",
        trade.txSignature,
      ]),
    );
  };

  const focusLabel = selectedStrategy ? strategyLabel(selectedStrategy) : "All strategies";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Execution Tape</div>
          <div className="mt-1 text-sm text-text-secondary">
            {mode === "LIVE" ? "Live" : "Simulation"} analysis · {profile} · {focusLabel}
            {tab === "trades"
              ? tradeSource ? ` · ${tradeSource.toLowerCase()} only` : ""
              : tradeSource ? " · source filter applies to fills only" : ""}
            {tab === "trades"
              ? " · fills, exits, and fee drag"
              : " · strategy pass / reject flow"}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs
            tabs={[
              { id: "trades", label: "Trades", icon: <ArrowLeftRight className="h-3.5 w-3.5" /> },
              { id: "signals", label: "Signals", icon: <Radio className="h-3.5 w-3.5" /> },
            ]}
            active={tab}
            onChange={(nextTab) => {
              setTab(nextTab);
              setPage(1);
              setSignalPage(1);
            }}
          />

          {tab === "trades" && tradesQuery.data?.data.length ? (
            <button onClick={handleExportTrades} className="btn-ghost flex items-center gap-1 text-xs">
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          ) : null}
        </div>
      </div>

      {tab === "signals" && tradeSource ? (
        <div className="rounded-xl border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-xs text-accent-yellow">
          Signal rows do not carry trade-source metadata. The source filter still applies to executed fills, not this signal tape.
        </div>
      ) : null}

      {tab === "trades" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryTile
              label="Trades"
              value={String(tradesQuery.data?.summary.totalTrades ?? 0)}
              sub={`${focusLabel} · page ${page}`}
              icon={<ArrowLeftRight className="h-3.5 w-3.5 text-accent-blue" />}
            />
            <SummaryTile
              label="Exits"
              value={String(tradesQuery.data?.summary.totalExits ?? 0)}
              sub={`${tradesQuery.data?.summary.wins ?? 0}W / ${tradesQuery.data?.summary.losses ?? 0}L`}
              icon={<TrendingUp className="h-3.5 w-3.5 text-accent-green" />}
              tone="positive"
            />
            <SummaryTile
              label="Win Rate"
              value={formatWinRate(tradesQuery.data?.summary.wins ?? 0, tradesQuery.data?.summary.totalExits ?? 0)}
              sub="Filtered result set"
              valueClass={pnlClass((tradesQuery.data?.summary.wins ?? 0) - (tradesQuery.data?.summary.losses ?? 0))}
            />
            <SummaryTile
              label="Net P&L"
              value={formatUsd(tradesQuery.data?.summary.netPnlUsd ?? 0)}
              sub={`Fees ${formatSol(tradesQuery.data?.summary.totalFeesSol ?? 0)}`}
              valueClass={pnlClass(tradesQuery.data?.summary.netPnlUsd ?? 0)}
              tone={(tradesQuery.data?.summary.netPnlUsd ?? 0) < 0 ? "danger" : "default"}
            />
            <SummaryTile
              label="Last Trade"
              value={tradesQuery.data?.summary.lastExecutedAt ? timeAgo(tradesQuery.data.summary.lastExecutedAt) : "—"}
              sub={`${profile} · most recent execution`}
              icon={<Waves className="h-3.5 w-3.5 text-accent-cyan" />}
            />
          </div>

          <ErrorBoundary>
            {tradesQuery.isLoading ? (
              <TableSkeleton rows={8} cols={11} />
            ) : (
              <>
                <div className="card overflow-x-auto">
                  <table className="table-sticky-header w-full">
                    <thead>
                      <tr className="border-b border-bg-border">
                        <th className="table-header">Time</th>
                        <th className="table-header">Strategy</th>
                        <th className="table-header">Token</th>
                        <th className="table-header">Side</th>
                        <th className="table-header">Size</th>
                        <th className="table-header">Price</th>
                        <th className="table-header">P&amp;L</th>
                        <th className="table-header">Exit</th>
                        <th className="table-header">Fees</th>
                        <th className="table-header">Source</th>
                        <th className="table-header">Tx</th>
                      </tr>
                    </thead>
                    <motion.tbody layout>
                      <AnimatePresence mode="popLayout">
                        {tradesQuery.data?.data.map((trade, index) => {
                          const isDryRun = trade.txSignature?.startsWith("dryrun_");
                          const exit = exitReasonLabel(trade.exitReason);
                          return (
                            <motion.tr
                              key={trade.id}
                              className="table-row"
                              layout
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8 }}
                              transition={{ duration: 0.18, delay: index * 0.015 }}
                            >
                              <td className="table-cell text-xs text-text-muted">{timeAgo(trade.executedAt)}</td>
                              <td className={cn("table-cell font-medium", strategyColor(trade.strategy))}>
                                {strategyLabel(trade.strategy)}
                              </td>
                              <td className="table-cell">
                                <div className="font-medium text-text-primary">{trade.tokenSymbol}</div>
                                <div className="text-[10px] text-text-muted">
                                  {trade.regime ?? "—"} · {trade.configProfile ?? profile}
                                </div>
                              </td>
                              <td className="table-cell">
                                <span className={trade.side === "BUY" ? "badge badge-green" : "badge badge-red"}>
                                  {trade.side}
                                </span>
                              </td>
                              <td className="table-cell tabular-nums">{formatSol(trade.amountSol)}</td>
                              <td className="table-cell tabular-nums">{formatUsd(trade.priceUsd)}</td>
                              <td className={cn("table-cell font-medium tabular-nums", pnlClass(trade.pnlUsd))}>
                                {trade.side === "SELL" ? formatUsd(trade.pnlUsd) : "—"}
                              </td>
                              <td className="table-cell">
                                {trade.exitReason ? <span className={`badge ${exit.class}`}>{exit.label}</span> : "—"}
                              </td>
                              <td className="table-cell text-xs text-text-muted">{formatSol(trade.gasFee + trade.jitoTip)}</td>
                              <td className="table-cell">
                                <span
                                  className={cn(
                                    "badge text-[10px]",
                                    trade.tradeSource === "MANUAL" ? "badge-yellow" : "badge-blue",
                                  )}
                                >
                                  {trade.tradeSource ?? "AUTO"}
                                </span>
                                <div className="mt-1 text-[10px] text-text-muted">{trade.mode ?? mode}</div>
                              </td>
                              <td className="table-cell">
                                {isDryRun ? (
                                  <span className="sim-badge" title="Simulated trade (dry run)">
                                    SIM
                                  </span>
                                ) : (
                                  <a
                                    href={`https://solscan.io/tx/${trade.txSignature}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent-blue transition-colors hover:text-accent-blue/80"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </td>
                            </motion.tr>
                          );
                        })}

                        {!tradesQuery.data?.data.length ? (
                          <tr>
                            <td colSpan={11}>
                              <EmptyState
                                icon={<ArrowLeftRight className="h-5 w-5" />}
                                title="No trades recorded"
                                description="Executed fills will appear here once the bot opens and closes positions."
                              />
                            </td>
                          </tr>
                        ) : null}
                      </AnimatePresence>
                    </motion.tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  totalPages={tradesQuery.data?.totalPages ?? 1}
                  onPageChange={setPage}
                  className="mt-4"
                />
              </>
            )}
          </ErrorBoundary>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryTile
              label="Signals"
              value={String(signalsQuery.data?.summary.totalSignals ?? 0)}
              sub={`${focusLabel} · page ${signalPage}`}
              icon={<Radio className="h-3.5 w-3.5 text-accent-purple" />}
            />
            <SummaryTile
              label="Passed"
              value={String(signalsQuery.data?.summary.passed ?? 0)}
              sub={`${((signalsQuery.data?.summary.passRate ?? 0) * 100).toFixed(0)}% pass rate`}
              valueClass="pnl-positive"
              tone="positive"
            />
            <SummaryTile
              label="Rejected"
              value={String(signalsQuery.data?.summary.rejected ?? 0)}
              sub="Filtered result set"
              tone={(signalsQuery.data?.summary.rejected ?? 0) > (signalsQuery.data?.summary.passed ?? 0) ? "warning" : "default"}
            />
            <SummaryTile
              label="Top Reject"
              value={signalsQuery.data?.summary.topRejectReason?.replace(/_/g, " ") ?? "—"}
              sub={signalsQuery.data?.summary.topRejectCount ? `×${signalsQuery.data.summary.topRejectCount}` : "No reject pattern"}
              icon={<SearchSlash className="h-3.5 w-3.5 text-accent-yellow" />}
              tone="warning"
            />
            <SummaryTile
              label="Last Signal"
              value={signalsQuery.data?.summary.lastDetectedAt ? timeAgo(signalsQuery.data.summary.lastDetectedAt) : "—"}
              sub="Latest scan event"
            />
          </div>

          <ErrorBoundary>
            {signalsQuery.isLoading ? (
              <TableSkeleton rows={8} cols={6} />
            ) : (
              <>
                <div className="card overflow-x-auto">
                  <table className="table-sticky-header w-full">
                    <thead>
                      <tr className="border-b border-bg-border">
                        <th className="table-header">Time</th>
                        <th className="table-header">Strategy</th>
                        <th className="table-header">Token</th>
                        <th className="table-header">Signal</th>
                        <th className="table-header">Result</th>
                        <th className="table-header">Reason</th>
                      </tr>
                    </thead>
                    <motion.tbody layout>
                      <AnimatePresence mode="popLayout">
                        {signalsQuery.data?.data.map((signal, index) => (
                          <motion.tr
                            key={signal.id}
                            className="table-row"
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8 }}
                            transition={{ duration: 0.18, delay: index * 0.015 }}
                          >
                            <td className="table-cell text-xs text-text-muted">{timeAgo(signal.detectedAt)}</td>
                            <td className={cn("table-cell font-medium", strategyColor(signal.strategy))}>
                              {strategyLabel(signal.strategy)}
                            </td>
                            <td className="table-cell font-medium">
                              {signal.tokenSymbol || signal.tokenAddress.slice(0, 8)}
                            </td>
                            <td className="table-cell text-text-muted">{signal.signalType}</td>
                            <td className="table-cell">
                              <span className={signal.passed ? "badge badge-green" : "badge badge-red"}>
                                {signal.passed ? "PASS" : "REJECT"}
                              </span>
                            </td>
                            <td className="table-cell max-w-[260px] text-xs text-text-muted">
                              <div className="truncate" title={signal.rejectReason ?? ""}>
                                {signal.rejectReason ?? "—"}
                              </div>
                              {!signal.passed ? (
                                <div className="truncate text-[10px]" title={summarizeFilterResults(signal.filterResults)}>
                                  {summarizeFilterResults(signal.filterResults) || "No filter evidence attached"}
                                </div>
                              ) : (
                                <div className="truncate text-[10px]" title={signal.source}>
                                  {signal.source}
                                </div>
                              )}
                            </td>
                          </motion.tr>
                        ))}

                        {!signalsQuery.data?.data.length ? (
                          <tr>
                            <td colSpan={6}>
                              <EmptyState
                                icon={<Radio className="h-5 w-5" />}
                                title="No signals recorded"
                                description="Signal decisions will appear here as the bot scans and filters opportunities."
                              />
                            </td>
                          </tr>
                        ) : null}
                      </AnimatePresence>
                    </motion.tbody>
                  </table>
                </div>

                <Pagination
                  page={signalPage}
                  totalPages={signalsQuery.data?.totalPages ?? 1}
                  onPageChange={setSignalPage}
                  className="mt-4"
                />
              </>
            )}
          </ErrorBoundary>
        </>
      )}
    </div>
  );
}

function formatWinRate(wins: number, exits: number) {
  if (exits === 0) return "—";
  return `${((wins / exits) * 100).toFixed(0)}%`;
}

function summarizeFilterResults(filterResults: Record<string, unknown>) {
  return Object.entries(filterResults)
    .filter(([, value]) =>
      typeof value === "number"
      || typeof value === "boolean"
      || typeof value === "string",
    )
    .slice(0, 3)
    .map(([key, value]) => `${humanizeFilterKey(key)} ${formatFilterValue(value)}`)
    .join(" · ");
}

function humanizeFilterKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFilterValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "pass" : "fail";
  }

  return String(value);
}
