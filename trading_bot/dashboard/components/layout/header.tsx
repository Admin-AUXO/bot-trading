"use client";

import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { fetchOverview, fetchHeartbeat } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";
import { formatUsd, regimeBadge, pnlClass } from "@/lib/utils";
import { Sun, Moon, Heart } from "lucide-react";

export function Header() {
  const { mode, setMode, selectedStrategy, setSelectedStrategy } = useDashboardStore();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();

  const PAGE_TITLES: Record<string, string> = {
    "/": "Overview",
    "/positions": "Positions",
    "/trades": "Trades",
    "/analytics": "Analytics",
    "/settings": "Settings",
  };
  const pageTitle = PAGE_TITLES[pathname] ?? "";

  const { data } = useQuery({
    queryKey: ["overview", mode],
    queryFn: () => fetchOverview(mode),
    refetchInterval: 5000,
  });

  const { data: heartbeat } = useQuery({
    queryKey: ["heartbeat"],
    queryFn: fetchHeartbeat,
    refetchInterval: 15000,
  });

  const regime = data?.regime ? regimeBadge(data.regime.regime) : null;

  return (
    <header className="h-12 border-b border-white/[0.06] bg-bg-secondary/60 backdrop-blur-lg sticky top-0 z-40 flex items-center justify-between px-4 lg:px-6">
      <div className="flex items-center gap-3 lg:gap-5">
        <div className="flex items-center gap-2">
          {data?.isRunning ? (
            <span className="relative flex items-center">
              <motion.span
                className="absolute inline-flex rounded-full h-2.5 w-2.5 bg-accent-green opacity-75"
                animate={{ scale: [1, 1.4, 1], opacity: [0.75, 0.3, 0.75] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-green" />
            </span>
          ) : (
            <span className="inline-flex rounded-full h-2.5 w-2.5 bg-accent-red" />
          )}
          <span className="text-xs text-text-secondary">
            {data?.isRunning ? "RUNNING" : data?.pauseReason ?? "PAUSED"}
          </span>
        </div>

        <div className="h-4 w-px bg-bg-border hidden sm:block" />

        <div className="flex items-center bg-bg-card border border-bg-border rounded-lg overflow-hidden">
          <button
            onClick={() => setMode("LIVE")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              mode === "LIVE"
                ? "bg-accent-green/20 text-accent-green"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            LIVE
          </button>
          <button
            onClick={() => setMode("DRY_RUN")}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              mode === "DRY_RUN"
                ? "bg-accent-yellow/20 text-accent-yellow"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            SIM
          </button>
        </div>

        <div className="h-4 w-px bg-bg-border hidden sm:block" />

        {regime && (
          <span className={`badge ${regime.class}`}>{regime.label}</span>
        )}

        {data?.regime && (
          <span className="text-xs text-text-muted hidden md:inline">
            SOL {formatUsd(data.regime.solPrice)}
          </span>
        )}

        <div className="h-4 w-px bg-bg-border hidden lg:block" />

        <div className="hidden lg:flex items-center bg-bg-card border border-bg-border rounded-lg overflow-hidden">
          {[
            { value: "", label: "All" },
            { value: "S1_COPY", label: "S1" },
            { value: "S2_GRADUATION", label: "S2" },
            { value: "S3_MOMENTUM", label: "S3" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setSelectedStrategy(value || null)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                (selectedStrategy ?? "") === value
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-bg-border hidden xl:block" />
        <span className="text-xs font-medium text-text-primary hidden xl:block">{pageTitle}</span>
      </div>

      <div className="flex items-center gap-3 lg:gap-5">
        {heartbeat && (
          <div className="hidden md:flex items-center gap-1 text-xs text-text-muted" title={`Memory: ${heartbeat.memoryMb}MB`}>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            >
              <Heart className="w-3 h-3 text-accent-green" />
            </motion.div>
            <span>{Math.floor(heartbeat.uptime / 3600)}h</span>
          </div>
        )}

        <div className="h-4 w-px bg-bg-border hidden md:block" />

        <div className="text-right hidden sm:block">
          <span className="text-xs text-text-muted">CAPITAL </span>
          <span className="text-sm font-medium">{data ? formatUsd(data.capitalUsd) : "—"}</span>
        </div>
        <div className="text-right">
          <span className="text-xs text-text-muted">TODAY </span>
          <span className={`text-sm font-medium ${pnlClass(data?.todayPnl ?? 0)}`}>
            {data ? formatUsd(data.todayPnl) : "—"}
          </span>
        </div>

        <div className="h-4 w-px bg-bg-border" />

        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors"
          title="Toggle theme"
        >
          <Sun className="w-3.5 h-3.5 text-text-muted dark:hidden" />
          <Moon className="hidden w-3.5 h-3.5 text-text-muted dark:block" />
        </button>
      </div>
    </header>
  );
}
