"use client";

import { useDashboardStore } from "@/lib/store";
import { WifiOff } from "lucide-react";

export function ConnectionBanner() {
  const { connected } = useDashboardStore();

  if (connected) return null;

  return (
    <div className="bg-accent-red/15 border-b border-accent-red/30 px-4 py-1.5 flex items-center justify-center gap-2 text-xs text-accent-red">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Connection lost — reconnecting...</span>
    </div>
  );
}
