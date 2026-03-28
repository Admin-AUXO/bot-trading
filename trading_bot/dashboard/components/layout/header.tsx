"use client";

import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  Layers3,
  Moon,
  Radio,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sun,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { getDashboardPageMeta } from "@/lib/page-meta";
import { cn, formatUsd, pnlClass, regimeBadge, strategyLabel, timeAgo } from "@/lib/utils";

const STRATEGY_FILTERS = [
  { value: "", label: "All strategies" },
  { value: "S1_COPY", label: strategyLabel("S1_COPY") },
  { value: "S2_GRADUATION", label: strategyLabel("S2_GRADUATION") },
  { value: "S3_MOMENTUM", label: strategyLabel("S3_MOMENTUM") },
] as const;

export function Header() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const { setMode, setSelectedStrategy } = useDashboardStore();
  const {
    mode,
    selectedStrategy,
    overview,
    heartbeat,
    connectionState,
    operatorAccess,
    openPnlUsd,
    openSlots,
    allPositions,
    filteredPositions,
    deployedCapitalUsd,
    lastUpdatedAt,
  } = useDashboardShell();

  const pageMeta = getDashboardPageMeta(pathname);
  const regime = overview?.regime ? regimeBadge(overview.regime.regime) : null;
  const isRunning = overview?.isRunning ?? heartbeat?.isRunning ?? false;
  const updatedLabel = lastUpdatedAt ? timeAgo(new Date(lastUpdatedAt)) : "awaiting sync";

  return (
    <header className="sticky top-0 z-40 border-b border-bg-border/80 bg-bg-secondary/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <BotStateBadge isRunning={isRunning} pauseReason={overview?.pauseReason ?? null} />
              <StatusChip
                icon={<Radio className="h-3.5 w-3.5" />}
                label={connectionState === "online" ? "Realtime" : connectionState === "degraded" ? "Cached" : "Offline"}
                tone={connectionState === "online" ? "positive" : connectionState === "degraded" ? "warning" : "danger"}
              />
              {regime ? <span className={`badge ${regime.class}`}>{regime.label}</span> : null}
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
              <span>{filteredPositions.length} in focus</span>
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

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-bg-border bg-bg-card/70 p-1">
              {(["LIVE", "DRY_RUN"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    mode === value
                      ? value === "LIVE"
                        ? "bg-accent-green/15 text-accent-green"
                        : "bg-accent-yellow/15 text-accent-yellow"
                      : "text-text-muted hover:bg-bg-hover hover:text-text-primary",
                  )}
                >
                  {value === "LIVE" ? "Live mode" : "Simulation"}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-bg-border bg-bg-card/70 p-1">
              {STRATEGY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setSelectedStrategy(filter.value || null)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                    (selectedStrategy ?? "") === filter.value
                      ? "bg-bg-hover text-text-primary"
                      : "text-text-muted hover:bg-bg-hover hover:text-text-primary",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 xl:justify-end">
            <div className="text-right text-[11px] text-text-muted">
              {overview?.regime ? `SOL ${formatUsd(overview.regime.solPrice)}` : "Awaiting regime feed"}
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

function BotStateBadge({ isRunning, pauseReason }: { isRunning: boolean; pauseReason: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium",
        isRunning ? "bg-accent-green/12 text-accent-green" : "bg-accent-red/12 text-accent-red",
      )}
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
      <span>{isRunning ? "Bot running" : pauseReason ?? "Bot paused"}</span>
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
    <div className="rounded-xl border border-bg-border bg-bg-card/70 px-3 py-2.5">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums text-text-primary lg:text-base", valueClass)}>
        {value}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-text-muted">
        <Layers3 className="h-3 w-3" />
        <span>{sub}</span>
      </div>
    </div>
  );
}
