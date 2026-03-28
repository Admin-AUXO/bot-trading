"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { fetchOverview, fetchApiUsage, fetchPositions, fetchDailyStats, fetchHeartbeat, getErrorMessage } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { formatUsd, formatPercent, formatNumber, formatSol, pnlClass, strategyLabel, strategyColor, regimeBadge } from "@/lib/utils";
import { PnlChart } from "@/components/charts/pnl-chart";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { StatCardSkeleton, ChartSkeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Wallet, Target, Shield, Zap, Activity, Database, Heart } from "lucide-react";

export default function OverviewPage() {
  const { mode } = useDashboardStore();

  const { data: overview, isLoading, error } = useQuery({
    queryKey: ["overview", mode],
    queryFn: () => fetchOverview(mode),
    refetchInterval: (query) => query.state.status === "error" ? 30_000 : 5000,
    staleTime: 5000,
  });

  const { data: positions } = useQuery({
    queryKey: ["positions", mode],
    queryFn: () => fetchPositions(mode),
    refetchInterval: (query) => query.state.status === "error" ? 30_000 : 5000,
  });

  const { data: apiUsage } = useQuery({
    queryKey: ["api-usage"],
    queryFn: fetchApiUsage,
    refetchInterval: 30000,
  });

  const { data: recentStats } = useQuery({
    queryKey: ["daily-stats-sparkline", mode],
    queryFn: () => fetchDailyStats(7, mode),
    refetchInterval: 60000,
  });

  const { data: heartbeat } = useQuery({
    queryKey: ["heartbeat"],
    queryFn: fetchHeartbeat,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="card"><ChartSkeleton height="h-32" /></div>)}
        </div>
        <div className="card"><ChartSkeleton height="h-48" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
        Failed to load overview — {getErrorMessage(error)}
      </div>
    );
  }

  if (!overview) return null;

  const regime = regimeBadge(overview.regime.regime);
  const todayWinRate = overview.todayWins + overview.todayLosses > 0
    ? (overview.todayWins / (overview.todayWins + overview.todayLosses)) * 100
    : 0;

  const last7dPnl = recentStats
    ?.filter((s) => s.strategy === null)
    .reduce((sum, s) => sum + s.netPnlUsd, 0) ?? 0;

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <motion.div className="space-y-6" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wallet className="w-4 h-4 text-accent-blue" />}
          label="Capital"
          value={formatUsd(overview.capitalUsd)}
          sub={`${overview.capitalSol.toFixed(2)} SOL`}
          trend={last7dPnl !== 0 ? `7d: ${formatUsd(last7dPnl)}` : undefined}
          trendClass={pnlClass(last7dPnl)}
        />
        <StatCard
          icon={overview.todayPnl >= 0
            ? <TrendingUp className="w-4 h-4 text-accent-green" />
            : <TrendingDown className="w-4 h-4 text-accent-red" />
          }
          label="Today P&L"
          value={formatUsd(overview.todayPnl)}
          valueClass={pnlClass(overview.todayPnl)}
          sub={`${overview.todayTrades} trades`}
        />
        <StatCard
          icon={<Target className="w-4 h-4 text-accent-purple" />}
          label="Win Rate (Today)"
          value={formatPercent(todayWinRate).replace("+", "")}
          sub={`${overview.todayWins}W / ${overview.todayLosses}L`}
        />
        <StatCard
          icon={<Shield className="w-4 h-4 text-accent-yellow" />}
          label="Daily Loss"
          value={formatUsd(overview.dailyLossUsd)}
          sub={`limit: ${formatUsd(overview.dailyLossLimit)}`}
          valueClass={overview.dailyLossUsd > overview.dailyLossLimit * 0.7 ? "text-accent-yellow" : ""}
          progress={overview.dailyLossLimit > 0 ? (overview.dailyLossUsd / overview.dailyLossLimit) * 100 : 0}
        />
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ErrorBoundary>
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="stat-label">Market Regime</span>
              <span className={`badge ${regime.class}`}>{regime.label}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">SOL Price</span>
                <span className="tabular-nums">{formatUsd(overview.regime.solPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">5m Change</span>
                <span className={`tabular-nums ${pnlClass(overview.regime.solChange5m)}`}>
                  {formatPercent(overview.regime.solChange5m)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">1h Change</span>
                <span className={`tabular-nums ${pnlClass(overview.regime.solChange1h)}`}>
                  {formatPercent(overview.regime.solChange1h)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Rolling Win Rate</span>
                <span className="tabular-nums">{(overview.rollingWinRate * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Trending Tokens</span>
                <span className="tabular-nums">{(overview.regime as { trendingCount?: number }).trendingCount ?? "—"}</span>
              </div>
            </div>
            {heartbeat && (
              <div className="mt-3 pt-3 border-t border-bg-border flex items-center justify-between text-xs text-text-muted">
                <div className="flex items-center gap-1.5">
                  <Heart className="w-3 h-3 text-accent-red" />
                  <span>Uptime</span>
                </div>
                <span>{formatUptimeShort(heartbeat.uptime)}</span>
              </div>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-accent-cyan" />
              <span className="stat-label">Open Positions ({positions?.length ?? 0}/5)</span>
            </div>
            {positions && positions.length > 0 ? (
              <div className="space-y-2">
                {positions.map((pos) => (
                  <div key={pos.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${strategyColor(pos.strategy)}`}>
                          {strategyLabel(pos.strategy)}
                        </span>
                        <span className="text-text-primary font-medium">{pos.tokenSymbol}</span>
                        {pos.tradeSource === "MANUAL" && (
                          <span className="text-[9px] px-1 py-0.5 bg-accent-yellow/20 text-accent-yellow rounded">M</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`tabular-nums font-medium ${pnlClass(pos.pnlPercent)}`}>
                          {formatPercent(pos.pnlPercent)}
                        </span>
                        {pos.pnlUsd != null && (
                          <span className={`text-xs tabular-nums ${pnlClass(pos.pnlUsd)}`}>
                            {formatUsd(pos.pnlUsd)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-text-muted">
                      <span>{formatSol(pos.amountSol)}</span>
                      <span>{pos.holdMinutes ? `${pos.holdMinutes.toFixed(0)}m held` : ""}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 mt-1 border-t border-bg-border text-xs flex justify-between text-text-muted">
                  <span>Total invested</span>
                  <span className="tabular-nums">{formatSol(positions.reduce((s, p) => s + p.amountSol, 0))}</span>
                </div>
              </div>
            ) : (
              <div className="text-text-muted text-sm py-4 text-center">No open positions</div>
            )}
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-accent-green" />
              <span className="stat-label">API Usage (Month)</span>
            </div>
            {apiUsage?.monthly ? (
              <div className="space-y-3">
                {apiUsage.monthly.map((u) => {
                  const budget = u.service === "HELIUS" ? 10_000_000 : 1_500_000;
                  const used = u._sum.totalCredits ?? 0;
                  const pct = budget > 0 ? (used / budget) * 100 : 0;
                  const projectedMonthly = used * (30 / new Date().getDate());
                  return (
                    <div key={u.service} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-muted">{u.service}</span>
                        <span>{formatNumber(used)} / {formatNumber(budget)}</span>
                      </div>
                      <div className="h-1.5 bg-bg-border rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${
                            pct > 80 ? "bg-accent-red" : pct > 60 ? "bg-accent-yellow" : "bg-accent-green"
                          }`}
                          style={{ transformOrigin: "left" }}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: Math.min(pct, 100) / 100 }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as const, delay: 0.3 }}
                        />
                      </div>
                      <div className="text-[10px] text-text-muted">
                        Projected: {formatNumber(projectedMonthly)} ({((projectedMonthly / budget) * 100).toFixed(0)}%)
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-text-muted text-sm">Loading...</div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>

      <motion.div variants={itemVariants}>
        <ErrorBoundary>
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-accent-blue" />
              <span className="stat-label">Daily P&L (30 days)</span>
            </div>
            <PnlChart />
          </div>
        </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}

function formatUptimeShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass = "",
  trend,
  trendClass = "",
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  trend?: string;
  trendClass?: string;
  progress?: number;
}) {
  return (
    <motion.div
      className="card"
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="stat-label">{label}</span>
      </div>
      <div className={`stat-value ${valueClass}`}>{value}</div>
      <div className="flex items-center justify-between mt-1">
        {sub && <span className="text-xs text-text-muted">{sub}</span>}
        {trend && <span className={`text-xs font-medium ${trendClass}`}>{trend}</span>}
      </div>
      {progress !== undefined && (
        <div className="h-1 bg-bg-border rounded-full overflow-hidden mt-2">
          <motion.div
            className={`h-full rounded-full ${
              progress > 70 ? "bg-accent-red" : progress > 40 ? "bg-accent-yellow" : "bg-accent-green"
            }`}
            style={{ transformOrigin: "left" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.min(progress, 100) / 100 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </div>
      )}
    </motion.div>
  );
}
