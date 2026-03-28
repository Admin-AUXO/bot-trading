"use client";

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  ChevronDown,
  Layers3,
  Moon,
  Radio,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sun,
} from "lucide-react";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { ACTIVE_MODE_FILTER, ACTIVE_PROFILE_FILTER, ALL_TRADE_SOURCE_FILTER } from "@/lib/store";
import { getDashboardPageMeta } from "@/lib/page-meta";
import { cn, formatPercent, formatUsd, pnlClass, regimeBadge, strategyLabel, timeAgo } from "@/lib/utils";

const STRATEGY_FILTERS = [
  { value: "", label: "All strategies" },
  { value: "S1_COPY", label: strategyLabel("S1_COPY") },
  { value: "S2_GRADUATION", label: strategyLabel("S2_GRADUATION") },
  { value: "S3_MOMENTUM", label: strategyLabel("S3_MOMENTUM") },
] as const;

const MODE_FILTERS = [
  { value: ACTIVE_MODE_FILTER, label: "Active lane" },
  { value: "LIVE", label: "Live data" },
  { value: "DRY_RUN", label: "Simulation" },
] as const;

const TRADE_SOURCE_FILTERS = [
  { value: ALL_TRADE_SOURCE_FILTER, label: "All sources" },
  { value: "AUTO", label: "Auto only" },
  { value: "MANUAL", label: "Manual only" },
] as const;

