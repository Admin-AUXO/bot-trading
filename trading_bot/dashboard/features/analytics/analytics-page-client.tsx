"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { motion } from "motion/react";
import {
  dailyStatsQueryOptions,
  executionQualityQueryOptions,
  graduationStatsQueryOptions,
  pnlDistributionQueryOptions,
  regimeHistoryQueryOptions,
  strategyAnalyticsQueryOptions,
  walletActivityQueryOptions,
  wouldHaveWonQueryOptions,
} from "@/lib/dashboard-query-options";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import {
  dateRangeToDays,
  exportCsv,
  formatUsd,
  pnlClass,
  regimeBadge,
  strategyColor,
  strategyLabel,
  timeAgo,
} from "@/lib/utils";
import { chartColors } from "@/lib/chart-colors";
import { CapitalCurveChart } from "@/components/charts/capital-curve";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { StatCardSkeleton } from "@/components/ui/skeleton";
import { SummaryTile } from "@/components/ui/summary-tile";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Download,
  Eye,
  Gauge,
  GraduationCap,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DATE_RANGES = ["7d", "14d", "30d", "60d", "90d"] as const;

export function AnalyticsPageClient() {
  const { activeScope } = useDashboardShell();
  const { effectiveMode, effectiveProfile, resolvedTradeSource } = useDashboardFilters();
  const [dateRange, setDateRange] = useQueryState(
    "dateRange",
    parseAsStringLiteral(DATE_RANGES).withDefault("30d"),
  );
  const days = dateRangeToDays(dateRange);

  const strategiesQuery = useQuery(
    strategyAnalyticsQueryOptions(days, effectiveMode, effectiveProfile, resolvedTradeSource),
  );
  const executionQualityQuery = useQuery(
    executionQualityQueryOptions(days, effectiveMode, effectiveProfile, resolvedTradeSource),
  );
  const regimeHistoryQuery = useQuery(regimeHistoryQueryOptions());
  const wouldHaveWonQuery = useQuery(wouldHaveWonQueryOptions(days, effectiveMode, effectiveProfile));
  const pnlDistributionQuery = useQuery(
    pnlDistributionQueryOptions(days, effectiveMode, effectiveProfile, resolvedTradeSource),
  );
  const dailyStatsQuery = useQuery(dailyStatsQueryOptions(days, effectiveMode, effectiveProfile));
  const walletActivityQuery = useQuery(walletActivityQueryOptions(30));
  const graduationStatsQuery = useQuery(graduationStatsQueryOptions(days));

  const strategies = useMemo(() => strategiesQuery.data ?? [], [strategiesQuery.data]);
  const executionQuality = useMemo(
    () => executionQualityQuery.data ?? [],
    [executionQualityQuery.data],
  );
  const wouldHaveWon = wouldHaveWonQuery.data;
  const pnlDist = useMemo(() => pnlDistributionQuery.data ?? [], [pnlDistributionQuery.data]);
  const dailyStats = useMemo(
    () => (dailyStatsQuery.data ?? []).filter((stat) => stat.strategy === null),
    [dailyStatsQuery.data],
  );
  const walletActivity = walletActivityQuery.data ?? [];
  const graduationStats = graduationStatsQuery.data;
  const regimeHistory = regimeHistoryQuery.data ?? [];

  const scatterData = useMemo(
    () => pnlDist.map((point, index) => ({ ...point, index: index + 1 })),
    [pnlDist],
  );

  const summary = useMemo(() => {
    const totals = strategies.reduce(
      (acc, strategy) => ({
        exits: acc.exits + strategy.totalExits,
        fees: acc.fees + strategy.totalFeesSol,
        losses: acc.losses + strategy.losses,
        pnl: acc.pnl + strategy.totalPnlUsd,
        wins: acc.wins + strategy.wins,
      }),
      { exits: 0, fees: 0, losses: 0, pnl: 0, wins: 0 },
    );
    const expectancy = totals.exits > 0 ? totals.pnl / totals.exits : 0;
    const grossWins = pnlDist
      .filter((point) => point.pnlUsd > 0)
      .reduce((sum, point) => sum + point.pnlUsd, 0);
    const grossLosses = Math.abs(
      pnlDist
        .filter((point) => point.pnlUsd < 0)
        .reduce((sum, point) => sum + point.pnlUsd, 0),
    );
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : null;
    const bestDay = dailyStats.reduce<typeof dailyStats[number] | null>(
      (best, stat) => (best == null || stat.netPnlUsd > best.netPnlUsd ? stat : best),
      null,
    );
    const worstDay = dailyStats.reduce<typeof dailyStats[number] | null>(
      (worst, stat) => (worst == null || stat.netPnlUsd < worst.netPnlUsd ? stat : worst),
      null,
    );
    const topStrategy = [...strategies].sort((left, right) => right.totalPnlUsd - left.totalPnlUsd)[0] ?? null;
    const aggregateManualShare = executionQuality.length > 0
      ? executionQuality.reduce((sum, row) => sum + row.manualShare, 0) / executionQuality.length
      : 0;

    return {
      ...totals,
      aggregateManualShare,
      bestDay,
      expectancy,
      profitFactor,
      topStrategy,
      winRate: totals.exits > 0 ? (totals.wins / totals.exits) * 100 : 0,
      worstDay,
    };
  }, [dailyStats, executionQuality, pnlDist, strategies]);

  const handleExportStats = () => {
    if (!dailyStatsQuery.data) return;

    exportCsv(
      `daily-stats-${effectiveMode}-${effectiveProfile}-${dateRange}`,
      ["Date", "Trades", "Won", "Lost", "Win Rate", "Gross P&L", "Net P&L", "Capital", "Regime"],
      dailyStatsQuery.data
        .filter((stat) => stat.strategy === null)
        .map((stat) => [
          new Date(stat.date).toISOString().slice(0, 10),
          stat.tradesTotal,
          stat.tradesWon,
          stat.tradesLost,
          (stat.winRate * 100).toFixed(1),
          stat.grossPnlUsd.toFixed(2),
          stat.netPnlUsd.toFixed(2),
          stat.capitalEnd.toFixed(2),
          stat.regime,
        ]),
    );
  };

  const motionContainer = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
  const motionItem = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <motion.div className="space-y-5" variants={motionContainer} initial="hidden" animate="visible">
      <motion.div variants={motionItem} className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Expectancy Ledger</div>
          <div className="mt-1 text-sm text-text-secondary">
            {activeScope ? `${activeScope.mode}/${activeScope.configProfile}` : "runtime pending"}
            {" · "}analysis {effectiveMode}/{effectiveProfile}
            {resolvedTradeSource ? ` · ${resolvedTradeSource.toLowerCase()} trades` : " · all trade sources"}
            {" · "}{dateRange} lookback
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            {DATE_RANGES.map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`date-range-btn ${dateRange === range ? "date-range-btn-active" : "date-range-btn-inactive"}`}
              >
                {range}
              </button>
            ))}
          </div>
          <button onClick={handleExportStats} className="btn-ghost flex items-center gap-1 text-xs">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <SummaryTile
          label="Net P&L"
          value={formatUsd(summary.pnl)}
          sub={`${summary.exits} exits`}
          icon={<TrendingUp className="h-3.5 w-3.5 text-accent-green" />}
          valueClass={pnlClass(summary.pnl)}
          tone={summary.pnl < 0 ? "danger" : "positive"}
        />
        <SummaryTile
          label="Win Rate"
          value={`${summary.winRate.toFixed(0)}%`}
          sub={`${summary.wins}W / ${summary.losses}L`}
          icon={<Shield className="h-3.5 w-3.5 text-accent-blue" />}
          tone={summary.winRate < 45 ? "warning" : "default"}
        />
        <SummaryTile
          label="Expectancy"
          value={formatUsd(summary.expectancy)}
          sub="Average per closed trade"
          valueClass={pnlClass(summary.expectancy)}
        />
        <SummaryTile
          label="Profit Factor"
          value={summary.profitFactor != null ? summary.profitFactor.toFixed(2) : "—"}
          sub="Gross wins / gross losses"
          tone={summary.profitFactor != null && summary.profitFactor < 1 ? "danger" : "default"}
        />
        <SummaryTile
          label="Best Day"
          value={summary.bestDay ? formatUsd(summary.bestDay.netPnlUsd) : "—"}
          sub={summary.bestDay ? new Date(summary.bestDay.date).toLocaleDateString() : "No closed days"}
          valueClass={pnlClass(summary.bestDay?.netPnlUsd ?? 0)}
        />
        <SummaryTile
          label="Manual Share"
          value={`${(summary.aggregateManualShare * 100).toFixed(0)}%`}
          sub={resolvedTradeSource ? "Scoped to selected source" : "Across execution telemetry"}
          icon={<Gauge className="h-3.5 w-3.5 text-accent-yellow" />}
          tone={summary.aggregateManualShare > 0.45 ? "warning" : "default"}
        />
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent-green" />
              <span className="stat-label">Capital Curve</span>
              <span className="text-[11px] text-text-muted">{dateRange} window, filtered to the current analysis lane.</span>
            </div>
            <CapitalCurveChart days={days} mode={effectiveMode} profile={effectiveProfile} />
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-accent-purple" />
              <span className="stat-label">Strategy Performance</span>
            </div>
            {summary.topStrategy ? (
              <span className={`text-xs font-medium ${strategyColor(summary.topStrategy.strategy)}`}>
                Best contributor: {strategyLabel(summary.topStrategy.strategy)}
              </span>
            ) : null}
          </div>

          {strategiesQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => <StatCardSkeleton key={index} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {strategies.map((strategy) => {
                const expectancy = strategy.totalExits > 0 ? strategy.totalPnlUsd / strategy.totalExits : 0;
                const quality = executionQuality.find((row) => row.strategy === strategy.strategy);
                return (
                  <div
                    key={strategy.strategy}
                    className={`card border-l-2 ${
                      strategy.strategy === "S1_COPY"
                        ? "border-l-accent-blue"
                        : strategy.strategy === "S2_GRADUATION"
                          ? "border-l-accent-purple"
                          : "border-l-accent-cyan"
                    }`}
                  >
                    <div className={`mb-3 text-base font-semibold ${strategyColor(strategy.strategy)}`}>
                      {strategyLabel(strategy.strategy)}
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <MetricRow label="Exits" value={String(strategy.totalExits)} />
                      <MetricRow
                        label="Win rate"
                        value={`${(strategy.winRate * 100).toFixed(0)}%`}
                        valueClass={
                          strategy.winRate >= 0.5
                            ? "pnl-positive"
                            : strategy.winRate >= 0.4
                              ? "text-accent-yellow"
                              : "pnl-negative"
                        }
                      />
                      <MetricRow
                        label="Net P&L"
                        value={formatUsd(strategy.totalPnlUsd)}
                        valueClass={pnlClass(strategy.totalPnlUsd)}
                      />
                      <MetricRow
                        label="Expectancy"
                        value={formatUsd(expectancy)}
                        valueClass={pnlClass(expectancy)}
                      />
                      <MetricRow label="Avg win" value={formatUsd(strategy.avgWinUsd)} valueClass="pnl-positive" />
                      <MetricRow label="Avg loss" value={formatUsd(strategy.avgLossUsd)} valueClass="pnl-negative" />
                      {quality ? (
                        <MetricRow
                          label="Entry slip"
                          value={`${quality.avgEntrySlippageBps.toFixed(0)} bps`}
                          valueClass={quality.avgEntrySlippageBps > 250 ? "text-accent-yellow" : "text-text-primary"}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!strategies.length ? (
                <div className="card py-10 text-center text-sm text-text-muted md:col-span-3">
                  No analytics yet. No exits, no inference.
                </div>
              ) : null}
            </div>
          )}
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-accent-yellow" />
            <span className="stat-label">Execution Quality</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {executionQuality.map((row) => (
              <div
                key={row.strategy}
                className={`card border-l-2 ${
                  row.strategy === "S1_COPY"
                    ? "border-l-accent-blue"
                    : row.strategy === "S2_GRADUATION"
                      ? "border-l-accent-purple"
                      : "border-l-accent-cyan"
                }`}
              >
                <div className={`mb-3 text-base font-semibold ${strategyColor(row.strategy)}`}>
                  {strategyLabel(row.strategy)}
                </div>
                <div className="space-y-1.5 text-sm">
                  <MetricRow label="Entries" value={String(row.buyCount)} />
                  <MetricRow label="Exits" value={String(row.sellCount)} />
                  <MetricRow
                    label="Entry slippage"
                    value={`${row.avgEntrySlippageBps.toFixed(0)} bps`}
                    valueClass={row.avgEntrySlippageBps > 250 ? "text-accent-yellow" : "text-text-primary"}
                  />
                  <MetricRow
                    label="Exit slippage"
                    value={`${row.avgExitSlippageBps.toFixed(0)} bps`}
                    valueClass={row.avgExitSlippageBps > 250 ? "text-accent-yellow" : "text-text-primary"}
                  />
                  <MetricRow label="Avg fee" value={`${row.avgFeeSol.toFixed(4)} SOL`} />
                  <MetricRow label="Entry latency" value={row.avgEntryLatencyMs > 0 ? `${row.avgEntryLatencyMs.toFixed(0)} ms` : "—"} />
                  <MetricRow label="Copy lead" value={row.avgCopyLeadMs > 0 ? `${row.avgCopyLeadMs.toFixed(0)} ms` : "—"} />
                  <MetricRow
                    label="Manual share"
                    value={`${(row.manualShare * 100).toFixed(0)}%`}
                    valueClass={row.manualShare > 0.45 ? "text-accent-yellow" : "text-text-primary"}
                  />
                </div>
              </div>
            ))}
            {!executionQuality.length ? (
              <div className="card py-10 text-center text-sm text-text-muted md:col-span-3">
                Execution telemetry hasn’t accumulated yet.
              </div>
            ) : null}
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        {pnlDist.length ? (
          <ErrorBoundary>
            <div className="card">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent-cyan" />
                <span className="stat-label">P&amp;L Distribution</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis
                    dataKey="index"
                    tick={{ fill: chartColors.muted, fontSize: 10 }}
                    axisLine={{ stroke: chartColors.gridLine }}
                    tickLine={false}
                    label={{ value: "Trade #", position: "bottom", fill: chartColors.muted, fontSize: 10 }}
                  />
                  <YAxis
                    dataKey="pnlUsd"
                    tick={{ fill: chartColors.muted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    wrapperStyle={{
                      background: chartColors.tooltipBg,
                      border: `1px solid ${chartColors.tooltipBorder}`,
                      borderRadius: "8px",
                    }}
                    itemStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
                    labelStyle={{ color: chartColors.tooltipText, fontSize: 12 }}
                    formatter={(value) => [`$${(Number(value) || 0).toFixed(2)}`, "P&L"]}
                  />
                  <ReferenceLine y={0} stroke={chartColors.gridLine} />
                  <Scatter data={scatterData} isAnimationActive={false}>
                    {scatterData.map((point, index) => (
                      <Cell
                        key={`${point.index}-${index}`}
                        fill={point.pnlUsd >= 0 ? chartColors.win : chartColors.loss}
                        fillOpacity={0.72}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </ErrorBoundary>
        ) : null}

        {wouldHaveWon && wouldHaveWon.total > 0 ? (
          <ErrorBoundary>
            <div className="card">
              <div className="mb-4 flex items-center gap-2">
                <Eye className="h-4 w-4 text-accent-yellow" />
                <span className="stat-label">Missed Opportunities</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <SummaryTile label="Rejected" value={String(wouldHaveWon.total)} className="py-2.5" />
                <SummaryTile label="Would Win" value={String(wouldHaveWon.wouldHaveWon)} className="py-2.5" tone="positive" />
                <SummaryTile
                  label="Leak Rate"
                  value={`${(wouldHaveWon.wouldHaveWonRate * 100).toFixed(0)}%`}
                  className="py-2.5"
                  tone={wouldHaveWon.wouldHaveWonRate > 0.4 ? "warning" : "default"}
                />
              </div>

              {wouldHaveWon.wouldHaveWonRate > 0.4 ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-xs text-accent-yellow">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Reject thresholds are shedding too many winners. Tight filters, blunt instrument.
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                {wouldHaveWon.signals.slice(0, 6).map((signal) => {
                  const entry = signal.priceAtSignal ?? 0;
                  const peak = signal.priceAfter1h ?? signal.priceAfter15m ?? signal.priceAfter5m;
                  const peakPct = entry > 0 && peak != null ? ((peak - entry) / entry) * 100 : null;

                  return (
                    <div key={signal.id} className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className={`text-sm font-medium ${strategyColor(signal.strategy)}`}>
                            {strategyLabel(signal.strategy)}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {signal.tokenSymbol || signal.tokenAddress.slice(0, 8)} · {signal.rejectReason ?? "No reject reason"}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold tabular-nums ${pnlClass(peakPct ?? 0)}`}>
                          {peakPct != null ? `${peakPct >= 0 ? "+" : ""}${peakPct.toFixed(0)}%` : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ErrorBoundary>
        ) : null}
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {graduationStats && graduationStats.totalEvents > 0 ? (
          <ErrorBoundary>
            <div className="card">
              <div className="mb-4 flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-accent-purple" />
                <span className="stat-label">Graduation Events</span>
              </div>
              <div className="mb-3 text-sm text-text-secondary">
                {graduationStats.totalEvents} events observed across the selected window.
              </div>
              <div className="space-y-3">
                {Object.entries(graduationStats.byPlatform).map(([platform, stats]) => (
                  <div key={platform} className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-accent-purple">{platform}</span>
                      <span className="text-text-muted">{stats.total} events</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <MetricStack label="Traded" value={String(stats.traded)} valueClass="text-accent-green" />
                      <MetricStack label="Rugged" value={String(stats.rugged)} valueClass="text-accent-red" />
                      <MetricStack label="Missed" value={String(stats.total - stats.traded - stats.rugged)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ErrorBoundary>
        ) : null}

        {walletActivity.length ? (
          <ErrorBoundary>
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-accent-blue" />
                  <span className="stat-label">Copy-Trade Wallet Activity</span>
                </div>
                <span className="text-[11px] text-text-muted">Platform-wide feed</span>
              </div>
              <div className="space-y-2">
                {walletActivity.slice(0, 8).map((walletTrade) => {
                  const entry = walletTrade.priceAtTrade ?? 0;
                  const peak = walletTrade.peakPriceAfter ?? 0;
                  const peakPct = entry > 0 && peak > 0 ? ((peak - entry) / entry) * 100 : null;
                  return (
                    <div key={walletTrade.id} className="flex items-center justify-between rounded-xl border border-bg-border/80 bg-bg-hover/35 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className={walletTrade.action === "BUY" ? "badge badge-green" : "badge badge-red"}>
                            {walletTrade.action}
                          </span>
                          <span className="truncate">{walletTrade.tokenSymbol || walletTrade.tokenAddress.slice(0, 8)}</span>
                        </div>
                        <div className="text-xs text-text-muted">
                          {walletTrade.walletAddress.slice(0, 8)}…{walletTrade.walletAddress.slice(-4)}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className={`font-medium tabular-nums ${pnlClass(peakPct ?? 0)}`}>
                          {peakPct != null ? `peak ${peakPct >= 0 ? "+" : ""}${peakPct.toFixed(0)}%` : "peak —"}
                        </div>
                        <div className="text-text-muted">{timeAgo(walletTrade.detectedAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ErrorBoundary>
        ) : null}
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent-yellow" />
              <span className="stat-label">Regime History</span>
            </div>
            {regimeHistory.length ? (
              <div className="space-y-3">
                <div className="flex h-8 overflow-hidden rounded-lg">
                  {regimeHistory.slice(0, 48).map((snapshot) => {
                    const badge = regimeBadge(snapshot.regime);
                    const width = 100 / Math.min(regimeHistory.length, 48);
                    return (
                      <div
                        key={snapshot.id}
                        title={`${snapshot.regime} | SOL ${formatUsd(snapshot.solPrice)} | ${new Date(snapshot.snappedAt).toLocaleTimeString()}`}
                        className={`${badge.class} flex items-center justify-center border-r border-bg-primary/20 text-[8px] font-bold last:border-0`}
                        style={{ width: `${width}%` }}
                      >
                        {width > 3 ? snapshot.regime[0] : ""}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-text-muted">
                  <span>24h ago</span>
                  <span>Now</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-text-muted">No regime snapshots yet.</div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-bg-border/70 py-1.5 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className={`font-medium tabular-nums ${valueClass ?? "text-text-primary"}`}>{value}</span>
    </div>
  );
}

function MetricStack({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-text-muted">{label}</div>
      <div className={`mt-1 font-medium tabular-nums ${valueClass ?? "text-text-primary"}`}>{value}</div>
    </div>
  );
}
