"use client";

import { useRouter } from "next/navigation";
import { FlaskConical, Play, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/dashboard-primitives";
import { discoveryLabRoutes } from "@/lib/dashboard-routes";
import { formatInteger, formatTimestamp } from "@/lib/format";
import type { DiscoveryLabRunDetail, DiscoveryLabRunSummary } from "@/lib/types";

export type RunSummary = {
  id: string;
  packName: string;
  status: string;
  winnerCount: number | null;
  evaluationCount: number | null;
  completedAt: string | null;
};

interface RunSummaryCardProps {
  run: RunSummary | DiscoveryLabRunSummary | DiscoveryLabRunDetail | null;
  compact?: boolean;
}

export function RunSummaryCard({ run, compact = false }: RunSummaryCardProps) {
  const router = useRouter();
  const isActive = run?.status === "RUNNING";
  const isFailed = run?.status === "FAILED";

  if (!run) {
    return (
      <div className="rounded-[14px] border border-bg-border bg-[#101012] px-4 py-4">
        <div className="text-sm text-text-muted">No run selected</div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">{run.packName}</span>
        </div>
        <StatusPill value={run.status} />
        {run.winnerCount != null && (
          <span className="text-xs text-text-secondary">
            {formatInteger(run.winnerCount)} winners
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border border-bg-border bg-[#101012] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-accent" />
            <span className="text-base font-semibold text-text-primary">{run.packName}</span>
          </div>
          <StatusPill value={run.status} />
        </div>
        <div className="flex items-center gap-2">
          {isFailed ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(discoveryLabRoutes.studio)}
            >
              <RefreshCcw className="h-4 w-4" />
              Rerun
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => router.push(discoveryLabRoutes.studio)}
            >
              <Play className="h-4 w-4" />
              Tune in Studio
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Winners</div>
          <div className="mt-1 text-sm font-semibold text-accent">
            {run.winnerCount != null ? formatInteger(run.winnerCount) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Evaluations</div>
          <div className="mt-1 text-sm font-semibold text-text-primary">
            {run.evaluationCount != null ? formatInteger(run.evaluationCount) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Completed</div>
          <div className="mt-1 text-sm text-text-secondary">
            {run.completedAt ? formatTimestamp(run.completedAt) : "In progress"}
          </div>
        </div>
      </div>
    </div>
  );
}
