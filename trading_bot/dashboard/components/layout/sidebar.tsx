"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Crosshair,
  Gauge,
  LayoutDashboard,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { useDashboardFilters } from "@/hooks/use-dashboard-filters";
import { useDashboardShell } from "@/hooks/use-dashboard-shell";
import { useDashboardStore } from "@/lib/store";
import { ALL_TRADE_SOURCE_FILTER } from "@/lib/store";
import { cn, formatUsd, pnlClass, strategyLabel } from "@/lib/utils";

const SIDEBAR_WIDTH = 256;

const navItems = [
  {
    href: "/",
    label: "Overview",
    description: "System state and exposure",
    icon: LayoutDashboard,
    key: "1",
  },
  {
    href: "/positions",
    label: "Positions",
    description: "Open risk and skipped capacity",
    icon: Crosshair,
    key: "2",
  },
  {
    href: "/trades",
    label: "Trades",
    description: "Execution and signal history",
    icon: ArrowLeftRight,
    key: "3",
  },
  {
    href: "/analytics",
    label: "Analytics",
    description: "Expectancy and edge leakage",
    icon: BarChart3,
    key: "4",
  },
  {
    href: "/quota",
    label: "API Quota",
    description: "Provider runway and spenders",
    icon: Gauge,
    key: "5",
  },
  {
    href: "/settings",
    label: "Settings",
    description: "Controls and profiles",
    icon: Settings,
    key: "6",
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useDashboardStore();
  const {
    selectedStrategy,
    setSelectedStrategy,
    activeScope,
    effectiveMode,
    effectiveProfile,
    selectedTradeSource,
  } = useDashboardFilters();
  const {
    allPositions,
    openPnlUsd,
    deployedCapitalUsd,
    activeStrategiesCount,
    operatorAccess,
    maxOpenPositions,
    pauseReasons,
    worstQuota,
  } = useDashboardShell();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <>
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-3 top-3 z-50 rounded-xl border border-bg-border bg-bg-card/90 p-2 text-text-primary shadow-lg lg:hidden"
        aria-label="Open sidebar"
      >
        <Menu className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {sidebarOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/45 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: isDesktop || sidebarOpen ? 0 : -SIDEBAR_WIDTH }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-bg-border/80 bg-bg-secondary/92 backdrop-blur-xl lg:translate-x-0"
      >
        <div className="border-b border-bg-border px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent-green" />
              <div>
                <div className="text-sm font-semibold tracking-[0.18em] text-text-primary">SOLANA BOT</div>
                <div className="text-[11px] text-text-muted">Operator dashboard</div>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-bg-border bg-bg-card/70 p-3">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-text-muted">
              <span>Capacity</span>
              <span className={allPositions.length >= maxOpenPositions ? "text-accent-red" : "text-text-primary"}>
                {allPositions.length}/{maxOpenPositions}
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: maxOpenPositions }).map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    index < allPositions.length ? "bg-accent-green" : "bg-bg-border",
                  )}
                />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-text-secondary">
              <div>
                <div className="text-text-muted">Open P&L</div>
                <div className={cn("font-medium tabular-nums", pnlClass(openPnlUsd))}>{formatUsd(openPnlUsd)}</div>
              </div>
              <div>
                <div className="text-text-muted">Deployed</div>
                <div className="font-medium tabular-nums text-text-primary">{formatUsd(deployedCapitalUsd)}</div>
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-bg-border bg-bg-card/55 p-3 text-[11px] text-text-secondary">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Runtime Scope</div>
            <div className="mt-1 font-medium text-text-primary">
              {activeScope ? `${activeScope.mode} / ${activeScope.configProfile}` : "Waiting for scope"}
            </div>
            {worstQuota ? (
              <div className="mt-2 flex items-center justify-between">
                <span>Quota</span>
                <span className={quotaTone(worstQuota.quotaStatus)}>{worstQuota.service} {worstQuota.quotaStatus}</span>
              </div>
            ) : null}
            {pauseReasons.length > 0 ? (
              <div className="mt-2 text-accent-yellow" title={pauseReasons.join(" · ")}>
                {pauseReasons.length} pause blocker{pauseReasons.length > 1 ? "s" : ""}
              </div>
            ) : null}
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const badge =
              item.href === "/positions"
                ? `${allPositions.length}`
                : item.href === "/trades"
                  ? selectedStrategy
                    ? strategyLabel(selectedStrategy)
                    : selectedTradeSource !== ALL_TRADE_SOURCE_FILTER
                      ? selectedTradeSource
                      : undefined
                  : item.href === "/quota" && worstQuota
                    ? worstQuota.quotaStatus
                    : undefined;

            return (
              <div key={item.href} className="relative">
                {isActive ? (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-xl border border-accent-blue/15 bg-accent-blue/10"
                    transition={{ type: "spring", damping: 26, stiffness: 240 }}
                  />
                ) : null}
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "relative flex items-center justify-between rounded-xl px-3 py-3 transition-colors",
                    isActive
                      ? "text-text-primary"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <item.icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="truncate text-[11px] text-text-muted">{item.description}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[10px] text-text-muted">
                    <kbd>{item.key}</kbd>
                    {badge ? <span className="rounded-full bg-bg-hover px-1.5 py-0.5">{badge}</span> : null}
                  </div>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-bg-border px-3 py-3">
          <div className="rounded-xl border border-bg-border bg-bg-card/70 p-3">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Analysis Focus</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              {selectedStrategy ? strategyLabel(selectedStrategy) : "All strategies"}
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              {effectiveMode} / {effectiveProfile}
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              {activeStrategiesCount} strategies active · operator {operatorAccess}
            </div>
            {selectedStrategy ? (
              <button
                onClick={() => setSelectedStrategy(null)}
                className="mt-2 text-[11px] text-accent-blue transition-colors hover:text-accent-blue/80"
              >
                Clear strategy focus
              </button>
            ) : null}
          </div>
        </div>
      </motion.aside>
    </>
  );
}

function quotaTone(status: "HEALTHY" | "SOFT_LIMIT" | "HARD_LIMIT" | "PAUSED") {
  if (status === "HEALTHY") return "text-accent-green";
  if (status === "SOFT_LIMIT") return "text-accent-yellow";
  return "text-accent-red";
}
