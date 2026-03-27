"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { fetchStrategyAnalytics, fetchRegimeHistory, fetchWouldHaveWon, fetchPnlDistribution, fetchDailyStats, fetchWalletActivity, fetchGraduationStats } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { formatUsd, formatSol, pnlClass, strategyLabel, strategyColor, regimeBadge, timeAgo, dateRangeToDays, exportCsv } from "@/lib/utils";
import { motion } from "motion/react";
import { chartColors } from "@/lib/chart-colors";
import { CapitalCurveChart } from "@/components/charts/capital-curve";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Shield, AlertTriangle, Download, Eye, Wallet, GraduationCap } from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

const DATE_RANGES = ["7d", "14d", "30d", "60d", "90d"] as const;

export function AnalyticsPageClient() {
  const { mode } = useDashboardStore();
  const [dateRange, setDateRange] = useQueryState(
    "dateRange",
    parseAsStringLiteral(DATE_RANGES).withDefault("30d"),
  );
  const days = dateRangeToDays(dateRange);

  const { data: strategies, isLoading: loadingStrategies } = useQuery({
    queryKey: ["strategy-analytics", mode, days],
    queryFn: () => fetchStrategyAnalytics(days, mode),
    refetchInterval: (query) => query.state.status === "error" ? 30_000 : 60_000,
  });

  const { data: regimeHistory } = useQuery({
    queryKey: ["regime-history"],
    queryFn: fetchRegimeHistory,
    refetchInterval: 60000,
  });

  const { data: wouldHaveWon } = useQuery({
    queryKey: ["would-have-won", days],
    queryFn: () => fetchWouldHaveWon(days),
    refetchInterval: 60000,
  });

  const { data: pnlDist } = useQuery({
    queryKey: ["pnl-distribution", days, mode],
    queryFn: () => fetchPnlDistribution(days, mode),
    refetchInterval: 60000,
  });

  const { data: dailyStats } = useQuery({
    queryKey: ["daily-stats-export", mode, days],
    queryFn: () => fetchDailyStats(days, mode),
  });

  const { data: walletActivity } = useQuery({
    queryKey: ["wallet-activity"],
    queryFn: () => fetchWalletActivity(30),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: graduationStats } = useQuery({
    queryKey: ["graduation-stats", days],
    queryFn: () => fetchGraduationStats(days),
    staleTime: 60_000,
  });

  const handleExportStats = () => {
    if (!dailyStats) return;
    const filtered = dailyStats.filter((s) => s.strategy === null);
    exportCsv(
      "daily-stats",
      ["Date", "Trades", "Won", "Lost", "Win Rate", "Gross P&L", "Net P&L", "Capital", "Regime"],
      filtered.map((s) => [
        new Date(s.date).toISOString().slice(0, 10),
        s.tradesTotal,
        s.tradesWon,
        s.tradesLost,
        (s.winRate * 100).toFixed(1),
        s.grossPnlUsd.toFixed(2),
        s.netPnlUsd.toFixed(2),
        s.capitalEnd.toFixed(2),
        s.regime,
      ]),
    );
  };

  const scatterData = useMemo(
    () => pnlDist?.map((p, i) => ({ ...p, index: i + 1 })) ?? [],
    [pnlDist],
  );

  const container = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } } };

  return (
    <motion.div className="space-y-6" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {DATE_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={`date-range-btn ${dateRange === r ? "date-range-btn-active" : "date-range-btn-inactive"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <button onClick={handleExportStats} className="btn-ghost text-xs flex items-center gap-1">
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </motion.div>

      <motion.div variants={item}>
        <ErrorBoundary>
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-accent-green" />
              <span className="stat-label">Capital Curve</span>
            </div>
            <CapitalCurveChart />
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={item}>
        <ErrorBoundary>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-accent-purple" />
            <span className="stat-label">Strategy Performance ({dateRange})</span>
          </div>

          {strategies && strategies.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {(() => {
                const totals = strategies.reduce(
                  (acc, s) => ({
                    exits: acc.exits + s.totalExits,
                    wins: acc.wins + s.wins,
                    losses: acc.losses + s.losses,
                    pnl: acc.pnl + s.totalPnlUsd,
                    fees: acc.fees + s.totalFeesSol,
                  }),
                  { exits: 0, wins: 0, losses: 0, pnl: 0, fees: 0 },
                );
                const wr = totals.exits > 0 ? (totals.wins / totals.exits) * 100 : 0;
                const avgWin = mean(strategies.map((x) => x.avgWinUsd).filter((x) => x > 0));
                const avgLoss = mean(strategies.map((x) => x.avgLossUsd).filter((x) => x > 0));
                const expectancy = avgWin * (wr / 100) - avgLoss * (1 - wr / 100);
                return (
                  <>
                    <SummaryTile label="Total Exits" value={String(totals.exits)} sub={`${totals.wins}W / ${totals.losses}L`} />
                    <SummaryTile label="Overall Win Rate" value={`${wr.toFixed(0)}%`} valueClass={wr >= 50 ? "pnl-positive" : wr >= 40 ? "text-accent-yellow" : "pnl-negative"} sub="" />
                    <SummaryTile label="Net P&L" value={formatUsd(totals.pnl)} valueClass={pnlClass(totals.pnl)} sub={`fees: ${formatSol(totals.fees)}`} />
                    <SummaryTile label="Expectancy" value={formatUsd(expectancy)} valueClass={pnlClass(expectancy)} sub="per trade avg" />
                  </>
                );
              })()}
            </div>
          )}

          {loadingStrategies ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {strategies?.map((s) => {
                const expectancy = s.totalExits > 0
                  ? s.avgWinUsd * s.winRate - s.avgLossUsd * (1 - s.winRate)
                  : 0;
                return (
                  <div key={s.strategy} className={`card card-hover border-l-2 ${
                    s.strategy === "S1_COPY" ? "border-l-accent-blue" :
                    s.strategy === "S2_GRADUATION" ? "border-l-accent-purple" : "border-l-accent-cyan"
                  }`}>
                    <div className={`text-lg font-bold mb-3 ${strategyColor(s.strategy)}`}>
                      {strategyLabel(s.strategy)}
                    </div>
                    <div className="space-y-2 text-sm">
                      <Row label="Exits" value={String(s.totalExits)} />
                      <Row label="W / L" value={`${s.wins} / ${s.losses}`} />
                      <Row
                        label="Win Rate"
                        value={`${(s.winRate * 100).toFixed(0)}%`}
                        valueClass={s.winRate >= 0.5 ? "pnl-positive" : s.winRate >= 0.4 ? "text-accent-yellow" : "pnl-negative"}
                      />
                      <Row label="Net P&L" value={formatUsd(s.totalPnlUsd)} valueClass={pnlClass(s.totalPnlUsd)} />
                      <Row label="Avg Win" value={formatUsd(s.avgWinUsd)} valueClass="pnl-positive" />
                      <Row label="Avg Loss" value={formatUsd(s.avgLossUsd)} valueClass="pnl-negative" />
                      {s.avgWinUsd > 0 && s.avgLossUsd > 0 && (
                        <Row label="R:R" value={`${(s.avgWinUsd / s.avgLossUsd).toFixed(2)}:1`} valueClass="text-accent-cyan" />
                      )}
                      <Row label="Expectancy" value={formatUsd(expectancy)} valueClass={pnlClass(expectancy)} />
                      <Row label="Fees" value={formatSol(s.totalFeesSol)} />
                    </div>
                  </div>
                );
              })}
              {(!strategies || strategies.length === 0) && (
                <div className="col-span-3 card text-center text-text-muted py-8">
                  No analytics data yet
                </div>
              )}
            </div>
          )}
        </ErrorBoundary>
      </motion.div>

      {pnlDist && pnlDist.length > 0 && (
        <motion.div variants={item}>
          <ErrorBoundary>
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-accent-cyan" />
                <span className="stat-label">P&L Distribution ({pnlDist.length} trades)</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="index"
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={{ stroke: "#242433" }}
                    tickLine={false}
                    label={{ value: "Trade #", position: "bottom", fill: "#71717a", fontSize: 10 }}
                  />
                  <YAxis
                    dataKey="pnlUsd"
                    tick={{ fill: "#71717a", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    wrapperStyle={{ background: "#16161f", border: "1px solid #242433", borderRadius: "8px" }}
                    itemStyle={{ color: "#e4e4e7", fontSize: 12 }}
                    labelStyle={{ color: "#e4e4e7", fontSize: 12 }}
                    formatter={(value) => [`$${(Number(value) || 0).toFixed(2)}`, "P&L"]}
                  />
                  <ReferenceLine y={0} stroke="#242433" />
                  <Scatter data={scatterData} isAnimationActive={false}>
                    {scatterData.map((p, i) => (
                      <Cell key={i} fill={p.pnlUsd >= 0 ? chartColors.win : chartColors.loss} fillOpacity={0.7} r={3} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </ErrorBoundary>
        </motion.div>
      )}

      {wouldHaveWon && wouldHaveWon.total > 0 && (
        <motion.div variants={item}>
          <ErrorBoundary>
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="w-4 h-4 text-accent-yellow" />
                <span className="stat-label">Missed Opportunities ({dateRange})</span>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="stat-value text-lg">{wouldHaveWon.total}</div>
                  <div className="text-xs text-text-muted">Rejected Signals</div>
                </div>
                <div className="text-center">
                  <div className="stat-value text-lg text-accent-green">{wouldHaveWon.wouldHaveWon}</div>
                  <div className="text-xs text-text-muted">Would Have Won</div>
                </div>
                <div className="text-center">
                  <div className={`stat-value text-lg ${wouldHaveWon.wouldHaveWonRate > 0.4 ? "text-accent-red" : "text-accent-green"}`}>
                    {(wouldHaveWon.wouldHaveWonRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-text-muted">
                    {wouldHaveWon.wouldHaveWonRate > 0.4 ? "Filters too tight!" : "Filters OK"}
                  </div>
                </div>
              </div>
              {wouldHaveWon.wouldHaveWonRate > 0.4 && (
                <div className="flex items-center gap-2 px-3 py-2 bg-accent-yellow/10 rounded-lg text-xs text-accent-yellow">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>Over 40% of rejected signals would have been profitable. Consider loosening filter thresholds.</span>
                </div>
              )}
              {wouldHaveWon.signals.length > 0 && (
                <div className="mt-4 max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-bg-border">
                        <th className="table-header">Strategy</th>
                        <th className="table-header">Token</th>
                        <th className="table-header">Entry</th>
                        <th className="table-header">+5m</th>
                        <th className="table-header">+15m</th>
                        <th className="table-header">+1h</th>
                        <th className="table-header">Reason</th>
                        <th className="table-header">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wouldHaveWon.signals.slice(0, 20).map((s) => {
                        const entry = s.priceAtSignal ?? 0;
                        const pct = (p: number | null) =>
                          p != null && entry > 0
                            ? `${((p - entry) / entry * 100) >= 0 ? "+" : ""}${((p - entry) / entry * 100).toFixed(0)}%`
                            : "—";
                        return (
                          <tr key={s.id} className="table-row">
                            <td className={`table-cell text-xs ${strategyColor(s.strategy)}`}>{strategyLabel(s.strategy)}</td>
                            <td className="table-cell font-medium">{s.tokenSymbol || s.tokenAddress.slice(0, 8)}</td>
                            <td className="table-cell text-text-muted text-xs tabular-nums">{entry > 0 ? formatUsd(entry) : "—"}</td>
                            <td className={`table-cell text-xs tabular-nums ${s.priceAfter5m != null && entry > 0 ? pnlClass((s.priceAfter5m - entry) / entry * 100) : ""}`}>
                              {pct(s.priceAfter5m)}
                            </td>
                            <td className={`table-cell text-xs tabular-nums ${s.priceAfter15m != null && entry > 0 ? pnlClass((s.priceAfter15m - entry) / entry * 100) : ""}`}>
                              {pct(s.priceAfter15m)}
                            </td>
                            <td className={`table-cell text-xs tabular-nums ${s.priceAfter1h != null && entry > 0 ? pnlClass((s.priceAfter1h - entry) / entry * 100) : ""}`}>
                              {pct(s.priceAfter1h)}
                            </td>
                            <td className="table-cell text-text-muted text-xs truncate max-w-[120px]" title={s.rejectReason ?? ""}>{s.rejectReason ?? "—"}</td>
                            <td className="table-cell">
                              <span className={s.wouldHaveWon ? "badge badge-green" : "badge badge-red"}>
                                {s.wouldHaveWon ? "WIN" : "LOSS"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </ErrorBoundary>
        </motion.div>
      )}

      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {graduationStats && (graduationStats.totalEvents > 0) && (
          <ErrorBoundary>
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-4 h-4 text-accent-purple" />
                <span className="stat-label">Graduation Events ({dateRange})</span>
              </div>
              <div className="space-y-1 text-sm mb-3">
                <Row label="Total Events" value={String(graduationStats.totalEvents)} />
              </div>
              {Object.entries(graduationStats.byPlatform).map(([platform, stats]) => (
                <div key={platform} className="space-y-1 pb-2 mb-2 border-b border-bg-border last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-accent-purple">{platform}</span>
                    <span className="text-text-muted">{stats.total} events</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-text-muted">Traded: </span><span className="text-accent-green">{stats.traded}</span></div>
                    <div><span className="text-text-muted">Rugged: </span><span className="text-accent-red">{stats.rugged}</span></div>
                    <div><span className="text-text-muted">Missed: </span>{stats.total - stats.traded - stats.rugged}</div>
                  </div>
                </div>
              ))}
            </div>
          </ErrorBoundary>
        )}

        {walletActivity && walletActivity.length > 0 && (
          <ErrorBoundary>
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Wallet className="w-4 h-4 text-accent-blue" />
                <span className="stat-label">Copy-Trade Wallet Activity</span>
              </div>
              <div className="max-h-56 overflow-y-auto space-y-2">
                {walletActivity.slice(0, 15).map((w) => {
                  const entry = w.priceUsd ?? 0;
                  const peak = w.peakPriceUsd ?? 0;
                  const peakPct = entry > 0 && peak > 0 ? ((peak - entry) / entry * 100) : null;
                  return (
                    <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-bg-border/50 last:border-0">
                      <div className="min-w-0">
                        <div className="text-xs font-medium flex items-center gap-1.5">
                          <span className={w.action === "BUY" ? "badge badge-green text-[9px]" : "badge badge-red text-[9px]"}>{w.action}</span>
                          <span>{w.tokenSymbol || w.tokenAddress.slice(0, 8)}</span>
                        </div>
                        <div className="text-[10px] text-text-muted truncate">{w.walletAddress.slice(0, 8)}…{w.walletAddress.slice(-4)}</div>
                      </div>
                      <div className="text-right flex-shrink-0 text-xs">
                        {peakPct !== null && (
                          <div className={`font-medium tabular-nums ${peakPct >= 0 ? "pnl-positive" : "pnl-negative"}`}>
                            peak {peakPct >= 0 ? "+" : ""}{peakPct.toFixed(0)}%
                          </div>
                        )}
                        <div className="text-text-muted">{timeAgo(w.detectedAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ErrorBoundary>
        )}
      </motion.div>

      <motion.div variants={item}>
        <ErrorBoundary>
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-accent-yellow" />
              <span className="stat-label">Regime History (24h)</span>
            </div>
            {regimeHistory && regimeHistory.length > 0 ? (
              <div className="space-y-2">
                <div className="flex h-8 rounded-lg overflow-hidden">
                  {regimeHistory.slice(0, 48).map((snap) => {
                    const badge = regimeBadge(snap.regime);
                    const width = 100 / Math.min(regimeHistory.length, 48);
                    return (
                      <div
                        key={snap.id}
                        title={`${snap.regime} | SOL: ${formatUsd(snap.solPrice)} | ${new Date(snap.snappedAt).toLocaleTimeString()}`}
                        className={`${badge.class} flex items-center justify-center text-[8px] font-bold cursor-default border-r border-bg-primary/20 last:border-0`}
                        style={{ width: `${width}%` }}
                      >
                        {width > 3 ? snap.regime[0] : ""}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>24h ago</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-green" /> HOT</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-blue" /> NORMAL</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-yellow" /> CHOPPY</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-red" /> RISK OFF</span>
                  </div>
                  <span>Now</span>
                </div>
              </div>
            ) : (
              <div className="text-text-muted text-sm">No regime snapshots yet</div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className={`font-medium tabular-nums ${valueClass}`}>{value}</span>
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
