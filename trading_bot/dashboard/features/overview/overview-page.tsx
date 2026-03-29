"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { apiUsageQueryOptions, dailyStatsQueryOptions } from "@/lib/dashboard-query-options";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { decorateBudgetSnapshots, getApiUsageSnapshotRows } from "@/lib/api-usage";
import { PnlChart } from "@/components/charts/pnl-chart";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ChartSkeleton, StatCardSkeleton } from "@/components/ui/skeleton";
import { SummaryTile } from "@/components/ui/summary-tile";
import {
  cn,
  formatNumber,
  formatPercent,
  formatUsd,
  pnlClass,
  regimeBadge,
  strategyColor,
  strategyLabel,
  timeAgo,
} from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Database,
  Heart,
  Shield,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

const EMPTY_LIST: never[] = [];

export default function OverviewPage() {
  const { effectiveMode, effectiveProfile } = useDashboardFilters();
  const analysisScopeReady = effectiveMode != null && effectiveProfile != null;
  const {
    activeScope,
    overview,
    heartbeat,
    connectionState,
    allPositions,
    urgentPositions,
    openPnlUsd,
    deployedCapitalUsd,
    activeStrategiesCount,
    manualPositions,
    openSlots,
    lastUpdatedAt,
    isLoadingShell,
    maxOpenPositions,
    quotaSnapshots,
    pauseReasons,
  } = useDashboardShell();

  const apiUsageQuery = useQuery(apiUsageQueryOptions(7));
  const recentStatsQuery = useQuery({
    ...dailyStatsQueryOptions(7, effectiveMode, effectiveProfile),
    enabled: analysisScopeReady,
  });

  const recentStats = useMemo(
    () => (recentStatsQuery.data ?? []).filter((stat) => stat.strategy === null),
    [recentStatsQuery.data],
  );
  const regime = overview?.regime ? regimeBadge(overview.regime.regime) : null;
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "awaiting sync";
  const topUrgentPosition = urgentPositions[0] ?? null;
  const analysisLabel = analysisScopeReady
    ? `${effectiveMode === "LIVE" ? "live" : "simulation"} ${effectiveProfile}`
    : "analysis lane pending";

  const recentFlow = useMemo(() => {
    const totals = recentStats.reduce(
      (acc, stat) => ({
        pnl: acc.pnl + stat.netPnlUsd,
        trades: acc.trades + stat.tradesTotal,
        wins: acc.wins + stat.tradesWon,
        losses: acc.losses + stat.tradesLost,
      }),
      { pnl: 0, trades: 0, wins: 0, losses: 0 },
    );

    const bestDay = recentStats.reduce<typeof recentStats[number] | null>(
      (best, stat) => (best == null || stat.netPnlUsd > best.netPnlUsd ? stat : best),
      null,
    );
    const worstDay = recentStats.reduce<typeof recentStats[number] | null>(
      (worst, stat) => (worst == null || stat.netPnlUsd < worst.netPnlUsd ? stat : worst),
      null,
    );

    return {
      ...totals,
      bestDay,
      losingDays: recentStats.filter((stat) => stat.netPnlUsd < 0).length,
      worstDay,
      winningDays: recentStats.filter((stat) => stat.netPnlUsd > 0).length,
    };
  }, [recentStats]);

  const strategyExposure = useMemo(() => {
    const strategies = allPositions.reduce<Record<string, { count: number; deployedUsd: number; pnlUsd: number }>>(
      (acc, position) => {
        const entry = acc[position.strategy] ?? { count: 0, deployedUsd: 0, pnlUsd: 0 };
        entry.count += 1;
        entry.deployedUsd += position.remainingValueUsd ?? (position.currentPriceUsd * position.remainingToken);
        entry.pnlUsd += position.pnlUsd ?? ((position.currentPriceUsd - position.entryPriceUsd) * position.remainingToken);
        acc[position.strategy] = entry;
        return acc;
      },
      {},
    );

    return Object.entries(strategies).sort((left, right) => right[1].deployedUsd - left[1].deployedUsd);
  }, [allPositions]);

  const currentUsage = useMemo(
    () => {
      const detailedRows = getApiUsageSnapshotRows(apiUsageQuery.data);
      return decorateBudgetSnapshots(detailedRows.length > 0 ? detailedRows : quotaSnapshots);
    },
    [apiUsageQuery.data, quotaSnapshots],
  );
  const endpointRows = useMemo(
    () => apiUsageQuery.data?.topEndpoints ?? EMPTY_LIST,
    [apiUsageQuery.data],
  );

  const usageHighlights = useMemo(() => {
    return currentUsage
      .map((usage) => {
        const credits = usage.monthlyUsed;
        return {
          credits,
          pct: usage.budgetTotal > 0 ? (credits / usage.budgetTotal) * 100 : 0,
          pauseReason: usage.pauseReason,
          remaining: usage.monthlyRemaining,
          service: usage.service,
          status: usage.quotaStatus,
        };
      })
      .sort((left, right) => right.pct - left.pct)
      .slice(0, 3);
  }, [currentUsage]);

  const topEndpoints = useMemo(
    () => endpointRows.slice(0, 4),
    [endpointRows],
  );

  const motionContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  };
  const motionItem = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
  };

  if (isLoadingShell) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => <StatCardSkeleton key={index} />)}
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="card">
              <ChartSkeleton height="h-40" />
            </div>
          ))}
        </div>
        <div className="card">
          <ChartSkeleton height="h-52" />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-bg-border bg-bg-card/70 text-sm text-text-secondary">
        {connectionState === "offline"
          ? "Backend unavailable. Shell data has gone dark."
          : "Overview feed unavailable. Waiting for fresh state."}
      </div>
    );
  }

  return (
    <motion.div className="space-y-5" variants={motionContainer} initial="hidden" animate="visible">
      <motion.div variants={motionItem} className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Operating Picture</div>
          <div className="mt-1 text-sm text-text-secondary">
            {activeScope?.mode === "LIVE" ? "Live" : activeScope?.mode === "DRY_RUN" ? "Simulation" : "Runtime"} scope
            {activeScope ? ` · ${activeScope.configProfile}` : ""}
            {analysisScopeReady && (effectiveMode !== activeScope?.mode || effectiveProfile !== activeScope?.configProfile)
              ? ` · analysis ${analysisLabel}`
              : !analysisScopeReady
                ? ` · ${analysisLabel}`
                : ""}
            {" · "}updated {updatedLabel}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          <span>{activeStrategiesCount} strategies engaged</span>
          <span>{manualPositions} manual overrides</span>
          <span>{openSlots} of {maxOpenPositions} slots available</span>
          {pauseReasons.length > 0 ? <span>{pauseReasons.length} blockers active</span> : null}
        </div>
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <SummaryTile
          label="Capital"
          value={formatUsd(overview.capitalUsd)}
          sub={`${overview.capitalSol.toFixed(2)} SOL on hand`}
          icon={<Wallet className="h-3.5 w-3.5 text-accent-blue" />}
        />
        <SummaryTile
          label="Today Realized"
          value={formatUsd(overview.todayPnl)}
          sub={`${overview.todayTrades} trades · ${overview.todayWins}W ${overview.todayLosses}L`}
          icon={<TrendingUp className="h-3.5 w-3.5 text-accent-green" />}
          valueClass={pnlClass(overview.todayPnl)}
          tone={overview.todayPnl < 0 ? "danger" : "default"}
        />
        <SummaryTile
          label="Open P&L"
          value={formatUsd(openPnlUsd)}
          sub={`${allPositions.length} active positions`}
          icon={<Activity className="h-3.5 w-3.5 text-accent-cyan" />}
          valueClass={pnlClass(openPnlUsd)}
          tone={openPnlUsd < 0 ? "danger" : "default"}
        />
        <SummaryTile
          label="Live Exposure"
          value={formatUsd(deployedCapitalUsd)}
          sub={`${Math.max(0, maxOpenPositions - openSlots)} slots used`}
          icon={<Zap className="h-3.5 w-3.5 text-accent-purple" />}
        />
        <SummaryTile
          label="Next Forced Exit"
          value={topUrgentPosition
            ? `${topUrgentPosition.tokenSymbol} · ${topUrgentPosition.timeRemaining == null ? "config pending" : `${Math.max(0, topUrgentPosition.timeRemaining).toFixed(0)}m`}`
            : "Clear"}
          sub={topUrgentPosition
            ? `${strategyLabel(topUrgentPosition.strategy)} · ${Math.max(0, topUrgentPosition.stopDistance).toFixed(1)}% stop cushion`
            : "Stops and time budgets are clear"}
          icon={<Target className="h-3.5 w-3.5 text-accent-yellow" />}
          tone={topUrgentPosition ? "warning" : "positive"}
        />
        <SummaryTile
          label="Loss Utilization"
          value={`${overview.dailyLossLimit > 0 ? ((overview.dailyLossUsd / overview.dailyLossLimit) * 100).toFixed(0) : "0"}%`}
          sub={`${formatUsd(overview.dailyLossUsd)} of ${formatUsd(overview.dailyLossLimit)}`}
          icon={<Shield className="h-3.5 w-3.5 text-accent-red" />}
          tone={overview.dailyLossLimit > 0 && overview.dailyLossUsd / overview.dailyLossLimit > 0.7 ? "danger" : "default"}
        />
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr_1fr]">
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-accent-red" />
                <span className="stat-label">System State</span>
              </div>
              {regime ? <span className={`badge ${regime.class}`}>{regime.label}</span> : null}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricRow label="Capital level" value={overview.capitalLevel} />
              <MetricRow label="Rolling win rate" value={`${(overview.rollingWinRate * 100).toFixed(0)}%`} />
              <MetricRow label="SOL spot" value={formatUsd(overview.regime.solPrice)} />
              <MetricRow label="SOL 1h" value={formatPercent(overview.regime.solChange1h)} valueClass={pnlClass(overview.regime.solChange1h)} />
              <MetricRow label="Profile" value={overview.configProfile} />
              <MetricRow label="Last trade" value={heartbeat?.lastTradeAt ? timeAgo(heartbeat.lastTradeAt) : overview.lastTradeAt ? timeAgo(overview.lastTradeAt) : "—"} />
              <MetricRow label="Last signal" value={heartbeat?.lastSignalAt ? timeAgo(heartbeat.lastSignalAt) : overview.lastSignalAt ? timeAgo(overview.lastSignalAt) : "—"} />
            </div>

            {pauseReasons.length > 0 ? (
              <div className="mt-4 space-y-2 rounded-xl border border-accent-yellow/20 bg-accent-yellow/8 p-3 text-xs text-accent-yellow">
                {pauseReasons.map((reason) => <div key={reason}>{reason}</div>)}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-bg-border/80 bg-bg-hover/30 p-3 text-xs text-text-secondary">
              <div>
                <div className="text-text-muted">Weekly drawdown</div>
                <div className={cn("mt-1 font-medium tabular-nums", pnlClass(-overview.weeklyLossUsd))}>
                  {formatUsd(overview.weeklyLossUsd)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Process uptime</div>
                <div className="mt-1 font-medium text-text-primary">
                  {heartbeat ? formatUptimeShort(heartbeat.uptime) : "—"}
                </div>
              </div>
            </div>
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-accent-yellow" />
                <span className="stat-label">Risk Queue</span>
              </div>
              <span className="text-[11px] text-text-muted">{urgentPositions.length ? "Closest to forced action" : "No urgent exits"}</span>
            </div>

            {urgentPositions.length ? (
              <div className="space-y-3">
                {urgentPositions.map((position) => (
                  <div key={position.id} className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className={cn("text-sm font-medium", strategyColor(position.strategy))}>
                          {strategyLabel(position.strategy)}
                        </div>
                        <div className="text-xs text-text-secondary">
                          {position.tokenSymbol} · {position.tradeSource === "MANUAL" ? "manual" : "auto"}
                        </div>
                      </div>
                      <div className={cn("text-sm font-semibold tabular-nums", pnlClass(position.pnlUsd ?? 0))}>
                        {formatUsd(position.pnlUsd ?? 0)}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-text-secondary">
                      <MetricStack
                        label="Stop cushion"
                        value={`${Math.max(0, position.stopDistance).toFixed(1)}%`}
                        valueClass={position.stopDistance <= 5 ? "text-accent-red" : position.stopDistance <= 10 ? "text-accent-yellow" : "text-text-primary"}
                      />
                      <MetricStack
                        label="Time left"
                        value={position.timeRemaining == null ? "—" : `${Math.max(0, position.timeRemaining).toFixed(0)}m`}
                        valueClass={position.timeRemaining == null
                          ? "text-text-primary"
                          : position.timeRemaining <= 3
                            ? "text-accent-red"
                            : position.timeRemaining <= 10
                              ? "text-accent-yellow"
                              : "text-text-primary"}
                      />
                      <MetricStack label="Held" value={`${position.holdMinutes.toFixed(0)}m`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-bg-border px-4 py-10 text-center text-sm text-text-muted">
                Stops and time budgets are clear. Nothing pressing.
              </div>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent-blue" />
                <span className="stat-label">Strategy Exposure</span>
              </div>
              <span className="text-[11px] text-text-muted">{strategyExposure.length || 0} active buckets</span>
            </div>

            {strategyExposure.length ? (
              <div className="space-y-3">
                {strategyExposure.map(([strategy, exposure]) => (
                  <div key={strategy} className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn("text-sm font-medium", strategyColor(strategy))}>{strategyLabel(strategy)}</span>
                      <span className="text-xs text-text-muted">{exposure.count} positions</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-text-secondary">
                      <span>Live exposure {formatUsd(exposure.deployedUsd)}</span>
                      <span className={cn("tabular-nums", pnlClass(exposure.pnlUsd))}>{formatUsd(exposure.pnlUsd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-bg-border px-4 py-10 text-center text-sm text-text-muted">
                No live exposure. Capital is idle.
              </div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem} className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-accent-green" />
                <span className="stat-label">Quota Pulse</span>
              </div>
              <span className="text-[11px] text-text-muted">Worst services and top spenders</span>
            </div>

            {usageHighlights.length ? (
              <div className="space-y-4">
                {usageHighlights.map((usage) => (
                  <div key={usage.service} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{usage.service}</span>
                      <span className={cn(
                        "font-medium tabular-nums",
                        usage.status === "PAUSED" || usage.status === "HARD_LIMIT"
                          ? "text-accent-red"
                          : usage.status === "SOFT_LIMIT"
                            ? "text-accent-yellow"
                            : "text-accent-green",
                      )}>
                        {usage.status}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-bg-border">
                      <motion.div
                        className={cn(
                          "h-full rounded-full",
                          usage.status === "PAUSED" || usage.status === "HARD_LIMIT"
                            ? "bg-accent-red"
                            : usage.status === "SOFT_LIMIT"
                              ? "bg-accent-yellow"
                              : "bg-accent-green",
                        )}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(usage.pct, 100) / 100 }}
                        style={{ transformOrigin: "left" }}
                        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] as const }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-text-muted">
                      <span>{formatNumber(usage.credits)} credits consumed</span>
                      <span>{formatNumber(usage.remaining)} remaining</span>
                    </div>
                    {usage.pauseReason ? <div className="text-[11px] text-accent-yellow">{usage.pauseReason}</div> : null}
                  </div>
                ))}

                {topEndpoints.length ? (
                  <div className="rounded-xl border border-bg-border/80 bg-bg-hover/30 p-3">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Global Top Endpoint Spenders</div>
                    <div className="mt-3 space-y-2">
                      {topEndpoints.map((endpoint) => (
                        <div key={`${endpoint.service}:${endpoint.endpoint}:${endpoint.purpose}`} className="flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-text-primary">{endpoint.service} · {endpoint.endpoint}</div>
                            <div className="truncate text-text-muted">{endpoint.purpose} · {endpoint.configProfile ?? "all profiles"}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium text-text-primary">{formatNumber(endpoint.totalCredits)} cr</div>
                            <div className="text-text-muted">{formatNumber(endpoint.totalCalls)} calls</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-text-muted">Budget telemetry hasn’t arrived yet.</div>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent-purple" />
                <span className="stat-label">Recent Flow</span>
              </div>
              <span className="text-[11px] text-text-muted">Last 7 days</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricRow label="Net P&L" value={formatUsd(recentFlow.pnl)} valueClass={pnlClass(recentFlow.pnl)} />
              <MetricRow label="Trades closed" value={String(recentFlow.trades)} />
              <MetricRow label="Winning days" value={String(recentFlow.winningDays)} />
              <MetricRow label="Losing days" value={String(recentFlow.losingDays)} />
              <MetricRow
                label="Best day"
                value={recentFlow.bestDay ? formatUsd(recentFlow.bestDay.netPnlUsd) : "—"}
                valueClass={pnlClass(recentFlow.bestDay?.netPnlUsd ?? 0)}
              />
              <MetricRow
                label="Worst day"
                value={recentFlow.worstDay ? formatUsd(recentFlow.worstDay.netPnlUsd) : "—"}
                valueClass={pnlClass(recentFlow.worstDay?.netPnlUsd ?? 0)}
              />
            </div>
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={motionItem}>
        <ErrorBoundary>
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent-blue" />
              <span className="stat-label">Daily P&amp;L</span>
            </div>
            <PnlChart days={30} mode={effectiveMode} profile={effectiveProfile} dailyLossLimit={overview.dailyLossLimit} />
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
      <span className={cn("font-medium tabular-nums text-text-primary", valueClass)}>{value}</span>
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
      <div className={cn("mt-1 font-medium tabular-nums text-text-primary", valueClass)}>{value}</div>
    </div>
  );
}

function formatUptimeShort(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }

  return `${hours}h ${minutes}m`;
}
