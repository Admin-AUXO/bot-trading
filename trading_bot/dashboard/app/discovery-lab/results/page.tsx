"use client";

import clsx from "clsx";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";
import { RunSummaryCard } from "@/components/lab/run-summary-card";
import { WinnersGrid } from "@/components/lab/winners-grid";
import { CompactPageHeader, EmptyState, ScanStat } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchJson, serverFetch } from "@/lib/api";
import { formatInteger, formatTimestamp } from "@/lib/format";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabRunDetail,
  DiscoveryLabRunSummary,
  DiscoveryLabRuntimeSnapshot,
} from "@/lib/types";

export const dynamic = "force-dynamic";

interface ResultsPageClientProps {
  catalog: DiscoveryLabCatalog;
  runtimeSnapshot: DiscoveryLabRuntimeSnapshot;
  recentRunDetail: DiscoveryLabRunDetail | null;
}

export function ResultsPageClient({
  catalog,
  runtimeSnapshot: initialRuntimeSnapshot,
  recentRunDetail: initialRecentRunDetail,
}: ResultsPageClientProps) {
  const [recentRunDetail, setRecentRunDetail] = useState<DiscoveryLabRunDetail | null>(
    initialRecentRunDetail
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<DiscoveryLabRunDetail | null>(
    initialRecentRunDetail
  );
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);

  const activeRun = catalog.activeRun;
  const latestRun = catalog.recentRuns[0] ?? null;
  const displayRun = runDetail ?? activeRun ?? latestRun;

  // Auto-select latest completed run on mount
  useEffect(() => {
    if (latestRun && !selectedRunId) {
      setSelectedRunId(latestRun.id);
      loadRunDetail(latestRun.id);
    }
  }, [latestRun?.id]);

  async function loadRunDetail(runId: string) {
    try {
      const detail = await fetchJson<DiscoveryLabRunDetail>(
        `/operator/discovery-lab/run?runId=${encodeURIComponent(runId)}`
      );
      setRunDetail(detail);
      setRecentRunDetail(detail);
    } catch {
      // silently fail
    }
  }

  async function handleRefresh() {
    startTransition(async () => {
      try {
        const [nextCatalog, nextRuntime] = await Promise.all([
          fetchJson<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
          fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
        ]);
        // Update parent state if needed
        if (selectedRunId) {
          await loadRunDetail(selectedRunId);
        }
        setRuntimeSnapshot(nextRuntime);
      } catch {
        // silently fail
      }
    });
  }

  const handleRunSelect = (run: DiscoveryLabRunSummary) => {
    setSelectedRunId(run.id);
    loadRunDetail(run.id);
  };

  const runDetailForCard = runDetail ?? activeRun ?? latestRun;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Results"
        badges={
          runDetailForCard?.status ? (
            <Badge className="normal-case">{runDetailForCard.status}</Badge>
          ) : undefined
        }
        actions={
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isPending}>
            <RefreshCcw className={clsx("h-4 w-4", isPending && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Run Summary Card */}
      <RunSummaryCard run={runDetailForCard} />

      {/* Winners Grid */}
      {runDetail ? (
        <WinnersGrid runDetail={runDetail} />
      ) : (
        <EmptyState
          title="No completed run"
          detail="Select a completed run from the history below, or run a new pack from the studio."
        />
      )}

      {/* Run Diagnostics - Collapsible */}
      {runDetail && (
        <details
          className="rounded-[14px] border border-bg-border bg-[#101012]"
          open={diagnosticsOpen}
          onToggle={(e) => setDiagnosticsOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              {diagnosticsOpen ? (
                <ChevronUp className="h-4 w-4 text-text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-muted" />
              )}
              <span className="text-sm font-semibold text-text-primary">Run diagnostics</span>
            </div>
            <span className="text-xs text-text-muted">stdout, stderr, regime</span>
          </summary>
          <div className="space-y-4 border-t border-bg-border px-4 py-4">
            {/* Key Stats */}
            {runDetail.report && (
              <div className="grid gap-2 md:grid-cols-3">
                <ScanStat
                  label="Queries"
                  value={formatInteger(runDetail.report.queryCount)}
                  detail="Searches run"
                />
                <ScanStat
                  label="Evaluations"
                  value={formatInteger(runDetail.report.deepEvaluations.length)}
                  detail="Deep checks"
                />
                <ScanStat
                  label="Winners"
                  value={formatInteger(runDetail.report.winners.length)}
                  detail="Pass-grade"
                />
              </div>
            )}

            {/* Stdout/Stderr */}
            {(runDetail.stdout || runDetail.stderr) && (
              <div className="space-y-2">
                {runDetail.stdout && (
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      stdout
                    </div>
                    <pre className="max-h-40 overflow-auto rounded-[10px] border border-bg-border bg-[#0d0d0f] p-3 text-xs text-text-secondary">
                      {runDetail.stdout}
                    </pre>
                  </div>
                )}
                {runDetail.stderr && (
                  <div>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      stderr
                    </div>
                    <pre className="max-h-40 overflow-auto rounded-[10px] border border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.05)] p-3 text-xs text-[var(--danger)]">
                      {runDetail.stderr}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Strategy Calibration */}
            {runDetail.strategyCalibration && (
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  Strategy calibration
                </div>
                <div className="rounded-[10px] border border-bg-border bg-[#0d0d0f] p-3 text-xs text-text-secondary">
                  {runDetail.strategyCalibration.calibrationSummary ? (
                    <div className="space-y-1">
                      <div>
                        Profile: {runDetail.strategyCalibration.calibrationSummary.derivedProfile ?? "—"}
                      </div>
                      <div>
                        Confidence: {runDetail.strategyCalibration.calibrationSummary.calibrationConfidence ?? "—"}
                      </div>
                      <div>
                        Winners: {runDetail.strategyCalibration.calibrationSummary.winnerCount ?? 0}
                      </div>
                    </div>
                  ) : (
                    <div>No calibration data available</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Recent Runs History */}
      {catalog.recentRuns.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Recent runs
          </div>
          <div className="space-y-2">
            {catalog.recentRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => handleRunSelect(run)}
                className={clsx(
                  "w-full rounded-[12px] border px-3 py-2.5 text-left transition",
                  selectedRunId === run.id
                    ? "border-[rgba(163,230,53,0.3)] bg-[#121511]"
                    : "border-bg-border bg-[#101012] hover:border-bg-border/60 hover:bg-[#111113]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{run.packName}</span>
                    <Badge className="normal-case">{run.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span>{run.winnerCount != null ? `${formatInteger(run.winnerCount)} winners` : ""}</span>
                    <span>{run.completedAt ? formatTimestamp(run.completedAt) : ""}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Server component
export default async function DiscoveryLabResultsPage() {
  const [catalog, runtimeSnapshot] = await Promise.all([
    serverFetch<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  // Try to load the most recent completed run's detail
  let recentRunDetail: DiscoveryLabRunDetail | null = null;
  const latestCompletedRun = catalog.recentRuns.find((r) => r.status === "COMPLETED");
  if (latestCompletedRun) {
    try {
      recentRunDetail = await serverFetch<DiscoveryLabRunDetail>(
        `/operator/discovery-lab/run?runId=${encodeURIComponent(latestCompletedRun.id)}`
      );
    } catch {
      // OK to not have this
    }
  }

  return (
    <ResultsPageClient
      catalog={catalog}
      runtimeSnapshot={runtimeSnapshot}
      recentRunDetail={recentRunDetail}
    />
  );
}
