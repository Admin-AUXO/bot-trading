"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchHeartbeat } from "@/lib/api";
import { useDashboardStore } from "@/lib/store";

export function Footer() {
  const { mode } = useDashboardStore();
  const { data: heartbeat } = useQuery({
    queryKey: ["heartbeat"],
    queryFn: fetchHeartbeat,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  return (
    <footer className="h-7 border-t border-bg-border bg-bg-secondary/60 flex items-center justify-between px-4 lg:px-6 text-[10px] text-text-muted">
      <div className="flex items-center gap-4">
        <span>Solana Bot v1.0</span>
        <span className="opacity-40">|</span>
        <span className={mode === "LIVE" ? "text-accent-green" : "text-accent-yellow"}>
          {mode === "LIVE" ? "LIVE" : "SIM"}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {heartbeat && (
          <>
            <span>mem {heartbeat.memoryMb}MB</span>
            <span className="opacity-40">|</span>
            <span>up {Math.floor(heartbeat.uptime / 3600)}h {Math.floor((heartbeat.uptime % 3600) / 60)}m</span>
          </>
        )}
        <span className="opacity-40">|</span>
        <span className="opacity-60">{new Date().getFullYear()} · bot-trading</span>
      </div>
    </footer>
  );
}
