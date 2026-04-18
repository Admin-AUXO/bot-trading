"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import { formatInteger } from "@/lib/format";
import type { DiscoveryLabCatalog, DiscoveryLabRuntimeSnapshot, WorkbenchRunDetailPayload } from "@/lib/types";
import { StatusPill } from "@/components/dashboard-primitives";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCompactCurrency } from "@/lib/format";
import { PlayCircle } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface RunStatusPollerProps {
  catalog: DiscoveryLabCatalog;
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot;
  selectedRunId: string;
  onCatalogReload: () => Promise<void>;
  onRunDetailLoad: (runId: string, silent?: boolean) => Promise<void>;
}

export function RunStatusPoller({
  catalog,
  runtimeSnapshot,
  selectedRunId,
  onCatalogReload,
  onRunDetailLoad,
}: RunStatusPollerProps) {
  const [runDetail, setRunDetail] = useState<typeof catalog.activeRun | null>(catalog.activeRun ?? null);

  useEffect(() => {
    if (!selectedRunId) {
      setRunDetail(null);
      return;
    }
    void loadRun(selectedRunId);
  }, [selectedRunId]);

  useEffect(() => {
    if (runDetail?.status !== "RUNNING") return;
    const timer = window.setInterval(() => void loadRun(runDetail.id, true), 3000);
    return () => window.clearInterval(timer);
  }, [runDetail?.id, runDetail?.status]);

  useEffect(() => {
    if (!catalog.activeRun) return;
    const timer = window.setInterval(() => void onCatalogReload(), 3000);
    return () => window.clearInterval(timer);
  }, [catalog.activeRun?.id]);

  async function loadRun(runId: string, silent = false) {
    try {
      const payload = await fetchJson<WorkbenchRunDetailPayload>(`/operator/runs/${runId}`);
      const next = normalizeRunSummary(payload.summary);
      setRunDetail(next);
      if (next?.status !== "RUNNING") await onCatalogReload();
    } catch (err) {
      if (!silent) {
        console.error("Failed to load run:", err);
      }
    }
  }

  const activeRun = runDetail?.status === "RUNNING" ? runDetail : catalog.activeRun ?? null;

  if (!activeRun) return null;

  return (
    <div className="rounded-lg border border-[#2a2a35] bg-[#111318] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusPill value={activeRun.status} />
          <span className="text-sm text-text-primary">{activeRun.packName}</span>
        </div>
        <span className="text-xs text-text-muted">
          {activeRun.evaluationCount !== null ? `${formatInteger(activeRun.evaluationCount)} evals` : "Running..."}
        </span>
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-text-muted">
        <span>{activeRun.queryCount !== null ? `${formatInteger(activeRun.queryCount)} queries` : ""}</span>
        <span>{activeRun.winnerCount !== null ? `${formatInteger(activeRun.winnerCount)} winners` : ""}</span>
      </div>
    </div>
  );
}

function normalizeRunSummary(
  payload: WorkbenchRunDetailPayload["summary"] | DiscoveryLabCatalog["activeRun"],
): DiscoveryLabCatalog["activeRun"] {
  if (!payload) {
    return null;
  }
  if ("id" in payload) {
    return payload as DiscoveryLabCatalog["activeRun"];
  }
  return null;
}

interface LiveSessionPanelProps {
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot;
}

export function LiveSessionPanel({ runtimeSnapshot }: LiveSessionPanelProps) {
  return (
    <Card className="border-accent/30 bg-accent/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-accent" />
              Live Trading Session
            </CardTitle>
            <CardDescription className="text-xs">
              Capital: ${formatCompactCurrency(runtimeSnapshot.botState.capitalUsd)} · Mode: {runtimeSnapshot.botState.tradeMode}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded bg-[#111318] p-2 text-center">
            <div className="text-lg font-mono text-accent">{runtimeSnapshot.openPositions}</div>
            <div className="text-[10px] text-text-muted">Open Positions</div>
          </div>
          <div className="rounded bg-[#111318] p-2 text-center">
            <div className="text-lg font-mono text-text-primary">
              ${formatCompactCurrency(runtimeSnapshot.botState.cashUsd)}
            </div>
            <div className="text-[10px] text-text-muted">Available Cash</div>
          </div>
          <div className="rounded bg-[#111318] p-2 text-center">
            <div className={cn("text-lg font-mono", runtimeSnapshot.botState.realizedPnlUsd >= 0 ? "text-[#10b981]" : "text-[#f43f5e]")}>
              {runtimeSnapshot.botState.realizedPnlUsd >= 0 ? "+" : ""}{formatCompactCurrency(runtimeSnapshot.botState.realizedPnlUsd)}
            </div>
            <div className="text-[10px] text-text-muted">Realized P&L</div>
          </div>
        </div>
        <Separator className="my-3" />
        <p className="text-xs text-text-secondary">
          Run discovery lab analysis and apply calibration to update live trading parameters.
        </p>
      </CardContent>
    </Card>
  );
}
