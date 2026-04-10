"use client";

import clsx from "clsx";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import {
  Activity,
  BarChart3,
  CandlestickChart,
  ChevronRight,
  Clock3,
  FlaskConical,
  RadioTower,
  Settings2,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { fetchJson } from "@/lib/api";
import { formatCompactCurrency, formatCurrency, formatInteger, formatTimestamp } from "@/lib/format";
import type { StatusPayload } from "@/lib/types";

const nav: Array<{ href: Route; label: string; detail: string; icon: React.ComponentType<{ className?: string }> }> = [
  { href: "/", label: "Overview", detail: "Runtime truth first", icon: Activity },
  { href: "/research", label: "Research", detail: "Bounded dry-run evidence", icon: FlaskConical },
  { href: "/candidates", label: "Candidates", detail: "Filter evidence and payload trail", icon: CandlestickChart },
  { href: "/positions", label: "Positions", detail: "Exposure and realized edge", icon: BarChart3 },
  { href: "/telemetry", label: "Telemetry", detail: "Provider pressure and quota burn", icon: RadioTower },
  { href: "/settings", label: "Settings", detail: "Runtime tuning and guardrails", icon: Settings2 },
];

const pageMeta: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Overview",
    description: "Runtime truth, provider burn, and current exposure in the same viewport.",
  },
  "/research": {
    title: "Research",
    description: "Bounded dry-run sessions, shortlisted tokens, and mock-position outcomes without polluting the live desk.",
  },
  "/candidates": {
    title: "Candidates",
    description: "Signal evidence, normalized filter state, and raw payloads without log archaeology.",
  },
  "/positions": {
    title: "Positions",
    description: "Open risk, realized edge, and the fill trail that created it.",
  },
  "/telemetry": {
    title: "Telemetry",
    description: "Provider cost, trigger shape, and the filter spine behind the lane.",
  },
  "/settings": {
    title: "Settings",
    description: "Runtime config and guardrails. Tune the bot here, diagnose it elsewhere.",
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);

  const refreshShell = useEffectEvent(async () => {
    try {
      const next = await fetchJson<StatusPayload>("/status");
      setStatus(next);
      setLastUpdatedAt(new Date());
      setShellError(null);
    } catch (error) {
      setShellError(error instanceof Error ? error.message : "shell refresh failed");
    }
  });

  useEffect(() => {
    void refreshShell();
    const timer = window.setInterval(() => void refreshShell(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshShell]);

  const activePage = pageMeta[pathname] ?? pageMeta["/"];
  const paused = Boolean(status?.botState.pauseReason);
  const isResearchMode = status?.botState.tradeMode === "DRY_RUN";
  const activeResearchRun = status?.research?.activeRun ?? null;
  const latestResearchRun = status?.research?.latestCompletedRun ?? null;
  const headlineResearchRun = activeResearchRun ?? latestResearchRun;
  const maxOpenPositions = status?.settings.capital.maxOpenPositions ?? 0;
  const openPositions = status?.openPositions ?? 0;
  const queuedCandidates = status?.queuedCandidates ?? 0;
  const researchMaxPositions = status?.settings.research.maxMockPositions ?? 0;
  const researchOpenPositions = headlineResearchRun
    ? Math.max(headlineResearchRun.totalMockOpened - headlineResearchRun.totalMockClosed, 0)
    : 0;

  return (
    <div className="min-h-screen bg-bg-primary">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-bg-border/80 bg-bg-secondary/96 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="border-b border-bg-border px-4 py-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-accent-green" />
            <div>
              <div className="text-sm font-semibold tracking-[0.18em] text-text-primary">TRADING BOT V2</div>
              <div className="text-[11px] text-text-muted">Graduation desk</div>
            </div>
          </div>

          <div className="mt-4 panel-muted rounded-2xl p-3">
            <div className="section-kicker">Runtime Desk</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              {status
                ? `${status.botState.tradeMode} / ${isResearchMode ? "RESEARCH_DRY_RUN" : "S2_GRADUATION"}`
                : "Waiting for runtime scope"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SidebarStat
                label={isResearchMode ? "Mock open" : "Open risk"}
                value={isResearchMode ? `${researchOpenPositions}/${researchMaxPositions || "—"}` : `${openPositions}/${maxOpenPositions || "—"}`}
              />
              <SidebarStat
                label={isResearchMode ? "Run PnL" : "Cash"}
                value={status ? (isResearchMode ? formatCompactCurrency(headlineResearchRun?.realizedPnlUsd ?? 0) : formatCompactCurrency(status.botState.cashUsd)) : "—"}
              />
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-text-muted">
                <span>{isResearchMode ? "Research cap" : "Capacity"}</span>
                <span className={(isResearchMode ? researchOpenPositions >= researchMaxPositions : openPositions >= maxOpenPositions) && (isResearchMode ? researchMaxPositions : maxOpenPositions) > 0 ? "text-accent-red" : "text-text-primary"}>
                  {isResearchMode
                    ? researchMaxPositions > 0 ? `${Math.max(researchMaxPositions - researchOpenPositions, 0)} left` : "pending"
                    : maxOpenPositions > 0 ? `${Math.max(maxOpenPositions - openPositions, 0)} open` : "pending"}
                </span>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: Math.max(isResearchMode ? researchMaxPositions : maxOpenPositions, 5) }).map((_, index) => (
                  <div
                    key={index}
                    className={clsx(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      index < (isResearchMode ? researchOpenPositions : openPositions) ? "bg-accent-green" : "bg-bg-border",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 panel-muted rounded-2xl p-3">
            <div className="section-kicker">Desk Status</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <ShellChip
                label={isResearchMode ? (activeResearchRun ? "Run active" : "Manual start") : (paused ? "Paused" : "Running")}
                tone={isResearchMode ? (activeResearchRun ? "positive" : "warning") : (paused ? "warning" : "positive")}
              />
              <ShellChip
                label={status?.botState.tradeMode ?? "Waiting"}
                tone={status?.botState.tradeMode === "LIVE" ? "positive" : "warning"}
              />
              <ShellChip label={isResearchMode ? `${formatInteger(headlineResearchRun?.totalDiscovered ?? 0)} discovered` : `${formatInteger(queuedCandidates)} queued`} tone="default" />
            </div>
            {isResearchMode ? (
              <div className="mt-2 text-[11px] leading-5 text-text-muted">
                {activeResearchRun
                  ? `Polling every ${Math.round(activeResearchRun.pollIntervalMs / 1000)}s with a ${Math.round(activeResearchRun.maxDurationMs / 60000)}m cap.`
                  : latestResearchRun
                    ? `Latest run closed at ${formatTimestamp(latestResearchRun.completedAt)}.`
                    : "No research run has been launched yet."}
              </div>
            ) : status?.botState.pauseReason ? (
              <div className="mt-2 text-[11px] leading-5 text-text-muted">{status.botState.pauseReason}</div>
            ) : status?.entryGate.reason ? (
              <div className="mt-2 text-[11px] leading-5 text-text-muted">{status.entryGate.reason}</div>
            ) : (
              <div className="mt-2 text-[11px] leading-5 text-text-muted">No runtime blocker recorded.</div>
            )}
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          <div className="px-2 pb-2 text-[10px] uppercase tracking-[0.18em] text-text-muted">Navigation</div>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "group flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors",
                  active
                    ? "border border-accent-blue/15 bg-accent-blue/10 text-text-primary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="truncate text-[11px] text-text-muted">{item.detail}</div>
                  </div>
                </div>
                <ChevronRight className={clsx("h-4 w-4 transition", active ? "text-accent-blue" : "text-transparent group-hover:text-text-muted")} />
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-bg-border px-3 py-3">
          <div className="panel-muted rounded-2xl p-3">
            <div className="section-kicker">Lane Notes</div>
            <div className="mt-1 text-sm font-medium text-text-primary">S2 only</div>
            <div className="mt-1 text-[11px] leading-5 text-text-muted">
              The shell stays tight on runtime truth. Heavy history belongs in the deeper pages and Grafana.
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-bg-border/80 bg-bg-secondary/90 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-3 lg:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <ShellChip
                label={isResearchMode ? (activeResearchRun ? "Run active" : "Manual start") : (paused ? "Paused" : "Running")}
                tone={isResearchMode ? (activeResearchRun ? "positive" : "warning") : (paused ? "warning" : "positive")}
              />
              <ShellChip label={status?.botState.tradeMode ?? "Waiting"} tone={status?.botState.tradeMode === "LIVE" ? "positive" : "warning"} />
              <ShellChip label={isResearchMode ? `${formatInteger(researchOpenPositions)} mock open` : `${formatInteger(openPositions)} open`} tone="default" />
              <ShellChip label={isResearchMode ? `${formatInteger(headlineResearchRun?.totalEvaluated ?? 0)} evaluated` : `${formatInteger(queuedCandidates)} queued`} tone="default" />
              {shellError ? <ShellChip label="Shell degraded" tone="danger" /> : null}
            </div>

            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-base font-semibold tracking-tight text-text-primary lg:text-lg">
                  {activePage.title}
                </h1>
                <p className="max-w-3xl text-xs text-text-secondary lg:text-sm">
                  {activePage.description}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="meta-chip">
                    <Clock3 className="h-3 w-3" />
                    Updated {lastUpdatedAt ? formatTimestamp(lastUpdatedAt) : "awaiting sync"}
                  </span>
                  {status?.botState.lastDiscoveryAt ? (
                    <span className="meta-chip">Discovery {formatTimestamp(status.botState.lastDiscoveryAt)}</span>
                  ) : null}
                  {status?.botState.lastEvaluationAt ? (
                    <span className="meta-chip">Evaluation {formatTimestamp(status.botState.lastEvaluationAt)}</span>
                  ) : null}
                  {status?.botState.lastExitCheckAt ? (
                    <span className="meta-chip">Exit {formatTimestamp(status.botState.lastExitCheckAt)}</span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 xl:min-w-[430px]">
                <HeaderMetric
                  label={isResearchMode ? "Mock open" : "Cash"}
                  value={status ? (isResearchMode ? `${formatInteger(researchOpenPositions)}/${formatInteger(researchMaxPositions || 0)}` : formatCurrency(status.botState.cashUsd)) : "—"}
                  sub={status ? (isResearchMode ? "Research position cap" : `Capital ${formatCurrency(status.botState.capitalUsd)}`) : "Waiting for feed"}
                  icon={Wallet}
                />
                <HeaderMetric
                  label={isResearchMode ? "Run PnL" : "Realized"}
                  value={status ? (isResearchMode ? formatCompactCurrency(headlineResearchRun?.realizedPnlUsd ?? 0) : formatCompactCurrency(status.botState.realizedPnlUsd)) : "—"}
                  sub={isResearchMode ? "Latest research outcome" : "Closed-position edge"}
                  icon={BarChart3}
                />
                <HeaderMetric
                  label={isResearchMode ? "Provider burn" : "Pressure"}
                  value={status ? (isResearchMode ? `${formatInteger(headlineResearchRun?.birdeyeUnitsUsed ?? 0)}/${formatInteger(headlineResearchRun?.birdeyeUnitCap ?? status.settings.research.birdeyeUnitCap)}` : `${formatInteger(openPositions)}/${formatInteger(maxOpenPositions)}`) : "—"}
                  sub={isResearchMode ? `${formatInteger(headlineResearchRun?.heliusUnitsUsed ?? 0)}/${formatInteger(headlineResearchRun?.heliusUnitCap ?? status?.settings.research.heliusUnitCap ?? 0)} Helius` : `${formatInteger(queuedCandidates)} queued`}
                  icon={ShieldAlert}
                />
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 lg:px-6 lg:py-6">
          <div className="mx-auto mb-4 overflow-auto pb-1 lg:hidden">
            <div className="flex min-w-max gap-2">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex min-w-[11rem] items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                      active
                        ? "border-accent-blue/20 bg-accent-blue/10 text-text-primary"
                        : "border-bg-border bg-bg-card/60 text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="min-w-0">
                      <div>{item.label}</div>
                      <div className="truncate text-[11px] text-text-muted">{item.detail}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[1680px]">{children}</div>
        </main>

        <footer className="border-t border-bg-border/80 bg-bg-secondary/70">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-2 px-4 py-2 text-[10px] text-text-muted lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className={paused ? "text-accent-yellow" : "text-accent-green"}>
                {paused ? "paused" : "running"}
              </span>
              <span>{status?.botState.tradeMode ?? "waiting"}</span>
              {shellError ? <span className="text-accent-red">{shellError}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:justify-end">
              {status?.botState.lastDiscoveryAt ? <span>Discovery {formatTimestamp(status.botState.lastDiscoveryAt)}</span> : null}
              {status?.botState.lastEvaluationAt ? <span>Evaluation {formatTimestamp(status.botState.lastEvaluationAt)}</span> : null}
              {status?.botState.lastExitCheckAt ? <span>Exit {formatTimestamp(status.botState.lastExitCheckAt)}</span> : null}
              <span>Updated {lastUpdatedAt ? formatTimestamp(lastUpdatedAt) : "awaiting sync"}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="micro-stat">
      <div className="micro-stat-label">{label}</div>
      <div className="micro-stat-value font-mono">{value}</div>
    </div>
  );
}

function HeaderMetric(props: {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const Icon = props.icon;

  return (
    <div className="micro-stat">
      <div className="flex items-center justify-between gap-2">
        <div className="micro-stat-label">{props.label}</div>
        <Icon className="h-3.5 w-3.5 text-accent-blue" />
      </div>
      <div className="micro-stat-value font-mono">{props.value}</div>
      <div className="mt-1 text-[11px] text-text-muted">{props.sub}</div>
    </div>
  );
}

function ShellChip(props: {
  label: string;
  tone: "positive" | "warning" | "danger" | "default";
}) {
  const toneClass =
    props.tone === "positive"
      ? "border-accent-green/20 bg-accent-green/10 text-accent-green"
      : props.tone === "warning"
        ? "border-accent-yellow/20 bg-accent-yellow/10 text-accent-yellow"
        : props.tone === "danger"
          ? "border-accent-red/20 bg-accent-red/10 text-accent-red"
          : "border-bg-border/80 bg-bg-card/70 text-text-secondary";

  return <span className={clsx("meta-chip", toneClass)}>{props.label}</span>;
}
