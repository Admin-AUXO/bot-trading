"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Crosshair,
  ArrowLeftRight,
  BarChart3,
  Settings,
  Activity,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/lib/store";
import { fetchPositions } from "@/lib/api";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard, key: "1" },
  { href: "/positions", label: "Positions", icon: Crosshair, key: "2" },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight, key: "3" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, key: "4" },
  { href: "/settings", label: "Settings", icon: Settings, key: "5" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, mode } = useDashboardStore();
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const { data: positions } = useQuery({
    queryKey: ["positions", mode],
    queryFn: () => fetchPositions(mode),
    refetchInterval: 10000,
  });

  const activeStrategies = new Set(positions?.map((p) => p.strategy) ?? []);

  return (
    <>
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2 rounded-lg bg-bg-card border border-bg-border"
      >
        <Menu className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: isDesktop || sidebarOpen ? 0 : -224 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed left-0 top-0 h-screen w-56 bg-bg-secondary/80 backdrop-blur-xl border-r border-white/[0.06] flex flex-col z-50 lg:translate-x-0"
      >
        <div className="p-4 border-b border-bg-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent-green" />
            <span className="text-sm font-bold tracking-wider text-text-primary">
              SOLANA BOT
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-bg-hover"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <div key={item.href} className="relative">
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-0 bg-accent-green/10 rounded-lg"
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                  />
                )}
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "relative flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors border-l-2 border-transparent",
                    isActive
                      ? "text-accent-green border-l-accent-green"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </div>
                  <kbd className="text-[10px] text-text-muted opacity-50">{item.key}</kbd>
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-bg-border space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-text-muted">
              <span>POSITIONS</span>
              <span className={`font-medium ${(positions?.length ?? 0) >= 5 ? "text-accent-red" : "text-text-primary"}`}>
                {positions?.length ?? 0}/5
              </span>
            </div>
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    i < (positions?.length ?? 0) ? "bg-accent-green" : "bg-bg-border"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>{activeStrategies.size}/3 strategies</span>
            <span className="opacity-50">R·L·1-5</span>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
