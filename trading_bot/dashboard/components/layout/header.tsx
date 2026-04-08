"use client";

import type { ReactNode } from "react";
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
import { cn, formatUsd, pnlClass, regimeBadge, strategyLabel, timeAgo } from "@/lib/utils";

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
    lastUpdatedAt,
    maxOpenPositions,
    worstQuota,
    pauseReasons,
  } = useDashboardShell();

  const pageMeta = getDashboardPageMeta(pathname);
  const regime = overview?.regime ? regimeBadge(overview.regime.regime) : null;
  const isRunning = overview?.isRunning ?? heartbeat?.isRunning ?? false;
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "awaiting sync";
  const runtimeModeLabel =
    activeScope?.mode === "LIVE"
      ? "Live"
      : activeScope?.mode === "DRY_RUN"
        ? "Simulation"
        : "Runtime";
  const runtimeLabel = activeScope ? `${runtimeModeLabel} / ${activeScope.configProfile}` : "Runtime pending";
  const analysisLabel = effectiveMode && effectiveProfile
    ? `${effectiveMode === "LIVE" ? "Live" : "Simulation"} / ${effectiveProfile}`
    : "Analysis pending";
  const analysisDiffersFromRuntime = activeScope != null && (
    effectiveMode !== activeScope.mode
    || effectiveProfile !== activeScope.configProfile
    || selectedTradeSource !== ALL_TRADE_SOURCE_FILTER
  );
  const selectedStrategyRuntimeCount = selectedStrategy
    ? allPositions.filter((position) => position.strategy === selectedStrategy).length
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-bg-border/80 bg-bg-secondary/88 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <BotStateBadge isRunning={isRunning} pauseReasons={pauseReasons} />
          <StatusChip
            icon={<Radio className="h-3.5 w-3.5" />}
            label={
              connectionState === "online"
                ? "Realtime"
                : connectionState === "degraded"
                  ? "Cached"
                  : "Offline"
            }
            tone={connectionState === "online" ? "positive" : connectionState === "degraded" ? "warning" : "danger"}
          />
          {regime ? <span className={`badge ${regime.class}`}>{regime.label}</span> : null}
          {activeScope ? (
            <StatusChip
              icon={<Layers3 className="h-3.5 w-3.5" />}
              label={runtimeLabel}
              tone={activeScope.mode === "LIVE" ? "positive" : "warning"}
            />
          ) : null}
          {worstQuota ? <QuotaChip service={worstQuota.service} status={worstQuota.quotaStatus} /> : null}
          {pauseReasons.length > 0 ? (
            <StatusChip
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              label={`${pauseReasons.length} blocker${pauseReasons.length > 1 ? "s" : ""}`}
              tone="warning"
            />
          ) : null}
          <OperatorChip state={operatorAccess} />
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-text-primary lg:text-lg">
                {pageMeta.title}
              </h1>
              <p className="max-w-3xl text-xs text-text-secondary lg:text-sm">
                {pageMeta.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <MetaChip label={`Updated ${updatedLabel}`} />
              <MetaChip label={`Analysis ${analysisLabel}`} />
              {selectedStrategy ? (
                <MetaChip label={`${strategyLabel(selectedStrategy)} focus`} />
              ) : null}
              {selectedTradeSource !== ALL_TRADE_SOURCE_FILTER ? (
                <MetaChip label={`${selectedTradeSource.toLowerCase()} fills only`} tone="warning" />
              ) : null}
              {analysisDiffersFromRuntime ? (
                <MetaChip label={`Runtime fixed to ${runtimeLabel}`} tone="warning" />
              ) : null}
              {heartbeat?.lastTradeAt ? <MetaChip label={`Trade ${timeAgo(heartbeat.lastTradeAt)}`} /> : null}
              {heartbeat?.lastSignalAt ? <MetaChip label={`Signal ${timeAgo(heartbeat.lastSignalAt)}`} /> : null}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 xl:min-w-[430px]">
            <CompactMetric
              label="Wallet"
              value={overview ? formatUsd(overview.walletCapitalUsd) : "—"}
              sub={overview ? `${overview.walletCapitalSol.toFixed(2)} SOL` : "Waiting for feed"}
            />
            <CompactMetric
              label="Open P&L"
              value={formatUsd(openPnlUsd)}
              sub={`${allPositions.length} live position${allPositions.length === 1 ? "" : "s"}`}
              valueClass={pnlClass(openPnlUsd)}
            />
            <CompactMetric
              label="Slots Open"
              value={String(openSlots)}
              sub={`${maxOpenPositions - openSlots}/${maxOpenPositions} used`}
            />
          </div>
        </div>

        <div className="rounded-xl border border-bg-border/80 bg-bg-card/60 p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="section-kicker">Analysis Controls</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
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

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <FilterPillGroup
                  items={STRATEGY_FILTERS.map((filter) => ({
                    ...filter,
                    onClick: () => setSelectedStrategy(filter.value || null),
                    selected: (selectedStrategy ?? "") === filter.value,
                  }))}
                />

                {selectedStrategy && selectedStrategyRuntimeCount != null ? (
                  <MetaChip
                    label={`${selectedStrategyRuntimeCount} runtime ${strategyLabel(selectedStrategy).toLowerCase()} position${selectedStrategyRuntimeCount === 1 ? "" : "s"}`}
                  />
                ) : null}
              </div>
            </div>

            <button
              onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-bg-border bg-bg-card/80 px-3 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary xl:self-center"
              title="Toggle theme"
            >
              {resolvedTheme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{resolvedTheme === "light" ? "Dark" : "Light"} theme</span>
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
  icon: ReactNode;
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

function CompactMetric({
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
    <div className="micro-stat">
      <div className="micro-stat-label">{label}</div>
      <div className={cn("micro-stat-value", valueClass)}>{value}</div>
      <div className="mt-1 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

function MetaChip({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "warning";
}) {
  return (
    <span className={cn("meta-chip", tone === "warning" ? "border-accent-yellow/20 bg-accent-yellow/8 text-accent-yellow" : "")}>
      {label}
    </span>
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
