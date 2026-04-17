"use client";

import clsx from "clsx";
import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  CompactPageHeader,
  CompactStatGrid,
  EmptyState,
  ScanStat,
  StatusPill,
} from "@/components/dashboard-primitives";
import { DiscoveryLabResultsBoard } from "@/components/discovery-lab-results-board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/api";
import { formatInteger, formatTimestamp } from "@/lib/format";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabRunDetail,
  DiscoveryLabRunSummary,
  DiscoveryLabRuntimeSnapshot,
} from "@/lib/types";

type DiscoveryLabResultsRouteProps = {
  initialCatalog: DiscoveryLabCatalog;
  initialRuntimeSnapshot: DiscoveryLabRuntimeSnapshot;
  initialRunDetail: DiscoveryLabRunDetail | null;
};

export function DiscoveryLabResultsRoute({
  initialCatalog,
  initialRuntimeSnapshot,
  initialRunDetail,
}: DiscoveryLabResultsRouteProps) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState(initialRuntimeSnapshot);
  const [runDetail, setRunDetail] = useState(initialRunDetail);
  const [selectedRunId, setSelectedRunId] = useState(initialRunDetail?.id ?? "");
  const [runError, setRunError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!runDetail || runDetail.status !== "RUNNING") return;
    const timer = window.setInterval(() => {
      void refreshAll(runDetail.id);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [runDetail?.id, runDetail?.status]);

  async function refreshAll(preferredRunId = selectedRunId) {
    try {
      const [nextCatalog, nextRuntime] = await Promise.all([
        fetchJson<DiscoveryLabCatalog>("/operator/discovery-lab/catalog"),
        fetchJson<DiscoveryLabRuntimeSnapshot>("/status"),
      ]);
      setCatalog(nextCatalog);
      setRuntimeSnapshot(nextRuntime);

      const fallbackRunId =
        preferredRunId
        || nextCatalog.activeRun?.id
        || nextCatalog.recentRuns.find((run) => run.status === "COMPLETED")?.id
        || "";

      if (!fallbackRunId) {
        setSelectedRunId("");
        setRunDetail(null);
        setRunError(null);
        return;
      }

      const nextRun = await loadRunDetail(fallbackRunId);
      setSelectedRunId(nextRun.id);
      setRunDetail(nextRun);
      setRunError(null);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "results refresh failed");
    }
  }

  function handleSelectRun(runId: string) {
    setSelectedRunId(runId);
    startTransition(async () => {
      try {
        const nextRun = await loadRunDetail(runId);
        setRunDetail(nextRun);
        setRunError(null);
      } catch (error) {
        setRunError(error instanceof Error ? error.message : "failed to load run");
      }
    });
  }

  const recentRuns = catalog.recentRuns.slice(0, 12);
  const focusRun = runDetail ?? catalog.activeRun ?? null;
  const queryCount = runDetail?.report?.queryCount ?? focusRun?.queryCount ?? null;
  const evaluationCount = runDetail?.report?.deepEvaluations.length ?? focusRun?.evaluationCount ?? null;
  const winnerCount = runDetail?.report?.winners.length ?? focusRun?.winnerCount ?? null;

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Discovery lab"
        title="Results"
        badges={focusRun ? <StatusPill value={focusRun.status} /> : undefined}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => startTransition(async () => refreshAll())} disabled={isPending}>
              <RefreshCcw className={clsx("h-4 w-4", isPending && "animate-spin")} />
              Refresh
            </Button>
            <Link
              href="/discovery-lab/studio"
              className="inline-flex h-9 items-center justify-center rounded-[10px] border border-bg-border bg-[#141517] px-3 text-sm font-medium text-text-primary transition hover:border-bg-border/80 hover:bg-[#1a1b1e]"
            >
              Open studio
            </Link>
          </div>
        )}
      >
        {focusRun ? (
          <CompactStatGrid
            className="xl:grid-cols-5"
            items={[
              { label: "Pack", value: focusRun.packName, detail: focusRun.profile, tone: "default" },
              {
                label: "Queries",
                value: queryCount !== null ? formatInteger(queryCount) : "Running",
                detail: "Requests",
                tone: "default",
              },
              {
                label: "Evaluations",
                value: evaluationCount !== null ? formatInteger(evaluationCount) : "Running",
                detail: "Deep checks",
                tone: "default",
              },
              {
                label: "Winners",
                value: winnerCount !== null ? formatInteger(winnerCount) : "Running",
                detail: "Manual-entry candidates",
                tone: winnerCount && winnerCount > 0 ? "accent" : "default",
              },
              {
                label: "Run state",
                value: focusRun.completedAt ? formatTimestamp(focusRun.completedAt) : "In progress",
                detail: focusRun.status === "RUNNING" ? "Polling every 3s" : "Latest completed run",
                tone: focusRun.status === "RUNNING" ? "warning" : "default",
              },
            ]}
          />
        ) : null}
      </CompactPageHeader>

      {runError ? (
        <div className="rounded-[14px] border border-[rgba(248,113,113,0.24)] bg-[rgba(248,113,113,0.06)] px-4 py-3 text-sm text-[var(--danger)]">
          {runError}
        </div>
      ) : null}

      {!focusRun ? (
        <EmptyState
          title="No run selected"
          detail="Run a pack from Studio, then review it here."
        />
      ) : null}

      <DiscoveryLabResultsBoard
        runDetail={runDetail}
        runtimeSnapshot={runtimeSnapshot}
        onRuntimeSnapshotChange={setRuntimeSnapshot}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <details className="group rounded-[16px] border border-bg-border bg-[#101012]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Run history</div>
              <div className="mt-1 text-xs text-text-secondary">Keep collapsed unless you need to reopen a run.</div>
            </div>
            <Badge variant="default">{recentRuns.length}</Badge>
          </summary>
          <div className="space-y-2 border-t border-bg-border px-4 py-4">
            {recentRuns.length > 0 ? recentRuns.map((run) => (
              <RunHistoryButton
                key={run.id}
                run={run}
                selected={selectedRunId === run.id}
                onSelect={() => handleSelectRun(run.id)}
              />
            )) : (
              <EmptyState
                title="No recorded runs"
                detail="The studio has not launched a discovery pack yet."
                compact
              />
            )}
          </div>
        </details>

        {runDetail ? (
          <details className="group rounded-[16px] border border-bg-border bg-[#101012]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-text-primary">Run diagnostics</div>
                <div className="mt-1 text-xs text-text-secondary">Logs and metadata. Closed by default.</div>
              </div>
              <Badge variant="default">Details</Badge>
            </summary>
            <div className="space-y-4 border-t border-bg-border px-4 py-4">
              {(runDetail.stdout || runDetail.stderr) ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <DiagnosticBlock label="stdout" content={runDetail.stdout} />
                  <DiagnosticBlock label="stderr" content={runDetail.stderr} danger />
                </div>
              ) : (
                <div className="text-sm text-text-secondary">No console output captured for this run.</div>
              )}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ScanStat label="Sources" value={runDetail.sources.join(", ")} detail="Run scope" />
                <ScanStat label="Pack kind" value={runDetail.packKind} detail={runDetail.packId} />
                <ScanStat label="Started" value={formatTimestamp(runDetail.startedAt)} detail="Run start" />
                <ScanStat label="Updated" value={formatTimestamp(runDetail.completedAt ?? runDetail.startedAt)} detail="Last event" />
              </div>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

async function loadRunDetail(runId: string) {
  return fetchJson<DiscoveryLabRunDetail>(
    `/operator/discovery-lab/runs/${encodeURIComponent(runId)}`,
  );
}

function RunHistoryButton({
  run,
  selected,
  onSelect,
}: {
  run: DiscoveryLabRunSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "flex w-full items-start justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-left transition",
        selected
          ? "border-[rgba(163,230,53,0.3)] bg-[#121511]"
          : "border-bg-border bg-[#0c0d0e] hover:border-bg-border/80 hover:bg-[#111214]",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary">{run.packName}</div>
        <div className="mt-1 text-[11px] text-text-muted">
          {run.profile} · {run.completedAt ? formatTimestamp(run.completedAt) : "In progress"}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill value={run.status} />
        <span className="text-[11px] text-text-muted">
          {run.winnerCount !== null ? `${formatInteger(run.winnerCount)} win` : "Running"}
        </span>
      </div>
    </button>
  );
}

function DiagnosticBlock({
  label,
  content,
  danger = false,
}: {
  label: string;
  content: string;
  danger?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
        {label}
      </div>
      <pre
        className={clsx(
          "max-h-64 overflow-auto rounded-[10px] border p-3 text-xs",
          danger
            ? "border-[rgba(248,113,113,0.2)] bg-[rgba(248,113,113,0.05)] text-[var(--danger)]"
            : "border-bg-border bg-[#0d0d0f] text-text-secondary",
        )}
      >
        {content?.trim().length ? content : "No output"}
      </pre>
    </div>
  );
}
