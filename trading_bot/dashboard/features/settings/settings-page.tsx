"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import {
  pauseBot, resumeBot,
  reconcileWallet, unlockOperatorSession, clearOperatorSession,
} from "@/lib/api";
import { apiUsageQueryOptions, dashboardQueryKeys, profilesQueryOptions } from "@/lib/dashboard-query-options";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { decorateBudgetSnapshots, formatApiEndpointUsageScope, getApiEndpointUsageKey, getApiUsageSnapshotRows } from "@/lib/api-usage";
import { invalidateRuntimeShellQueries } from "@/lib/query-invalidation";
import { formatUsd, formatNumber, timeAgo } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import {
  Power, Database, Shield, Wallet, Layers, Heart, AlertTriangle, Cpu, Activity,
  Target, TrendingDown, Clock, Gauge, RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { getLiveGuardrailRows } from "@/features/settings/profile-overrides";
import { ProfilesSection } from "@/features/settings/profiles-section";

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
  const {
    activeScope,
    connectionState,
    overview,
    heartbeat,
    allPositions: openPositions,
    operatorSession,
    strategyConfig: stratConfig,
    quotaSnapshots,
    maxOpenPositions,
    pauseReasons,
    worstQuota,
  } = useDashboardShell();
  const [operatorSecret, setOperatorSecret] = useState("");
  const { data: profiles } = useQuery(profilesQueryOptions());
  const apiUsageQuery = useQuery(apiUsageQueryOptions(14));
  const invalidateRuntimeShell = async () => {
    await invalidateRuntimeShellQueries(queryClient);
  };

  const pauseMutation = useMutation({
    mutationFn: pauseBot,
    onSuccess: invalidateRuntimeShell,
  });

  const resumeMutation = useMutation({
    mutationFn: resumeBot,
    onSuccess: invalidateRuntimeShell,
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

  const reconcileMutation = useMutation({
    mutationFn: reconcileWallet,
    onSuccess: invalidateRuntimeShell,
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
  if (pauseReasons.length > 0) {
    criticalAlerts.push(...pauseReasons);
  }

  const positionsByStrategy = openPositions?.reduce<Record<string, number>>((acc, p) => {
    acc[p.strategy] = (acc[p.strategy] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  const dailyLossPct = overview ? (overview.dailyLossUsd / overview.dailyLossLimit) * 100 : 0;
  const weeklyLossPct = overview ? (overview.weeklyLossUsd / overview.weeklyLossLimit) * 100 : 0;
  const detailedQuotaRows = getApiUsageSnapshotRows(apiUsageQuery.data);
  const currentQuota = decorateBudgetSnapshots(detailedQuotaRows.length > 0 ? detailedQuotaRows : quotaSnapshots);
  const monthlySummaryByService = new Map(
    (apiUsageQuery.data?.monthly ?? []).map((entry) => [entry.service, entry]),
  );
  const topQuotaEndpoints = apiUsageQuery.data?.topEndpoints.slice(0, 4) ?? [];
  const todayApiCalls = currentQuota.length > 0
    ? currentQuota.reduce((sum, snapshot) => sum + snapshot.totalCalls, 0)
    : apiUsageQuery.data?.daily?.reduce((sum, d) => sum + (d.totalCalls ?? 0), 0) ?? 0;
  const controlsLocked = operatorSession?.configured !== false && !operatorSession?.authenticated;
  const controlsUnavailable = operatorSession?.configured === false;
  const processHealthTone = connectionState === "online"
    ? "bg-accent-green/15 text-accent-green"
    : connectionState === "degraded"
      ? "bg-accent-yellow/15 text-accent-yellow"
      : "bg-accent-red/15 text-accent-red";
  const processHealthLabel = connectionState === "online"
    ? "ONLINE"
    : connectionState === "degraded"
      ? "DEGRADED"
      : "OFFLINE";

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
            {activeScope?.mode === "LIVE" ? "Live" : activeScope?.mode === "DRY_RUN" ? "Simulation" : "Runtime"} scope
            {activeScope ? ` · ${activeScope.configProfile}` : ""}
            {" · "}bot controls, quota pressure, and profile routing
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
          value={formatUsd(overview?.walletCapitalUsd ?? 0)}
          sub={`${(overview?.walletCapitalSol ?? 0).toFixed(3)} SOL`}
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
          value={`${openPositions?.length ?? 0} / ${maxOpenPositions}`}
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
              {pauseReasons.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-accent-yellow/20 bg-accent-yellow/10 px-3 py-2 text-xs text-accent-yellow">
                  {pauseReasons.map((reason) => (
                    <div key={reason} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}

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
                  <div className="text-text-muted text-xs">Profile</div>
                  <div className="font-medium text-sm">{activeScope?.configProfile ?? overview?.configProfile ?? "—"}</div>
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
              {activeScope?.mode === "LIVE" ? (
                <motion.button
                  onClick={() => toast.promise(reconcileMutation.mutateAsync(), {
                    loading: "Reconciling wallet balance…",
                    success: "Wallet reconciled",
                    error: "Wallet reconcile failed",
                  })}
                  disabled={controlsLocked || controlsUnavailable || reconcileMutation.isPending}
                  className="btn-ghost w-full text-xs disabled:opacity-30"
                  whileTap={{ scale: 0.97 }}
                >
                  <RefreshCcw className="mr-1 inline h-3.5 w-3.5" />
                  {reconcileMutation.isPending ? "Reconciling…" : "Reconcile Wallet"}
                </motion.button>
              ) : null}
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
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${processHealthTone}`}>
                {processHealthLabel}
              </span>
            </div>
            {heartbeat ? (
              <div className="space-y-2 text-sm">
                <HealthRow
                  icon={<Power className="w-3.5 h-3.5 text-text-muted" />}
                  label="Bot State"
                  value={heartbeat.isRunning ? "Running" : "Paused"}
                  sub={heartbeat.isRunning ? undefined : "trading paused"}
                  subClass={heartbeat.isRunning ? "text-accent-green" : "text-accent-yellow"}
                />
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
                  value={heartbeat.lastTradeAt ? timeAgo(heartbeat.lastTradeAt) : overview?.lastTradeAt ? timeAgo(overview.lastTradeAt) : "None"}
                />
                <HealthRow
                  icon={<Target className="w-3.5 h-3.5 text-text-muted" />}
                  label="Last Signal"
                  value={heartbeat.lastSignalAt ? timeAgo(heartbeat.lastSignalAt) : overview?.lastSignalAt ? timeAgo(overview.lastSignalAt) : "None"}
                />
                <HealthRow
                  icon={<Layers className="w-3.5 h-3.5 text-text-muted" />}
                  label="Runtime Scope"
                  value={activeScope ? `${activeScope.mode} / ${activeScope.configProfile}` : "Pending"}
                />
                {worstQuota ? (
                  <HealthRow
                    icon={<Gauge className="w-3.5 h-3.5 text-text-muted" />}
                    label="Quota"
                    value={`${worstQuota.service} ${worstQuota.quotaStatus}`}
                    sub={worstQuota.pauseReason ?? undefined}
                    subClass={worstQuota.quotaStatus === "HEALTHY" ? "text-accent-green" : worstQuota.quotaStatus === "SOFT_LIMIT" ? "text-accent-yellow" : "text-accent-red"}
                  />
                ) : null}
                <div className="pt-2 border-t border-bg-border">
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-xs">Today API Calls</span>
                    <span className="font-medium text-xs">{formatNumber(todayApiCalls)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-text-muted text-sm">
                {connectionState === "offline" ? "Backend unavailable." : "Loading…"}
              </div>
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
          <div className="mb-3 text-[11px] text-text-muted">
            Runtime truth for the active lane. LIVE-only entry guardrails are shown here so the operator can see exactly what blocks stale or low-information buys.
          </div>
          {stratConfig ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(stratConfig.strategies).map(([key, cfg]) => {
                const active = positionsByStrategy[key] ?? 0;
                const liveSizeChanged = Math.abs(cfg.effectivePositionSize - cfg.configuredPositionSize) > 0.0001;
                const liveGuardrails = getLiveGuardrailRows(key, cfg);
                return (
                  <div key={key} className={`card card-hover border-l-2 ${STRATEGY_BORDER[key] ?? ""}`}>
                    <div className={`font-bold text-base mb-3 ${STRATEGY_COLORS[key] ?? ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{STRATEGY_LABELS[key] ?? key}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          cfg.enabled ? "bg-accent-green/15 text-accent-green" : "bg-accent-yellow/15 text-accent-yellow"
                        }`}>
                          {cfg.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
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
                        <Row label="Base Size" value={`${cfg.configuredPositionSize} SOL`} />
                        <Row
                          label="Live Size"
                          value={`${cfg.effectivePositionSize} SOL${liveSizeChanged ? " *" : ""}`}
                        />
                        <Row label="Stop Loss" value={`${cfg.stopLoss}%`} />
                        <Row label="Time Stop" value={`${cfg.timeStopMinutes}m`} />
                        <Row label="Max Slip" value={`${cfg.maxSlippageBps} bps`} />
                        <Row label="Hard Limit" value={cfg.timeLimitMinutes ? `${cfg.timeLimitMinutes}m` : "—"} />
                      </div>
                      <div className="pt-2 mt-1 border-t border-bg-border space-y-1">
                        <div className="text-text-muted font-medium text-[10px] uppercase tracking-wider mb-1">Exit Targets</div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">T1</span>
                          <span className="text-accent-green font-medium">
                            +{cfg.exitPlan.tp1ThresholdPct}% ({cfg.exitPlan.tp1SizePct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">T2</span>
                          <span className="text-accent-green font-medium">
                            +{cfg.exitPlan.tp2ThresholdPct}% ({cfg.exitPlan.tp2SizePct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Runner</span>
                          <span className="text-text-secondary">
                            Trail {cfg.exitPlan.trailingStopPercent}% ({cfg.exitPlan.runnerSizePct.toFixed(1)}%)
                          </span>
                        </div>
                        {liveSizeChanged && (
                          <div className="pt-1 text-[10px] text-text-muted">
                            * Regime/capital adjusted from the configured base size.
                          </div>
                        )}
                      </div>
                      {liveGuardrails.length > 0 && (
                        <div className="pt-2 mt-1 border-t border-bg-border space-y-1.5">
                          <div className="text-text-muted font-medium text-[10px] uppercase tracking-wider">
                            Live Entry Guardrails
                          </div>
                          {liveGuardrails.map((guardrail) => (
                            <div key={`${key}-${guardrail.label}`} className="flex items-center justify-between gap-3">
                              <span className="text-text-muted">{guardrail.label}</span>
                              <span className={
                                guardrail.tone === "safe"
                                  ? "font-medium text-accent-green"
                                  : guardrail.tone === "warn"
                                    ? "font-medium text-accent-yellow"
                                    : "font-medium text-text-secondary"
                              }>
                                {guardrail.value}
                              </span>
                            </div>
                          ))}
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
                  <Row label="Wallet Balance" value={`${(overview.walletCapitalSol ?? 0).toFixed(4)} SOL`} />
                  <Row label="Available Balance" value={`${(overview.walletBalance ?? 0).toFixed(4)} SOL`} />
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
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-accent-green" />
                <span className="stat-label">API Quota</span>
              </div>
              <Link href="/quota" className="text-[11px] font-medium text-accent-blue transition-colors hover:text-accent-cyan">
                Open quota page
              </Link>
            </div>
            <div className="space-y-4">
              {currentQuota.map((snapshot) => {
                const summary = monthlySummaryByService.get(snapshot.service);
                const monthlyTone = snapshot.quotaStatus === "HEALTHY"
                  ? "text-accent-green"
                  : snapshot.quotaStatus === "SOFT_LIMIT"
                    ? "text-accent-yellow"
                    : "text-accent-red";

                return (
                  <div key={snapshot.service} className="rounded-xl border border-bg-border/80 bg-bg-hover/35 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{snapshot.service}</span>
                      <span className={`text-xs font-medium ${monthlyTone}`}>
                        {snapshot.quotaStatus}
                      </span>
                    </div>
                    <div className="mt-2 h-2 bg-bg-border rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          snapshot.quotaStatus === "HEALTHY"
                            ? "bg-accent-green"
                            : snapshot.quotaStatus === "SOFT_LIMIT"
                              ? "bg-accent-yellow"
                              : "bg-accent-red"
                        }`}
                        style={{ transformOrigin: "left" }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: Math.min(snapshot.monthlyPct, 100) / 100 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-muted">
                      <div>{formatNumber(snapshot.monthlyUsed)} / {formatNumber(snapshot.budgetTotal)} credits</div>
                      <div className="text-right">{snapshot.monthlyPct.toFixed(1)}% month</div>
                      <div>Today {formatNumber(snapshot.dailyUsed)} / {formatNumber(snapshot.dailyBudget)}</div>
                      <div className="text-right">{snapshot.dailyPct.toFixed(0)}% day</div>
                      <div>Essential {formatNumber(snapshot.essentialCredits)}</div>
                      <div className="text-right">Non-essential {formatNumber(snapshot.nonEssentialCredits)}</div>
                      <div>Cached {formatNumber(snapshot.cachedCalls)} calls</div>
                      <div className="text-right">{snapshot.avgCreditsPerCall.toFixed(1)} cr/call</div>
                      <div>Monthly calls {formatNumber(summary?.totalCalls ?? snapshot.totalCalls)}</div>
                      <div className="text-right">Errors {formatNumber(summary?.totalErrors ?? 0)}</div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-text-muted">
                      <div className="flex items-center justify-between gap-3">
                        <span>Quota source</span>
                        <span className="font-medium text-text-primary">{snapshot.quotaSource}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Cycle end</span>
                        <span className="font-medium text-text-primary">
                          {snapshot.providerCycleEnd ? new Date(snapshot.providerCycleEnd).toLocaleDateString() : "Calendar month"}
                        </span>
                      </div>
                    </div>
                    {snapshot.pauseReason ? (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-[11px] text-accent-yellow">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>{snapshot.pauseReason}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {topQuotaEndpoints.length ? (
                <div className="rounded-xl border border-bg-border/80 bg-bg-hover/25 p-3">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Global Top Endpoint Spenders</div>
                  <div className="mt-3 space-y-2">
                    {topQuotaEndpoints.map((endpoint) => (
                      <div
                        key={getApiEndpointUsageKey(endpoint)}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-text-primary">
                            {endpoint.service} · {endpoint.endpoint}
                          </div>
                          <div className="truncate text-text-muted">
                            {formatApiEndpointUsageScope(endpoint)}
                          </div>
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
              {!currentQuota.length && (
                <div className="text-text-muted text-sm">No quota telemetry yet</div>
              )}
            </div>
          </div>
        </ErrorBoundary>

        <ErrorBoundary>
          <ProfilesSection
            profiles={profiles ?? []}
            controlsLocked={controlsLocked}
            controlsUnavailable={controlsUnavailable}
            activeScope={activeScope ?? null}
            openPositionCount={openPositions?.length ?? 0}
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
