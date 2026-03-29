import { invalidateLaneActivity } from "./lane-activity.js";
import { invalidateLaneTodaySummary } from "./lane-summary.js";
import { invalidateResponseCache } from "./middleware/cache.js";
import type { ExecutionScope } from "../utils/types.js";

export function invalidateDashboardReadCaches(scope?: ExecutionScope): void {
  invalidateResponseCache();
  invalidateLaneActivity(scope);
  invalidateLaneTodaySummary(scope);
}
