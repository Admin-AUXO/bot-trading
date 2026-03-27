"use client";

import { useHotkeys } from "react-hotkeys-hook";
import { useRouter } from "next/navigation";
import { useDashboardStore } from "@/lib/store";
import { useQueryClient } from "@tanstack/react-query";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mode, setMode } = useDashboardStore();

  useHotkeys("1", () => router.push("/"), { description: "Overview" });
  useHotkeys("2", () => router.push("/positions"), { description: "Positions" });
  useHotkeys("3", () => router.push("/trades"), { description: "Trades" });
  useHotkeys("4", () => router.push("/analytics"), { description: "Analytics" });
  useHotkeys("5", () => router.push("/settings"), { description: "Settings" });
  useHotkeys("r", () => queryClient.invalidateQueries(), { description: "Refresh all" });
  useHotkeys("l", () => setMode(mode === "LIVE" ? "DRY_RUN" : "LIVE"), { description: "Toggle mode" });
}
