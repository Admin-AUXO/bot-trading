"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useSyncExternalStore } from "react";
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

function subscribeDesktopMedia(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia("(min-width: 1024px)");
  const handleChange = () => callback();
  mediaQuery.addEventListener("change", handleChange);
  return () => mediaQuery.removeEventListener("change", handleChange);
}

function getDesktopMediaSnapshot() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
}

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/positions", label: "Positions", icon: Crosshair },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/quota", label: "API Quota", icon: Gauge },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useDashboardStore();
  const { selectedStrategy, setSelectedStrategy, activeScope, effectiveMode, effectiveProfile, selectedTradeSource } = useDashboardFilters();
  const { allPositions, openPnlUsd, maxOpenPositions, pauseReasons, worstQuota } = useDashboardShell();
  const isDesktop = useSyncExternalStore(subscribeDesktopMedia, getDesktopMediaSnapshot, () => false);

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
        className="fixed left-0 top-0 z-50 flex h-screen w-64 -translate-x-full flex-col border-r border-bg-border/80 bg-bg-secondary/94 backdrop-blur-xl lg:translate-x-0"
      >
        <div className="border-b border-bg-border px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-accent-green" />
              <div>
                <div className="text-sm font-semibold tracking-[0.18em] text-text-primary">SOLANA BOT</div>
                <div className="text-[11px] text-text-muted">Operator desk</div>
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

          <div className="mt-3 panel-muted">
            <div className="section-kicker">Runtime Desk</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              {activeScope ? `${activeScope.mode} / ${activeScope.configProfile}` : "Waiting for runtime scope"}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Stat label="Open risk" value={`${allPositions.length}/${maxOpenPositions}`} />
              <Stat label="Open P&L" value={formatUsd(openPnlUsd)} valueClass={pnlClass(openPnlUsd)} />
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-text-muted">
                <span>Capacity</span>
                <span className={allPositions.length >= maxOpenPositions ? "text-accent-red" : "text-text-primary"}>
                  {maxOpenPositions - allPositions.length} open
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
            </div>

            {worstQuota || pauseReasons.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {worstQuota ? (
                  <span className={cn("meta-chip", quotaTone(worstQuota.quotaStatus))}>
                    {worstQuota.service} {worstQuota.quotaStatus.toLowerCase().replace("_", " ")}
                  </span>
                ) : null}
                {pauseReasons.length > 0 ? (
                  <span className="meta-chip border-accent-yellow/20 bg-accent-yellow/8 text-accent-yellow">
                    {pauseReasons.length} blocker{pauseReasons.length > 1 ? "s" : ""}
                  </span>
                ) : null}
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
                    "relative flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors",
                    isActive ? "text-text-primary" : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <div className="text-sm font-medium">{item.label}</div>
                  </div>
                  {badge ? <span className="rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] text-text-muted">{badge}</span> : null}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-bg-border px-3 py-3">
          <div className="panel-muted">
            <div className="section-kicker">Filter Focus</div>
            <div className="mt-1 text-sm font-medium text-text-primary">
              {selectedStrategy ? strategyLabel(selectedStrategy) : "All strategies"}
            </div>
            <div className="mt-1 text-[11px] text-text-muted">
              {effectiveMode ?? "ACTIVE"} / {effectiveProfile ?? "pending"}
              {selectedTradeSource !== ALL_TRADE_SOURCE_FILTER ? ` · ${selectedTradeSource.toLowerCase()} only` : ""}
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

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="micro-stat">
      <div className="micro-stat-label">{label}</div>
      <div className={cn("micro-stat-value", valueClass)}>{value}</div>
    </div>
  );
}

function quotaTone(status: "HEALTHY" | "SOFT_LIMIT" | "HARD_LIMIT" | "PAUSED") {
  if (status === "HEALTHY") return "border-accent-green/20 bg-accent-green/8 text-accent-green";
  if (status === "SOFT_LIMIT") return "border-accent-yellow/20 bg-accent-yellow/8 text-accent-yellow";
  return "border-accent-red/20 bg-accent-red/8 text-accent-red";
}
