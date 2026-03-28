import { create } from "zustand";

type TradeMode = "LIVE" | "DRY_RUN";

interface DashboardState {
  selectedStrategy: string | null;
  setSelectedStrategy: (strategy: string | null) => void;
  mode: TradeMode;
  setMode: (mode: TradeMode) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedStrategy: null,
  setSelectedStrategy: (strategy) => set({ selectedStrategy: strategy }),
  mode: "LIVE",
  setMode: (mode) => set({ mode }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
