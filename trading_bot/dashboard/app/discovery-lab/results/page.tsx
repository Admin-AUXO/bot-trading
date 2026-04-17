"use client";

import clsx from "clsx";
import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, RefreshCcw, Filter, GitCompare, X, Download } from "lucide-react";
import { RunSummaryCard } from "@/components/lab/run-summary-card";
import { WinnersGrid } from "@/components/lab/winners-grid";
import { CompactPageHeader, EmptyState, ScanStat } from "@/components/dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [compareRunId, setCompareRunId] = useState<string | null>(null);
  const [compareRunDetail, setCompareRunDetail] = useState<DiscoveryLabRunDetail | null>(null);
  const [runDetail, setRunDetail] = useState<DiscoveryLabRunDetail | null>(
    initialRecentRunDetail
  );
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);

  const [filterQuery, setFilterQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [compareMode, setCompareMode] = useState(false);

  const activeRun = catalog.activeRun;
  const latestRun = catalog.recentRuns[0] ?? null;
  const displayRun = runDetail ?? activeRun ?? latestRun;

  const filteredRuns = catalog.recentRuns.filter((run) => {
    const matchesQuery = !filterQuery || run.packName.toLowerCase().includes(filterQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || run.status === filterStatus;
    return matchesQuery && matchesStatus;
  });

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
      return detail;
    } catch {
      return null;
    }
  }

  async function loadCompareRunDetail(runId: string) {
    try {
      const detail = await fetchJson<DiscoveryLabRunDetail>(
        `/operator/discovery-lab/run?runId=${encodeURIComponent(runId)}`
      );
      setCompareRunDetail(detail);
      return detail;
    } catch {
      setCompareRunDetail(null);
      return null;
    }
  }

  async function handleRefresh() {
    startTransition(async () => {
      try {
        const [nextCatalog, nextRuntime] = await Promise.all([
          fetchJson<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
          fetchJson<DiscoveryLabRuntimeSnapshot>("/api/status"),
        ]);
        if (selectedRunId) {
          await loadRunDetail(selectedRunId);
        }
        if (compareRunId) {
          await loadCompareRunDetail(compareRunId);
        }
        setRuntimeSnapshot(nextRuntime);
      } catch {
      }
    });
  }

  const handleRunSelect = (run: DiscoveryLabRunSummary) => {
    setSelectedRunId(run.id);
    loadRunDetail(run.id);
  };

  const handleCompareSelect = (run: DiscoveryLabRunSummary) => {
    setCompareRunId(run.id);
    loadCompareRunDetail(run.id);
  };

  const handleToggleCompareMode = () => {
    setCompareMode((v) => !v);
    if (compareMode) {
      setCompareRunId(null);
      setCompareRunDetail(null);
    }
  };

  const runDetailForCard = runDetail ?? activeRun ?? latestRun;

  const comparisonRows = compareRunDetail && runDetail ? buildComparisonRows(runDetail, compareRunDetail) : null;

  function handleExport() {
    if (!runDetail) return;
    const data = {
      packName: runDetail.packName,
      status: runDetail.status,
      completedAt: runDetail.completedAt,
      winners: runDetail.report?.winners ?? [],
      stats: {
        queryCount: runDetail.report?.queryCount ?? 0,
        winnerCount: runDetail.report?.winners.length ?? 0,
        evaluationCount: runDetail.report?.deepEvaluations.length ?? 0,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runDetail.packName}-${runDetail.completedAt ?? "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isPending}>
              <RefreshCcw className={clsx("h-4 w-4", isPending && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant={compareMode ? "default" : "ghost"}
              size="sm"
              onClick={handleToggleCompareMode}
              title="Compare two runs side-by-side"
            >
              <GitCompare className="h-4 w-4" />
              {compareMode ? "Exit compare" : "Compare"}
            </Button>
            {runDetail && (
              <Button variant="ghost" size="sm" onClick={handleExport} title="Export run data as JSON">
                <Download className="h-4 w-4" />
                Export
              </Button>
            )}
          </div>
        }
      />

      <RunSummaryCard run={runDetailForCard} />

      {compareMode && (
      {compareMode && (
        <div className="rounded-[14px] border border-[rgba(163,230,53,0.25)] bg-[rgba(163,230,53,0.05)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-accent" />
              <span className="text-sm font-semibold text-text-primary">Compare mode</span>
              <span className="text-xs text-text-secondary"> — select a second run from the history below</span>
            </div>
            {compareRunDetail && (
              <Button variant="ghost" size="sm" onClick={() => { setCompareRunId(null); setCompareRunDetail(null); }}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {runDetail ? (
        compareMode && comparisonRows ? (
          <div className="space-y-4">
            <RunComparisonView
              left={runDetail}
              right={compareRunDetail}
              rows={comparisonRows}
            />
          </div>
        ) : (
          <WinnersGrid runDetail={runDetail} />
        )
      ) : (
        <EmptyState
          title="No completed run"
          detail="Select a completed run from the history below, or run a new pack from the studio."
        />
      )}

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

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[12rem] max-w-sm">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filter by pack name..."
              className="h-9 bg-[#101112] pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["all", "COMPLETED", "RUNNING", "FAILED"].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  filterStatus === status
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-bg-border bg-[#101012] text-text-secondary hover:bg-[#141417]"
                )}
              >
                {status === "all" ? "All" : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-text-muted">
            {filteredRuns.length} {filteredRuns.length === 1 ? "run" : "runs"}
          </div>
        </div>

        {compareMode ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Primary run
              </div>
              {filteredRuns.map((run) => (
                <RunHistoryItem
                  key={run.id}
                  run={run}
                  selected={selectedRunId === run.id}
                  compareSelected={compareRunId === run.id}
                  onSelect={() => handleRunSelect(run)}
                  onCompareSelect={() => handleCompareSelect(run)}
                  showCompareButton
                />
              ))}
            </div>
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                Compare run
              </div>
              {filteredRuns.map((run) => (
                <RunHistoryItem
                  key={run.id}
                  run={run}
                  selected={compareRunId === run.id}
                  compareSelected={selectedRunId === run.id}
                  onSelect={() => handleCompareSelect(run)}
                  onCompareSelect={() => handleRunSelect(run)}
                  showCompareButton
                  isCompareColumn
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRuns.map((run) => (
              <RunHistoryItem
                key={run.id}
                run={run}
                selected={selectedRunId === run.id}
                onSelect={() => handleRunSelect(run)}
              />
            ))}
            {filteredRuns.length === 0 && (
              <EmptyState
                title="No runs match your filter"
                detail="Try a different pack name or clear the status filter."
                compact
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RunHistoryItem({
  run,
  selected,
  compareSelected,
  onSelect,
  onCompareSelect,
  showCompareButton,
  isCompareColumn,
}: {
  run: DiscoveryLabRunSummary;
  selected: boolean;
  compareSelected?: boolean;
  onSelect: () => void;
  onCompareSelect?: () => void;
  showCompareButton?: boolean;
  isCompareColumn?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-2 rounded-[12px] border px-3 py-2.5 transition",
        selected
          ? "border-[rgba(163,230,53,0.3)] bg-[#121511]"
          : compareSelected
          ? "border-[rgba(96,165,250,0.25)] bg-[rgba(96,165,250,0.05)]"
          : "border-bg-border bg-[#101012] hover:border-bg-border/60 hover:bg-[#111113]"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-2 text-left"
      >
        <span className="text-sm font-medium text-text-primary">{run.packName}</span>
        <Badge className="normal-case">{run.status}</Badge>
        <span className="ml-auto text-xs text-text-muted">
          {run.winnerCount != null ? `${formatInteger(run.winnerCount)} winners` : ""}
        </span>
        <span className="text-xs text-text-muted">
          {run.completedAt ? formatTimestamp(run.completedAt) : ""}
        </span>
      </button>
      {showCompareButton && onCompareSelect && (
        <button
          type="button"
          onClick={onCompareSelect}
          title={isCompareColumn ? "Set as primary" : "Add to compare"}
          className={clsx(
            "rounded-full border px-2 py-1 text-[10px] font-semibold transition",
            compareSelected
              ? "border-[rgba(96,165,250,0.4)] bg-[rgba(96,165,250,0.1)] text-[#93c5fd]"
              : "border-bg-border text-text-muted hover:border-[rgba(96,165,250,0.3)] hover:text-[#93c5fd]"
          )}
        >
          {isCompareColumn ? "PRIMARY" : "CMP"}
        </button>
      )}
    </div>
  );
}

type ComparisonRow = {
  metric: string;
  left: string | number | null;
  right: string | number | null;
  delta: string | null;
  tone?: "up" | "down" | "neutral";
};

function buildComparisonRows(
  left: DiscoveryLabRunDetail,
  right: DiscoveryLabRunDetail,
): ComparisonRow[] {
  const leftWinners = left.report?.winners.length ?? 0;
  const rightWinners = right.report?.winners.length ?? 0;
  const leftEvals = left.report?.deepEvaluations.length ?? 0;
  const rightEvals = right.report?.deepEvaluations.length ?? 0;

  const rows: ComparisonRow[] = [
    {
      metric: "Winners",
      left: leftWinners,
      right: rightWinners,
      delta: leftWinners !== rightWinners ? String(leftWinners - rightWinners) : null,
      tone: leftWinners > rightWinners ? "up" : leftWinners < rightWinners ? "down" : "neutral",
    },
    {
      metric: "Evaluations",
      left: leftEvals,
      right: rightEvals,
      delta: leftEvals !== rightEvals ? String(leftEvals - rightEvals) : null,
      tone: leftEvals > rightEvals ? "up" : leftEvals < rightEvals ? "down" : "neutral",
    },
    {
      metric: "Queries",
      left: left.report?.queryCount ?? 0,
      right: right.report?.queryCount ?? 0,
      delta: null,
      tone: "neutral",
    },
    {
      metric: "Run Duration",
      left: left.completedAt && startedAt(left) ? formatDelta(left.completedAt, startedAt(left)!) : null,
      right: right.completedAt && startedAt(right) ? formatDelta(right.completedAt, startedAt(right)!) : null,
      delta: null,
      tone: "neutral",
    },
  ];

  return rows;
}

function startedAt(run: DiscoveryLabRunDetail): string | null {
  return run.completedAt ?? null;
}

function formatDelta(end: string, start: string): string {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function RunComparisonView({
  left,
  right,
  rows,
}: {
  left: DiscoveryLabRunDetail;
  right: DiscoveryLabRunDetail | null;
  rows: ComparisonRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[14px] border border-[rgba(163,230,53,0.3)] bg-[#121511] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted mb-3">
            {left.packName}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{left.report?.winners.length ?? 0}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">Winners</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">{left.report?.deepEvaluations.length ?? 0}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">Evals</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">{left.report?.queryCount ?? 0}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">Queries</div>
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-[rgba(96,165,250,0.3)] bg-[rgba(96,165,250,0.05)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted mb-3">
            {right?.packName ?? "—"}
          </div>
          {right ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-2xl font-bold text-[#93c5fd]">{right.report?.winners.length ?? 0}</div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">Winners</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary">{right.report?.deepEvaluations.length ?? 0}</div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">Evals</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary">{right.report?.queryCount ?? 0}</div>
                <div className="text-[10px] uppercase tracking-[0.1em] text-text-muted">Queries</div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-text-muted">Select a run to compare</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            {left.packName} winners
          </div>
          <WinnersGrid runDetail={left} />
        </div>
        {right && (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              {right.packName} winners
            </div>
            <WinnersGrid runDetail={right} />
          </div>
        )}
      </div>
    </div>
  );
}

export default async function DiscoveryLabResultsPage() {
  const [catalog, runtimeSnapshot] = await Promise.all([
    serverFetch<DiscoveryLabCatalog>("/api/operator/discovery-lab/catalog"),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  let recentRunDetail: DiscoveryLabRunDetail | null = null;
  const latestCompletedRun = catalog.recentRuns.find((r) => r.status === "COMPLETED");
  if (latestCompletedRun) {
    try {
      recentRunDetail = await serverFetch<DiscoveryLabRunDetail>(
        `/operator/discovery-lab/run?runId=${encodeURIComponent(latestCompletedRun.id)}`
      );
    } catch {
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
