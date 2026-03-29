import type { ApiUsageResponse, BudgetSnapshot } from "@/lib/api";

export function getApiUsageSnapshotRows(apiUsage?: ApiUsageResponse | null): BudgetSnapshot[] {
  return apiUsage?.current ?? apiUsage?.daily ?? [];
}
