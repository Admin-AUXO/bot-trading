"use client";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Tab<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ tabs, active, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn("flex gap-1 p-1 bg-bg-secondary rounded-xl border border-bg-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors z-10",
            active === tab.id ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
          )}
        >
          {active === tab.id && (
            <motion.span
              layoutId="tab-active"
              className="absolute inset-0 bg-bg-hover rounded-lg border border-bg-border"
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded text-[10px] font-bold",
                active === tab.id ? "bg-accent-green/20 text-accent-green" : "bg-bg-border text-text-muted"
              )}>
                {tab.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
