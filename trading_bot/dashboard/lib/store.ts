import { create } from "zustand";
import type { TradeMode, TradeSource } from "@/lib/api";

export const ACTIVE_MODE_FILTER = "ACTIVE" as const;
export const ACTIVE_PROFILE_FILTER = "__ACTIVE__" as const;
export const ALL_TRADE_SOURCE_FILTER = "ALL" as const;

export type DashboardModeFilter = typeof ACTIVE_MODE_FILTER | TradeMode;
export type DashboardProfileFilter = typeof ACTIVE_PROFILE_FILTER | string;
export type DashboardTradeSourceFilter = typeof ALL_TRADE_SOURCE_FILTER | TradeSource;

interface DashboardState {
  selectedStrategy: string | null;
  setSelectedStrategy: (strategy: string | null) => void;
  selectedMode: DashboardModeFilter;
  setSelectedMode: (mode: DashboardModeFilter) => void;
  selectedProfile: DashboardProfileFilter;
  setSelectedProfile: (profile: DashboardProfileFilter) => void;
  selectedTradeSource: DashboardTradeSourceFilter;
  setSelectedTradeSource: (tradeSource: DashboardTradeSourceFilter) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedStrategy: null,
  setSelectedStrategy: (strategy) => set({ selectedStrategy: strategy }),
  selectedMode: ACTIVE_MODE_FILTER,
  setSelectedMode: (selectedMode) => set({ selectedMode }),
  selectedProfile: ACTIVE_PROFILE_FILTER,
  setSelectedProfile: (selectedProfile) => set({ selectedProfile }),
  selectedTradeSource: ALL_TRADE_SOURCE_FILTER,
  setSelectedTradeSource: (selectedTradeSource) => set({ selectedTradeSource }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
