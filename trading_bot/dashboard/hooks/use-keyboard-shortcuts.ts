"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVE_MODE_FILTER, useDashboardStore } from "@/lib/store";
import { invalidateRuntimeShellQueries } from "@/lib/query-invalidation";

const MODE_CYCLE = [ACTIVE_MODE_FILTER, "LIVE", "DRY_RUN"] as const;

export function useKeyboardShortcuts() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { selectedMode, setSelectedMode } = useDashboardStore();

  useHotkeys("1", () => router.push("/"), { description: "Overview" });
  useHotkeys("2", () => router.push("/positions"), { description: "Positions" });
  useHotkeys("3", () => router.push("/trades"), { description: "Trades" });
  useHotkeys("4", () => router.push("/analytics"), { description: "Analytics" });
  useHotkeys("5", () => router.push("/quota"), { description: "Quota" });
  useHotkeys("6", () => router.push("/settings"), { description: "Settings" });
  useHotkeys("r", () => {
    void invalidateRuntimeShellQueries(queryClient);
  }, { description: "Refresh runtime shell" });
  useHotkeys("l", () => {
    const currentIndex = MODE_CYCLE.indexOf(selectedMode);
    const next = MODE_CYCLE[(currentIndex + 1) % MODE_CYCLE.length];
    setSelectedMode(next);
  }, { description: "Cycle lane filter" });
}
