import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSol(value: number): string {
  return `${value.toFixed(4)} SOL`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function pnlClass(value: number): string {
  if (value > 0) return "pnl-positive";
  if (value < 0) return "pnl-negative";
  return "pnl-neutral";
}

export function strategyLabel(strategy: string): string {
  switch (strategy) {
    case "S1_COPY": return "S1 Copy";
    case "S2_GRADUATION": return "S2 Grad";
    case "S3_MOMENTUM": return "S3 Mom";
    default: return strategy;
  }
}

export function strategyColor(strategy: string): string {
  switch (strategy) {
    case "S1_COPY": return "text-accent-blue";
    case "S2_GRADUATION": return "text-accent-purple";
    case "S3_MOMENTUM": return "text-accent-cyan";
    default: return "text-text-secondary";
  }
}

export function regimeBadge(regime: string): { label: string; class: string } {
  switch (regime) {
    case "HOT": return { label: "HOT", class: "badge-green" };
    case "NORMAL": return { label: "NORMAL", class: "badge-blue" };
    case "CHOPPY": return { label: "CHOPPY", class: "badge-yellow" };
    case "RISK_OFF": return { label: "RISK OFF", class: "badge-red" };
    default: return { label: regime, class: "badge-blue" };
  }
}

export function timeAgo(date: string | Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

export function exitReasonLabel(reason: string | null): { label: string; icon: string; class: string } {
  if (!reason) return { label: "—", icon: "", class: "" };
  switch (reason) {
    case "STOP_LOSS": return { label: "Stop Loss", icon: "🛑", class: "badge-red" };
    case "TIME_STOP": return { label: "Time Stop", icon: "⏱", class: "badge-yellow" };
    case "TAKE_PROFIT_1": return { label: "TP1 (+20%)", icon: "💰", class: "badge-green" };
    case "TAKE_PROFIT_2": return { label: "TP2 (+40%)", icon: "💰", class: "badge-green" };
    case "TAKE_PROFIT_3": return { label: "TP3 (Trail)", icon: "🎯", class: "badge-green" };
    case "TRAILING_STOP": return { label: "Trail Stop", icon: "📉", class: "badge-yellow" };
    case "VOLUME_FADE": return { label: "Vol Fade", icon: "📊", class: "badge-yellow" };
    case "MAX_HOLD": return { label: "Max Hold", icon: "⏰", class: "badge-blue" };
    case "MANUAL": return { label: "Manual", icon: "✋", class: "badge-purple" };
    case "TARGET_SOLD": return { label: "Target Sold", icon: "👤", class: "badge-blue" };
    default: return { label: reason, icon: "", class: "badge-blue" };
  }
}

export function dateRangeToDays(range: string): number {
  const map: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30, "60d": 60, "90d": 90 };
  return map[range] ?? 30;
}

export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
