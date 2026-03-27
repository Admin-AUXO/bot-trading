import { create } from "zustand";

type TradeMode = "LIVE" | "DRY_RUN";
type DateRange = "7d" | "14d" | "30d" | "60d" | "90d";

interface DashboardState {
  selectedStrategy: string | null;
  setSelectedStrategy: (strategy: string | null) => void;
  mode: TradeMode;
  setMode: (mode: TradeMode) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  connected: boolean;
  setConnected: (connected: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedStrategy: null,
  setSelectedStrategy: (strategy) => set({ selectedStrategy: strategy }),
  mode: "LIVE",
  setMode: (mode) => set({ mode }),
  refreshKey: 0,
  triggerRefresh: () => set((state) => ({ refreshKey: state.refreshKey + 1 })),
  dateRange: "30d",
  setDateRange: (dateRange) => set({ dateRange }),
  connected: true,
  setConnected: (connected) => set({ connected }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
