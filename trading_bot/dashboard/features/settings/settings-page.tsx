"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  pauseBot, resumeBot,
  fetchProfiles, createProfile, toggleProfile, deleteProfile,
  fetchStrategyConfig, unlockOperatorSession, clearOperatorSession,
} from "@/lib/api";
import type { ConfigProfile } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { apiUsageQueryOptions, dashboardQueryKeys } from "@/lib/dashboard-query-options";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { formatUsd, formatNumber, timeAgo } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import {
  Power, Database, Shield, Wallet, Layers, Plus, Trash2,
  ToggleLeft, ToggleRight, Heart, AlertTriangle, Cpu, Activity,
  Target, TrendingDown, CircleCheck, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";

const STRATEGY_EXIT_TARGETS: Record<string, { t1: string; t2: string; t3: string }> = {
  S1_COPY:      { t1: "+30% (50%)", t2: "+60% (25%)", t3: "Trailing" },
  S2_GRADUATION:{ t1: "2x (50%)",   t2: "3-4x (30%)", t3: "Trailing" },
  S3_MOMENTUM:  { t1: "+20% (50%)", t2: "+40% (25%)", t3: "Trailing" },
};

const STRATEGY_LABELS: Record<string, string> = {
  S1_COPY: "S1 Copy Trade",
  S2_GRADUATION: "S2 Graduation",
  S3_MOMENTUM: "S3 Momentum",
};

const STRATEGY_COLORS: Record<string, string> = {
  S1_COPY: "text-accent-blue",
  S2_GRADUATION: "text-accent-purple",
  S3_MOMENTUM: "text-accent-cyan",
};

const STRATEGY_BORDER: Record<string, string> = {
  S1_COPY: "border-l-accent-blue",
  S2_GRADUATION: "border-l-accent-purple",
  S3_MOMENTUM: "border-l-accent-cyan",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { mode } = useDashboardStore();
  const { overview, heartbeat, allPositions: openPositions, operatorSession } = useDashboardShell();
  const [operatorSecret, setOperatorSecret] = useState("");
  const { data: apiUsage } = useQuery(apiUsageQueryOptions());

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
    staleTime: 60_000,
  });

  const { data: stratConfig } = useQuery({
    queryKey: ["strategy-config"],
    queryFn: fetchStrategyConfig,
    staleTime: 60_000,
  });

  const pauseMutation = useMutation({
    mutationFn: pauseBot,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.overview(mode) }),
  });

  const resumeMutation = useMutation({
    mutationFn: resumeBot,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.overview(mode) }),
  });

  const unlockMutation = useMutation({
    mutationFn: (secret: string) => unlockOperatorSession(secret),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.operatorSession });
      setOperatorSecret("");
    },
  });

  const clearSessionMutation = useMutation({
    mutationFn: clearOperatorSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.operatorSession }),
  });

  const criticalAlerts: string[] = [];
  if (overview) {
    if (overview.dailyLossUsd >= overview.dailyLossLimit * 0.8)
      criticalAlerts.push(`Daily loss at ${((overview.dailyLossUsd / overview.dailyLossLimit) * 100).toFixed(0)}% of limit`);
    if (overview.capitalLevel === "CRITICAL")
      criticalAlerts.push("Capital at CRITICAL level — S3 only");
    if (overview.capitalLevel === "HALT")
      criticalAlerts.push("Capital below $100 — trading halted");
  }

  const positionsByStrategy = openPositions?.reduce<Record<string, number>>((acc, p) => {
    acc[p.strategy] = (acc[p.strategy] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  const dailyLossPct = overview ? (overview.dailyLossUsd / overview.dailyLossLimit) * 100 : 0;
  const weeklyLossPct = overview ? (overview.weeklyLossUsd / overview.weeklyLossLimit) * 100 : 0;

  const todayApiCalls = apiUsage?.daily?.reduce((sum, d) => sum + (d.totalCalls ?? 0), 0) ?? 0;
  const controlsLocked = operatorSession?.configured !== false && !operatorSession?.authenticated;
  const controlsUnavailable = operatorSession?.configured === false;

  const sectionItem = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const } },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-5"
    >
      <motion.div variants={sectionItem} className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Control Plane</div>
          <div className="mt-1 text-sm text-text-secondary">
            {mode === "LIVE" ? "Live" : "Simulation"} mode · bot controls, risk limits, and profile routing
          </div>
        </div>
        <div className="text-[11px] text-text-muted">
          Operator {operatorSession?.authenticated ? "unlocked" : operatorSession?.configured === false ? "unavailable" : "locked"}
        </div>
      </motion.div>

      {/* Critical alerts */}
      {criticalAlerts.length > 0 && (
        <motion.div variants={sectionItem} className="space-y-2">
          {criticalAlerts.map((alert, i) => (
            <div key={i} className="flex items-center gap-2 px-4 py-2.5 bg-accent-red/10 border border-accent-red/30 rounded-lg text-sm text-accent-red">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {alert}
            </div>
          ))}
        </motion.div>
      )}

      {/* Top summary row */}
      <motion.div variants={sectionItem} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat
          icon={<Wallet className="w-3.5 h-3.5 text-accent-blue" />}
          label="Capital"
          value={formatUsd(overview?.capitalUsd ?? 0)}
          sub={`${(overview?.walletBalance ?? 0).toFixed(3)} SOL`}
          level={overview?.capitalLevel}
        />
        <MiniStat
          icon={<TrendingDown className="w-3.5 h-3.5 text-accent-red" />}
          label="Daily Loss"
          value={formatUsd(overview?.dailyLossUsd ?? 0)}
          sub={`${dailyLossPct.toFixed(0)}% of ${formatUsd(overview?.dailyLossLimit ?? 0)}`}
          danger={dailyLossPct > 70}
          progress={dailyLossPct}
        />
        <MiniStat
          icon={<Target className="w-3.5 h-3.5 text-accent-yellow" />}
          label="Weekly Loss"
          value={formatUsd(overview?.weeklyLossUsd ?? 0)}
          sub={`${weeklyLossPct.toFixed(0)}% of ${formatUsd(overview?.weeklyLossLimit ?? 0)}`}
          danger={weeklyLossPct > 70}
          progress={weeklyLossPct}
        />
        <MiniStat
          icon={<Activity className="w-3.5 h-3.5 text-accent-green" />}
          label="Open Positions"
          value={`${openPositions?.length ?? 0} / 5`}
          sub={`Today: ${overview?.todayTrades ?? 0} trades`}
        />
      </motion.div>

      {/* Bot Control + Process Health */}
      <motion.div variants={sectionItem} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ErrorBoundary>
          <div className="card h-full">
            <div className="flex items-center gap-2 mb-4">
              <Power className="w-4 h-4 text-accent-green" />
              <span className="stat-label">Bot Control</span>
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                overview?.isRunning
                  ? "bg-accent-green/15 text-accent-green"
                  : "bg-accent-red/15 text-accent-red"
              }`}>
                {overview?.isRunning ? "● RUNNING" : "○ PAUSED"}
              </span>
            </div>

            <div className="space-y-3">
              {overview?.pauseReason && (
                <div className="flex items-start gap-2 px-3 py-2 bg-accent-yellow/10 border border-accent-yellow/20 rounded-lg text-xs text-accent-yellow">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {overview.pauseReason}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="space-y-0.5">
                  <div className="text-text-muted text-xs">Mode</div>
                  <div className={`font-medium text-sm ${overview?.mode === "LIVE" ? "text-accent-green" : "text-accent-yellow"}`}>
                    {overview?.mode ?? "—"}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-text-muted text-xs">Regime</div>
                  <div className="font-medium text-sm">{overview?.regime.regime ?? "—"}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-text-muted text-xs">Today Trades</div>
                  <div className="font-medium text-sm">{overview?.todayTrades ?? 0}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-text-muted text-xs">Today P&L</div>
                  <div className={`font-medium text-sm ${(overview?.todayPnl ?? 0) >= 0 ? "pnl-positive" : "pnl-negative"}`}>
                    {formatUsd(overview?.todayPnl ?? 0)}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <motion.button
                  onClick={() => toast.promise(pauseMutation.mutateAsync(), {
                    loading: "Pausing bot…",
                    success: "Bot paused",
                    error: "Failed to pause bot",
                  })}
                  disabled={controlsLocked || controlsUnavailable || !overview?.isRunning || pauseMutation.isPending}
                  className="btn-danger disabled:opacity-30 text-xs flex-1"
                  whileTap={{ scale: 0.97 }}
                >
                  {pauseMutation.isPending ? "Pausing…" : "Pause Bot"}
                </motion.button>
                <motion.button
                  onClick={() => toast.promise(resumeMutation.mutateAsync(), {
                    loading: "Resuming bot…",
                    success: "Bot resumed",
                    error: "Failed to resume bot",
                  })}
                  disabled={controlsLocked || controlsUnavailable || overview?.isRunning === true || resumeMutation.isPending}
                  className="btn-primary disabled:opacity-30 text-xs flex-1"
                  whileTap={{ scale: 0.97 }}
                >
                  {resumeMutation.isPending ? "Resuming…" : "Resume Bot"}
                </motion.button>
              </div>
              {(controlsLocked || controlsUnavailable) && (
                <div className="text-[11px] text-text-muted pt-1">
                  {controlsUnavailable
                    ? "Bot controls are unavailable until a dashboard operator secret is configured."
                    : "Bot controls stay locked until operator access is unlocked below."}
                </div>
              )}
            </div>
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <OperatorAccessCard
            authenticated={operatorSession?.authenticated ?? false}
            configured={operatorSession?.configured ?? true}
            operatorSecret={operatorSecret}
            onOperatorSecretChange={setOperatorSecret}
            onUnlock={() => toast.promise(
              unlockMutation.mutateAsync(operatorSecret.trim()),
              {
                loading: "Unlocking operator access…",
                success: "Operator access unlocked",
                error: "Failed to unlock operator access",
              },
            )}
            onLock={() => toast.promise(
              clearSessionMutation.mutateAsync(),
              {
                loading: "Locking operator access…",
                success: "Operator access locked",
                error: "Failed to lock operator access",
              },
            )}
            isUnlocking={unlockMutation.isPending}
            isLocking={clearSessionMutation.isPending}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <div className="card h-full">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-4 h-4 text-accent-red" />
              <span className="stat-label">Process Health</span>
              {heartbeat && (
                <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
                  heartbeat.isRunning ? "bg-accent-green/15 text-accent-green" : "bg-text-muted/20 text-text-muted"
                }`}>
                  {heartbeat.isRunning ? "ALIVE" : "DOWN"}
                </span>
              )}
            </div>
            {heartbeat ? (
              <div className="space-y-2 text-sm">
                <HealthRow
                  icon={<Clock className="w-3.5 h-3.5 text-text-muted" />}
                  label="Uptime"
                  value={formatUptime(heartbeat.uptime)}
                />
                <HealthRow
                  icon={<Cpu className="w-3.5 h-3.5 text-text-muted" />}
                  label="Memory"
                  value={`${heartbeat.memoryMb} MB`}
                  sub={heartbeat.memoryMb > 400 ? "high" : undefined}
                  subClass="text-accent-yellow"
                />
                <HealthRow
                  icon={<Activity className="w-3.5 h-3.5 text-text-muted" />}
                  label="Last Trade"
                  value={heartbeat.lastTradeAt ? timeAgo(heartbeat.lastTradeAt) : "None"}
                />
                <HealthRow
                  icon={<Target className="w-3.5 h-3.5 text-text-muted" />}
                  label="Last Signal"
                  value={heartbeat.lastSignalAt ? timeAgo(heartbeat.lastSignalAt) : "None"}
                />
                <div className="pt-2 border-t border-bg-border">
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-xs">Today API Calls</span>
                    <span className="font-medium text-xs">{formatNumber(todayApiCalls)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-text-muted text-sm">Loading…</div>
            )}
          </div>
        </ErrorBoundary>
      </motion.div>

      {/* Strategy Configuration — 3 col with position usage + exit targets */}
      <motion.div variants={sectionItem}>
        <ErrorBoundary>
          <div className="mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-accent-yellow" />
            <span className="stat-label">Strategy Configuration</span>
          </div>
          {stratConfig ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(stratConfig.strategies).map(([key, cfg]) => {
                const active = positionsByStrategy[key] ?? 0;
                const exits = STRATEGY_EXIT_TARGETS[key];
                return (
                  <div key={key} className={`card card-hover border-l-2 ${STRATEGY_BORDER[key] ?? ""}`}>
                    <div className={`font-bold text-base mb-3 ${STRATEGY_COLORS[key] ?? ""}`}>
                      {STRATEGY_LABELS[key] ?? key}
                    </div>

                    {/* Position slot usage */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-text-muted">Positions</span>
                        <span className={`font-medium ${active >= cfg.maxPositions ? "text-accent-red" : "text-text-primary"}`}>
                          {active} / {cfg.maxPositions}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: cfg.maxPositions }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                              i < active ? (STRATEGY_COLORS[key]?.replace("text-", "bg-") ?? "bg-accent-green") : "bg-bg-border"
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="grid grid-cols-2 gap-x-4">
                        <Row label="Size" value={`${cfg.positionSize} SOL`} />
                        <Row label="Stop Loss" value={`${cfg.stopLoss}%`} />
                        <Row label="Time Stop" value={cfg.timeStop} />
                      </div>
                      {exits && (
                        <div className="pt-2 mt-1 border-t border-bg-border space-y-1">
                          <div className="text-text-muted font-medium text-[10px] uppercase tracking-wider mb-1">Exit Targets</div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">T1</span>
                            <span className="text-accent-green font-medium">{exits.t1}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">T2</span>
                            <span className="text-accent-green font-medium">{exits.t2}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-muted">T3</span>
                            <span className="text-text-secondary">{exits.t3}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card text-text-muted text-sm">Loading configuration…</div>
          )}
        </ErrorBoundary>
      </motion.div>

      {/* Risk Limits */}
      {stratConfig && overview && (
        <motion.div variants={sectionItem}>
          <ErrorBoundary>
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-accent-red" />
                <span className="stat-label">Risk Limits</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                  overview.capitalLevel === "NORMAL"   ? "bg-accent-green/15 text-accent-green"  :
                  overview.capitalLevel === "CRITICAL" ? "bg-accent-red/15 text-accent-red"      :
                  overview.capitalLevel === "HALT"     ? "bg-accent-red/30 text-accent-red"      :
                                                         "bg-accent-yellow/15 text-accent-yellow"
                }`}>
                  {overview.capitalLevel}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <RiskBar
                  label="Daily Loss"
                  used={overview.dailyLossUsd}
                  limit={stratConfig.risk.dailyLossLimit}
                  pct={dailyLossPct}
                />
                <RiskBar
                  label="Weekly Loss"
                  used={overview.weeklyLossUsd}
                  limit={stratConfig.risk.weeklyLossLimit}
                  pct={weeklyLossPct}
                />
                <div className="text-sm space-y-1">
                  <Row label="Max Open Positions" value={String(stratConfig.risk.maxOpenPositions)} />
                  <Row label="Gas Reserve" value={`${stratConfig.risk.gasReserve} SOL`} />
                  <Row label="Wallet Balance" value={`${(overview.walletBalance ?? 0).toFixed(4)} SOL`} />
                  <Row label="Rolling Win Rate" value={`${((overview.rollingWinRate ?? 0) * 100).toFixed(0)}%`} />
                </div>
                <div className="text-sm space-y-1">
                  <Row label="Today W/L" value={`${overview.todayWins}W / ${overview.todayLosses}L`} />
                  <Row label="SOL Price" value={formatUsd(overview.regime.solPrice)} />
                  <Row label="SOL 5m" value={`${overview.regime.solChange5m >= 0 ? "+" : ""}${overview.regime.solChange5m.toFixed(2)}%`} />
                  <Row label="SOL 1h" value={`${overview.regime.solChange1h >= 0 ? "+" : ""}${overview.regime.solChange1h.toFixed(2)}%`} />
                </div>
              </div>
            </div>
          </ErrorBoundary>
        </motion.div>
      )}

      {/* API Budget + Profiles */}
      <motion.div variants={sectionItem} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ErrorBoundary>
          <div className="card h-full">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-accent-green" />
              <span className="stat-label">API Budget</span>
            </div>
            <div className="space-y-4">
              {apiUsage?.monthly?.map((u) => {
                const budget = u.service === "HELIUS" ? 10_000_000 : 1_500_000;
                const used = u._sum.totalCredits ?? 0;
                const calls = u._sum.totalCalls ?? 0;
                const pct = budget > 0 ? (used / budget) * 100 : 0;
                const dayOfMonth = new Date().getDate();
                const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                const projected = dayOfMonth > 0 ? used * (daysInMonth / dayOfMonth) : used;
                const projectedPct = budget > 0 ? (projected / budget) * 100 : 0;
                const daysUntilExhausted = used > 0 ? (budget / (used / dayOfMonth)) : null;

                const todayService = apiUsage.daily?.find((d) => d.service === u.service);

                return (
                  <div key={u.service} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{u.service}</span>
                      <span className={`text-xs font-medium ${pct > 80 ? "text-accent-red" : pct > 60 ? "text-accent-yellow" : "text-accent-green"}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-bg-border rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${pct > 80 ? "bg-accent-red" : pct > 60 ? "bg-accent-yellow" : "bg-accent-green"}`}
                        style={{ transformOrigin: "left" }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(pct, 100) / 100 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-text-muted">
                      <div>{formatNumber(used)} / {formatNumber(budget)} credits</div>
                      <div className="text-right">{formatNumber(calls)} calls</div>
                      <div>Projected: {projectedPct.toFixed(0)}%</div>
                      {daysUntilExhausted !== null && daysUntilExhausted < 35 && (
                        <div className={`text-right ${daysUntilExhausted < 10 ? "text-accent-red" : "text-text-muted"}`}>
                          Exhausted in ~{daysUntilExhausted.toFixed(0)}d
                        </div>
                      )}
                    </div>
                    {todayService && (
                      <div className="flex items-center gap-1 text-xs text-text-muted bg-bg-hover/60 rounded px-2 py-1">
                        <span>Today:</span>
                        <span className="text-text-primary font-medium">{formatNumber(todayService.totalCalls)} calls</span>
                        <span>·</span>
                        <span className="text-text-primary font-medium">{formatNumber(todayService.totalCredits)} credits</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {(!apiUsage?.monthly || apiUsage.monthly.length === 0) && (
                <div className="text-text-muted text-sm">No usage data yet</div>
              )}
            </div>
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <ProfilesSection
            profiles={profiles ?? []}
            controlsLocked={controlsLocked}
            controlsUnavailable={controlsUnavailable}
          />
        </ErrorBoundary>
      </motion.div>
    </motion.div>
  );
}

function MiniStat({
  icon, label, value, sub, level, danger, progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  level?: string;
  danger?: boolean;
  progress?: number;
}) {
  return (
    <div className="card py-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-base font-bold ${danger ? "text-accent-red" : level === "NORMAL" ? "text-text-primary" : level === "CRITICAL" || level === "HALT" ? "text-accent-red" : "text-text-primary"}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
      {progress !== undefined && (
        <div className="h-1 bg-bg-border rounded-full overflow-hidden mt-2">
          <motion.div
            className={`h-full rounded-full ${progress > 70 ? "bg-accent-red" : progress > 40 ? "bg-accent-yellow" : "bg-accent-green"}`}
            style={{ transformOrigin: "left" }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Math.min(progress, 100) / 100 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as const, delay: 0.2 }}
          />
        </div>
      )}
    </div>
  );
}

function RiskBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className={`font-medium tabular-nums ${pct > 70 ? "text-accent-red" : pct > 40 ? "text-accent-yellow" : "text-text-primary"}`}>
          {formatUsd(used)} / {formatUsd(limit)}
        </span>
      </div>
      <div className="h-2.5 bg-bg-border rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full relative ${pct > 70 ? "bg-accent-red" : pct > 40 ? "bg-accent-yellow" : "bg-accent-green"}`}
          style={{ transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.min(pct, 100) / 100 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{pct.toFixed(1)}% consumed</span>
        <span>{(100 - pct).toFixed(1)}% remaining</span>
      </div>
    </div>
  );
}

function HealthRow({
  icon, label, value, sub, subClass = "text-accent-yellow",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  subClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{value}</span>
        {sub && <span className={`text-xs ${subClass}`}>({sub})</span>}
      </div>
    </div>
  );
}

function OperatorAccessCard({
  authenticated,
  configured,
  operatorSecret,
  onOperatorSecretChange,
  onUnlock,
  onLock,
  isUnlocking,
  isLocking,
}: {
  authenticated: boolean;
  configured: boolean;
  operatorSecret: string;
  onOperatorSecretChange: (value: string) => void;
  onUnlock: () => void;
  onLock: () => void;
  isUnlocking: boolean;
  isLocking: boolean;
}) {
  return (
    <div className="card h-full">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-accent-cyan" />
        <span className="stat-label">Operator Access</span>
        <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${
          !configured
            ? "bg-accent-red/15 text-accent-red"
            : authenticated
              ? "bg-accent-green/15 text-accent-green"
              : "bg-accent-yellow/15 text-accent-yellow"
        }`}>
          {!configured ? "UNAVAILABLE" : authenticated ? "UNLOCKED" : "LOCKED"}
        </span>
      </div>

      {!configured ? (
        <div className="text-sm text-text-muted">
          Configure `DASHBOARD_OPERATOR_SECRET`, `CONTROL_SECRET`, or `CONTROL_API_SECRET` to enable privileged dashboard actions.
        </div>
      ) : authenticated ? (
        <div className="space-y-3">
          <div className="text-sm text-text-muted">
            Privileged dashboard actions are enabled for this browser session.
          </div>
          <button
            onClick={onLock}
            disabled={isLocking}
            className="btn-ghost text-xs disabled:opacity-30"
          >
            {isLocking ? "Locking…" : "Lock Operator Access"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-text-muted">
            Enter the operator secret to unlock bot controls, manual trades, and profile changes.
          </div>
          <input
            type="password"
            value={operatorSecret}
            onChange={(e) => onOperatorSecretChange(e.target.value)}
            placeholder="Operator secret"
            className="input-base"
          />
          <button
            onClick={onUnlock}
            disabled={!operatorSecret.trim() || isUnlocking}
            className="btn-primary text-xs disabled:opacity-30"
          >
            {isUnlocking ? "Unlocking…" : "Unlock Operator Access"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProfilesSection({
  profiles,
  controlsLocked,
  controlsUnavailable,
}: {
  profiles: ConfigProfile[];
  controlsLocked: boolean;
  controlsUnavailable: boolean;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMode, setNewMode] = useState("DRY_RUN");

  const createMut = useMutation({
    mutationFn: (data: { name: string; description: string; mode: string; settings: Record<string, unknown> }) =>
      createProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ name, active }: { name: string; active: boolean }) => toggleProfile(name, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteProfile(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profiles"] }),
  });

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent-purple" />
          <span className="stat-label">Config Profiles</span>
          <span className="text-xs text-text-muted">({profiles.length})</span>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          disabled={controlsLocked || controlsUnavailable}
          className="btn-ghost text-xs flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {(controlsLocked || controlsUnavailable) && (
        <div className="text-[11px] text-text-muted mb-3">
          {controlsUnavailable
            ? "Profile changes are unavailable until a dashboard operator secret is configured."
            : "Profile changes are locked until operator access is unlocked."}
        </div>
      )}

      <AnimatePresence>
        {showCreate && !controlsLocked && !controlsUnavailable && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] as const }}
            className="overflow-hidden"
          >
            <div className="border border-bg-border rounded-lg p-3 mb-4 space-y-2.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Profile name"
                className="input-base"
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="input-base"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newMode}
                  onChange={(e) => setNewMode(e.target.value)}
                  className="input-base flex-1"
                >
                  <option value="DRY_RUN">Dry Run</option>
                  <option value="LIVE">Live</option>
                </select>
                <button
                  onClick={() => {
                    if (!newName.trim()) return;
                    toast.promise(
                      createMut.mutateAsync({ name: newName.trim(), description: newDesc, mode: newMode, settings: {} }),
                      { loading: "Creating profile…", success: "Profile created", error: "Failed to create profile" },
                    );
                  }}
                  disabled={controlsLocked || controlsUnavailable || !newName.trim() || createMut.isPending}
                  className="btn-primary text-xs disabled:opacity-30 whitespace-nowrap"
                >
                  Create
                </button>
                <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs">Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1.5">
        <AnimatePresence>
          {profiles.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-bg-border bg-bg-hover/30 hover:bg-bg-hover/60 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {p.isActive
                  ? <CircleCheck className="w-3.5 h-3.5 text-accent-green flex-shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                }
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                      p.mode === "LIVE"
                        ? "bg-accent-green/20 text-accent-green"
                        : "bg-accent-yellow/20 text-accent-yellow"
                    }`}>
                      {p.mode}
                    </span>
                  </div>
                  {p.description && (
                    <div className="text-xs text-text-muted truncate">{p.description}</div>
                  )}
                  <div className="text-[10px] text-text-muted">
                    Updated {timeAgo(p.updatedAt)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleMut.mutate({ name: p.name, active: !p.isActive })}
                  disabled={controlsLocked || controlsUnavailable}
                  className="btn-ghost p-1.5"
                  title={p.isActive ? "Deactivate" : "Activate"}
                >
                  {p.isActive
                    ? <ToggleRight className="w-4 h-4 text-accent-green" />
                    : <ToggleLeft className="w-4 h-4 text-text-muted" />
                  }
                </button>
                {p.name !== "default" && (
                  <button
                    onClick={() => toast.promise(
                      deleteMut.mutateAsync(p.name),
                      { loading: "Deleting…", success: "Profile deleted", error: "Failed to delete profile" },
                    )}
                    disabled={controlsLocked || controlsUnavailable}
                    className="btn-ghost p-1.5 text-accent-red/60 hover:text-accent-red"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {profiles.length === 0 && (
          <div className="text-text-muted text-sm py-4 text-center">No profiles yet</div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}
