"use client";

import type { DeskHomePayload } from "@/lib/types";
import { formatInteger } from "@/lib/format";
import { StatusPill } from "@/components/dashboard-primitives";
import { Panel } from "@/components/dashboard-primitives";
import { IconAction } from "@/components/dashboard-primitives";
import { operationalDeskRoutes } from "@/lib/dashboard-routes";
import { ArrowUpRight, Sparkles, Cpu, CirclePause } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { useHydrated } from "@/lib/use-hydrated";

interface PipelinePanelProps {
  home: DeskHomePayload;
}

export function PipelinePanel({ home }: PipelinePanelProps) {
  return (
    <Panel
      title="Pipeline"
      eyebrow="Queue"
      description="Candidates across stages."
    >
      <div className="space-y-2">
        {home.queue.buckets.filter((b) => b.count > 0 || b.bucket === "ready").map((bucket) => (
          <div key={bucket.bucket} className="flex items-center justify-between gap-3 rounded-[12px] border border-bg-border bg-bg-hover/35 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <StatusPill value={bucket.bucket} />
              <span className="text-sm font-medium text-text-primary">{bucket.label}</span>
            </div>
            <span className={cn("text-sm font-semibold tabular-nums", bucket.count > 0 ? "text-text-primary" : "text-text-muted")}>
              {formatInteger(bucket.count)}
            </span>
          </div>
        ))}
        {home.queue.buckets.every((b) => b.count === 0) && (
          <div className="py-2 text-xs text-text-muted">No candidates in queue.</div>
        )}
      </div>
    </Panel>
  );
}

interface LoopStatusPanelProps {
  home: DeskHomePayload;
}

export function LoopStatusPanel({ home }: LoopStatusPanelProps) {
  const hydrated = useHydrated();

  return (
    <Panel
      title="Loop status"
      eyebrow="Runtime"
      description="Last runs and guardrails."
      tone={home.diagnostics.status === "danger" ? "critical" : home.diagnostics.status === "warning" ? "warning" : "passive"}
      action={<IconAction href={operationalDeskRoutes.settings} icon={ArrowUpRight} label="Settings" title="Open settings" subtle />}
    >
      <div className="space-y-3">
        <div className="grid gap-1.5">
          {[
            { label: "Discovery", ts: home.runtime.lastDiscoveryAt, icon: Sparkles },
            { label: "Evaluation", ts: home.runtime.lastEvaluationAt, icon: Cpu },
            { label: "Exit checks", ts: home.runtime.lastExitCheckAt, icon: CirclePause },
          ].map(({ label, ts, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-xs text-text-secondary">{label}</span>
              </div>
              <span className="text-[11px] font-medium tabular-nums text-text-muted">
                {safeTs(ts, hydrated)}
              </span>
            </div>
          ))}
        </div>
        {home.guardrails.length > 0 && (
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-text-muted">Guardrails</div>
            <div className="flex flex-wrap gap-1.5">
              {home.guardrails.map((gr) => (
                <div
                  key={gr.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold",
                    gr.status === "ok"
                      ? "border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.1)] text-[var(--success)]"
                      : gr.status === "warning"
                      ? "border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.1)] text-[var(--warning)]"
                      : "border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.1)] text-[var(--danger)]"
                  )}
                >
                  <span>{gr.label}</span>
                  <span>{gr.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-[10px] border border-bg-border bg-bg-hover/25 px-3 py-2">
          <span className="text-xs text-text-secondary">Provider pace</span>
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums",
              home.providerPressure.paceStatus === "ok"
                ? "text-[var(--success)]"
                : home.providerPressure.paceStatus === "warning"
                ? "text-[var(--warning)]"
                : "text-[var(--danger)]"
            )}
          >
            {formatInteger(home.providerPressure.projectedMonthlyUnits)} / {formatInteger(home.providerPressure.monthlyBudgetUnits)}
          </span>
        </div>
      </div>
    </Panel>
  );
}

function safeTs(value: string | null | undefined, hydrated: boolean): string {
  if (!value) return "—";
  return hydrated ? formatTimestamp(value) : "…";
}

function formatTimestamp(value: string): string {
  try {
    const date = new Date(value);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
