"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SummaryTileProps {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  valueClass?: string;
  tone?: "default" | "positive" | "warning" | "danger";
  className?: string;
}

const toneClassMap: Record<NonNullable<SummaryTileProps["tone"]>, string> = {
  default: "border-bg-border/80 bg-bg-card/75",
  positive: "border-accent-green/20 bg-accent-green/5",
  warning: "border-accent-yellow/20 bg-accent-yellow/5",
  danger: "border-accent-red/20 bg-accent-red/5",
};

export function SummaryTile({
  label,
  value,
  sub,
  icon,
  valueClass,
  tone = "default",
  className,
}: SummaryTileProps) {
  return (
    <div className={cn("card py-3", toneClassMap[tone], className)}>
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      </div>
      <div className={cn("text-base font-bold tabular-nums", valueClass)}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-text-muted">{sub}</div> : null}
    </div>
  );
}
