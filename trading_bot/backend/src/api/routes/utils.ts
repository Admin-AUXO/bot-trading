import { ZodError } from "zod";

export const ALLOWED_SQL_VIEWS = new Set([
  "v_token_metrics_latest",
  "v_token_metrics_aggregation",
  "v_candidate_lifecycle",
  "v_candidate_with_metrics",
  "v_position_entry_analysis",
  "v_position_monitor",
  "v_fill_performance",
  "v_runtime_overview",
  "v_candidate_funnel_daily",
  "v_api_telemetry_daily",
  "v_api_provider_daily",
  "v_api_endpoint_efficiency",
  "v_position_pnl_daily",
  "v_candidate_decision_facts",
  "v_discovery_lab_run_summary",
  "v_discovery_lab_pack_performance",
  "v_strategy_pack_performance_daily",
  "v_shared_token_fact_cache",
  "v_adaptive_threshold_activity",
  "v_smart_wallet_mint_activity",
]);

export function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return value === true;
}

export function errorToStatus(error: unknown): number {
  if (error instanceof ZodError) {
    return 400;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("not found")) {
    return 404;
  }
  if (
    message.includes("confirmation must match")
    || message.includes("requires live_deploy")
    || message.includes("requires a valid live deploy token")
    || message.includes("requires a trusted caller ip")
    || message.includes("invalid helius webhook signature")
    || message.includes("required for helius webhook ingestion")
    || message.includes("is required")
  ) {
    return 400;
  }
  if (
    message.includes("already active")
    || message.includes("only available")
    || message.includes("cannot ")
    || message.includes("would be exceeded")
  ) {
    return 409;
  }
  return 500;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "request";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : "internal server error";
}
