import type { StatusTone } from "@/lib/types";

const DANGER_KEYWORDS = ["REJECT", "ERROR", "BLOCK", "FAIL", "DANGER"] as const;
const ACCENT_KEYWORDS = [
  "OPEN",
  "ACCEPT",
  "BOUGHT",
  "READY",
  "PASS",
  "HEALTHY",
  "LIVE",
  "RUNNING",
  "ENABLED",
] as const;
const WARNING_KEYWORDS = [
  "WARNING",
  "PAUSE",
  "WAIT",
  "QUEUE",
  "STALE",
  "DISCOVER",
  "SKIP",
  "CHANGED",
  "DISABLED",
] as const;

export function deriveStatusTone(value: string | null | undefined): StatusTone {
  const normalized = String(value ?? "unknown").toUpperCase();

  if (DANGER_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "danger";
  }
  if (ACCENT_KEYWORDS.some((kw) => normalized.includes(kw)) || normalized === "OK") {
    return "accent";
  }
  if (WARNING_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return "warning";
  }
  return "default";
}