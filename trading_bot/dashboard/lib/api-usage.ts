import type { ApiEndpointUsage, ApiUsageResponse, BudgetSnapshot, OverviewResponse } from "@/lib/api";

type SnapshotSource =
  | Pick<ApiUsageResponse, "current" | "daily">
  | Pick<OverviewResponse, "quotaSnapshots">
  | { currentQuotaSnapshots?: BudgetSnapshot[] | null }
  | null
  | undefined;

export interface DecoratedBudgetSnapshot extends BudgetSnapshot {
  dailyPct: number;
  monthlyPct: number;
}

const quotaStatusRank: Record<BudgetSnapshot["quotaStatus"], number> = {
  PAUSED: 3,
  HARD_LIMIT: 2,
  SOFT_LIMIT: 1,
  HEALTHY: 0,
};

export function getApiUsageSnapshotRows(source?: SnapshotSource): BudgetSnapshot[] {
  if (!source) return [];
  if ("quotaSnapshots" in source) return source.quotaSnapshots ?? [];
  if ("currentQuotaSnapshots" in source) return source.currentQuotaSnapshots ?? [];
  if ("current" in source || "daily" in source) {
    const usageSource = source as Pick<ApiUsageResponse, "current" | "daily">;
    return usageSource.current ?? usageSource.daily ?? [];
  }
  return [];
}

export function decorateBudgetSnapshots(snapshots: BudgetSnapshot[]): DecoratedBudgetSnapshot[] {
  return snapshots
    .map((snapshot) => ({
      ...snapshot,
      dailyPct: snapshot.dailyBudget > 0 ? (snapshot.dailyUsed / snapshot.dailyBudget) * 100 : 0,
      monthlyPct: snapshot.budgetTotal > 0 ? (snapshot.monthlyUsed / snapshot.budgetTotal) * 100 : 0,
    }))
    .sort((left, right) => right.monthlyPct - left.monthlyPct);
}

export function getWorstBudgetSnapshot(snapshots: BudgetSnapshot[] | null | undefined): BudgetSnapshot | null {
  if (!snapshots?.length) return null;
  return decorateBudgetSnapshots(snapshots).sort((left, right) => {
    const severityDiff = quotaStatusRank[right.quotaStatus] - quotaStatusRank[left.quotaStatus];
    if (severityDiff !== 0) return severityDiff;
    return right.monthlyPct - left.monthlyPct;
  })[0] ?? null;
}

export function getApiEndpointUsageKey(entry: ApiEndpointUsage): string {
  return [
    entry.service,
    entry.endpoint,
    entry.strategy ?? "all-strategies",
    entry.mode ?? "all-modes",
    entry.configProfile ?? "all-profiles",
    entry.purpose,
    entry.essential ? "essential" : "degradable",
  ].join(":");
}

export function formatApiEndpointUsageScope(entry: ApiEndpointUsage): string {
  return [
    entry.purpose,
    entry.strategy ?? "all strategies",
    entry.configProfile ?? "all profiles",
    entry.mode ?? "all modes",
    entry.essential ? "essential" : "degradable",
  ].join(" · ");
}