export function Header() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const {
    selectedMode,
    setSelectedMode,
    selectedProfile,
    setSelectedProfile,
    selectedStrategy,
    setSelectedStrategy,
    selectedTradeSource,
    setSelectedTradeSource,
    activeScope,
    effectiveMode,
    effectiveProfile,
    profileOptions,
  } = useDashboardFilters();
  const {
    overview,
    heartbeat,
    connectionState,
    operatorAccess,
    openPnlUsd,
    openSlots,
    allPositions,
    deployedCapitalUsd,
    lastUpdatedAt,
    maxOpenPositions,
    worstQuota,
    pauseReasons,
  } = useDashboardShell();

  const pageMeta = getDashboardPageMeta(pathname);
  const regime = overview?.regime ? regimeBadge(overview.regime.regime) : null;
  const isRunning = overview?.isRunning ?? heartbeat?.isRunning ?? false;
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "awaiting sync";
  const runtimeModeLabel = activeScope?.mode === "LIVE" ? "Live" : activeScope?.mode === "DRY_RUN" ? "Simulation" : "Runtime";
  const analysisSummary = [
    effectiveMode === "LIVE" ? "Live history" : "Simulation history",
    effectiveProfile,
    selectedTradeSource === ALL_TRADE_SOURCE_FILTER ? "all sources" : selectedTradeSource.toLowerCase(),
  ].join(" · ");
  const selectedStrategyRuntimeCount = selectedStrategy
    ? allPositions.filter((position) => position.strategy === selectedStrategy).length
    : null;
  const analysisDiffersFromRuntime = activeScope != null && (
    effectiveMode !== activeScope.mode
    || effectiveProfile !== activeScope.configProfile
    || selectedTradeSource !== ALL_TRADE_SOURCE_FILTER
  );

  return (
    <header className="sticky top-0 z-40 border-b border-bg-border/80 bg-bg-secondary/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <BotStateBadge isRunning={isRunning} pauseReasons={pauseReasons} />
              <StatusChip
                icon={<Radio className="h-3.5 w-3.5" />}
                label={connectionState === "online" ? "Realtime" : connectionState === "degraded" ? "Cached" : "Offline"}
                tone={connectionState === "online" ? "positive" : connectionState === "degraded" ? "warning" : "danger"}
              />
              {regime ? <span className={`badge ${regime.class}`}>{regime.label}</span> : null}
              {activeScope ? (
                <StatusChip
                  icon={<Layers3 className="h-3.5 w-3.5" />}
                  label={`${runtimeModeLabel} / ${activeScope.configProfile}`}
                  tone={activeScope.mode === "LIVE" ? "positive" : "warning"}
                />
              ) : null}
              {worstQuota ? <QuotaChip service={worstQuota.service} status={worstQuota.quotaStatus} /> : null}
              <OperatorChip state={operatorAccess} />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-text-primary lg:text-lg">
                {pageMeta.title}
              </h1>
              <p className="max-w-3xl text-xs text-text-secondary lg:text-sm">
                {pageMeta.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
              <span>Updated {updatedLabel}</span>
              <span>{allPositions.length} open positions</span>
              {selectedStrategy && selectedStrategyRuntimeCount != null ? (
                <span>{selectedStrategyRuntimeCount} runtime {strategyLabel(selectedStrategy)} positions</span>
              ) : null}
              <span>{openSlots}/{maxOpenPositions} slots open</span>
              <span>Analysis {analysisSummary}</span>
              {analysisDiffersFromRuntime ? <span>Runtime metrics stay on the active lane</span> : null}
              {heartbeat?.lastTradeAt ? <span>Last trade {timeAgo(heartbeat.lastTradeAt)}</span> : null}
              {heartbeat?.lastSignalAt ? <span>Last signal {timeAgo(heartbeat.lastSignalAt)}</span> : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:min-w-[520px]">
            <HeaderMetric
              label="Capital"
              value={overview ? formatUsd(overview.capitalUsd) : "—"}
              sub={overview ? `${overview.capitalSol.toFixed(2)} SOL` : "Waiting for feed"}
            />
            <HeaderMetric
              label="Open P&L"
              value={formatUsd(openPnlUsd)}
              valueClass={pnlClass(openPnlUsd)}
              sub={`${allPositions.length} active positions`}
            />
            <HeaderMetric
              label="Capital Deployed"
              value={overview ? formatUsd(deployedCapitalUsd) : "—"}
              sub={overview ? `${Math.min(100, (deployedCapitalUsd / Math.max(overview.capitalUsd, 1)) * 100).toFixed(0)}% at work` : "No capital snapshot"}
            />
            <HeaderMetric
              label="Today Realized"
              value={overview ? formatUsd(overview.todayPnl) : "—"}
              valueClass={pnlClass(overview?.todayPnl ?? 0)}
              sub={`${openSlots} slots open`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-2">
            <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">Analysis Filters</div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterPillGroup
                items={MODE_FILTERS.map((filter) => ({
                  ...filter,
                  onClick: () => setSelectedMode(filter.value),
                  selected: selectedMode === filter.value,
                }))}
              />

              <HeaderSelect
                label="Profile"
                value={selectedProfile}
                onChange={(value) => setSelectedProfile(value)}
                options={[
                  {
                    value: ACTIVE_PROFILE_FILTER,
                    label: activeScope ? `Active profile (${activeScope.configProfile})` : "Active profile",
                  },
                  ...profileOptions.map((profile) => ({
                    value: profile.name,
                    label: profile.isActive ? `${profile.name} · active` : profile.name,
                  })),
                ]}
              />

              <FilterPillGroup
                items={TRADE_SOURCE_FILTERS.map((filter) => ({
                  ...filter,
                  onClick: () => setSelectedTradeSource(filter.value),
                  selected: selectedTradeSource === filter.value,
                }))}
              />
            </div>

            <FilterPillGroup
              items={STRATEGY_FILTERS.map((filter) => ({
                ...filter,
                onClick: () => setSelectedStrategy(filter.value || null),
                selected: (selectedStrategy ?? "") === filter.value,
              }))}
            />
          </div>

          <div className="flex items-center justify-between gap-3 xl:justify-end">
            <div className="text-right text-[11px] text-text-muted">
              {overview?.regime ? `SOL ${formatUsd(overview.regime.solPrice)} · ${formatPercent(overview.regime.solChange1h)} 1h` : "Awaiting regime feed"}
            </div>
            <button
              onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
              className="inline-flex items-center gap-2 rounded-lg border border-bg-border bg-bg-card/70 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              title="Toggle theme"
            >
              {resolvedTheme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              <span>{resolvedTheme === "light" ? "Dark" : "Light"} theme</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function BotStateBadge({ isRunning, pauseReasons }: { isRunning: boolean; pauseReasons: string[] }) {
  const primaryReason = pauseReasons[0] ?? "Bot paused";
  const extraCount = Math.max(0, pauseReasons.length - 1);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
        isRunning ? "bg-accent-green/12 text-accent-green" : "bg-accent-red/12 text-accent-red",
      )}
      title={!isRunning && pauseReasons.length > 0 ? pauseReasons.join(" · ") : undefined}
    >
      <span className="relative flex h-2.5 w-2.5 items-center justify-center">
        {isRunning ? (
          <>
            <motion.span
              className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-accent-green/70"
              animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0.2, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-green" />
          </>
        ) : (
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-accent-red" />
        )}
      </span>
      <span>{isRunning ? "Bot running" : extraCount > 0 ? `${primaryReason} +${extraCount}` : primaryReason}</span>
    </span>
  );
}

function OperatorChip({ state }: { state: "locked" | "unlocked" | "unavailable" }) {
  if (state === "unlocked") {
    return (
      <StatusChip
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        label="Operator unlocked"
        tone="positive"
      />
    );
  }

  if (state === "unavailable") {
    return (
      <StatusChip
        icon={<ShieldOff className="h-3.5 w-3.5" />}
        label="Operator unavailable"
        tone="danger"
      />
    );
  }

  return (
    <StatusChip
      icon={<ShieldAlert className="h-3.5 w-3.5" />}
      label="Operator locked"
      tone="warning"
    />
  );
}

function QuotaChip({ service, status }: { service: string; status: "HEALTHY" | "SOFT_LIMIT" | "HARD_LIMIT" | "PAUSED" }) {
  const tone = status === "HEALTHY" ? "positive" : status === "SOFT_LIMIT" ? "warning" : "danger";
  const label = status === "HEALTHY" ? `${service} healthy` : `${service} ${status.toLowerCase().replace("_", " ")}`;

  return (
    <StatusChip
      icon={<Layers3 className="h-3.5 w-3.5" />}
      label={label}
      tone={tone}
    />
  );
}

function StatusChip({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "positive" | "warning" | "danger";
}) {
  const toneClassName =
    tone === "positive"
      ? "border-accent-green/20 bg-accent-green/10 text-accent-green"
      : tone === "warning"
        ? "border-accent-yellow/20 bg-accent-yellow/10 text-accent-yellow"
        : "border-accent-red/20 bg-accent-red/10 text-accent-red";

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", toneClassName)}>
      {icon}
      <span>{label}</span>
    </span>
  );
}

function HeaderMetric({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-bg-border/80 bg-bg-card/65 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className={cn("mt-1 text-sm font-semibold tabular-nums text-text-primary", valueClass)}>{value}</div>
      <div className="mt-1 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

function FilterPillGroup({
  items,
}: {
  items: Array<{ value: string; label: string; onClick: () => void; selected: boolean }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-bg-border bg-bg-card/70 p-1">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={item.onClick}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs transition-colors",
            item.selected
              ? "bg-bg-hover text-text-primary"
              : "text-text-muted hover:bg-bg-hover hover:text-text-primary",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function HeaderSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="relative inline-flex min-w-[210px] items-center rounded-xl border border-bg-border bg-bg-card/70 px-3 py-2 text-xs text-text-secondary">
      <span className="pr-3 text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none bg-transparent pr-5 text-right text-text-primary outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-text-muted" />
    </label>
  );
}
