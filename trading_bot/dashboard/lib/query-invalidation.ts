import type { QueryClient } from "@tanstack/react-query";
import type { TradeMode, TradeSource } from "@/lib/api";
import { dashboardQueryKeys } from "@/lib/dashboard-query-options";

interface LaneScope {
  mode?: TradeMode | null;
  profile?: string | null;
  tradeSource?: TradeSource | null;
}

export function invalidateRuntimeShellQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.overview }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.heartbeat }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.strategyConfig }),
  ]);
}

export function invalidateTradeActivityQueries(queryClient: QueryClient, scope?: LaneScope) {
  return Promise.all([
    invalidateRuntimeShellQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.positions() }),
    queryClient.invalidateQueries({
      queryKey: dashboardQueryKeys.positions(scope?.mode, scope?.profile, scope?.tradeSource),
    }),
    queryClient.invalidateQueries({ queryKey: ["position-history"] }),
    queryClient.invalidateQueries({ queryKey: ["trades"] }),
    queryClient.invalidateQueries({ queryKey: ["skipped-signals"] }),
    queryClient.invalidateQueries({ queryKey: ["signals-paginated"] }),
    queryClient.invalidateQueries({ queryKey: ["daily-stats"] }),
    queryClient.invalidateQueries({ queryKey: ["strategy-analytics"] }),
    queryClient.invalidateQueries({ queryKey: ["execution-quality"] }),
    queryClient.invalidateQueries({ queryKey: ["pnl-distribution"] }),
    queryClient.invalidateQueries({ queryKey: ["api-usage"] }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.profileResultsSummaries }),
  ]);
}

export function invalidateProfileManagementQueries(queryClient: QueryClient) {
  return Promise.all([
    invalidateTradeActivityQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.profiles }),
  ]);
}
