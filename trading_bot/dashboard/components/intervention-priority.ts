import type { StatusTone } from "@/lib/types";

export function interventionPriorityLabel(priority: number): string {
  if (priority >= 3) return "high priority";
  if (priority >= 1) return "medium priority";
  return "low priority";
}

export function interventionPriorityTone(priority: number): StatusTone {
  if (priority >= 3) return "danger";
  if (priority >= 1) return "warning";
  return "default";
}

export function isPositionClosed(status: string): boolean {
  return status.toLowerCase().includes("closed");
}