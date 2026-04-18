import Link from "next/link";
import { CompactPageHeader, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { ApplyRunLiveButton } from "@/components/workbench/workbench-actions";
import { buttonVariants } from "@/components/ui/button";
import { discoveryLabRoutes, workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  WorkbenchRunDetailPayload,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkbenchSandboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ runId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const runsPayload = await serverFetch<WorkbenchRunListPayload | WorkbenchRunSummary[]>("/api/operator/runs?limit=30");
  const runs = normalizeRuns(runsPayload);

  const selectedRunId = params.runId ?? runs[0]?.id ?? null;
  const selectedRun = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;
  const detailPayload = selectedRunId
    ? await safeFetch<WorkbenchRunDetailPayload>(`/api/operator/runs/${encodeURIComponent(selectedRunId)}`)
    : null;
  const runDetail = detailPayload?.run ?? null;
  const appliedToLiveAt = runDetail?.appliedToLiveAt ?? null;
  const canApply = Boolean(selectedRunId && detailPayload?.summary?.canApplyLive);

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Sandbox"
        description="Dedicated run seam for review and live-apply. No redirect detour through discovery-lab routes."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link href={workbenchRoutes.packs} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open packs
            </Link>
            <Link href={discoveryLabRoutes.results} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open results lab
            </Link>
          </div>
        )}
      />

      <Panel
        title="Recent runs"
        eyebrow="Run index"
        description="Newest runs first. Select one to inspect detail and apply-to-live state."
      >
        {runs.length > 0 ? (
          <div className="space-y-2">
            {runs.map((run) => {
              const isSelected = run.id === selectedRunId;
              return (
                <article
                  key={run.id}
                  className={`grid gap-2 rounded-[12px] border px-3 py-2.5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] ${
                    isSelected
                      ? "border-[rgba(163,230,53,0.24)] bg-[#11150f]"
                      : "border-bg-border bg-bg-hover/20"
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill value={run.status} />
                      {run.appliedToLiveAt ? <StatusPill value="applied" /> : null}
                      {run.profile ? <StatusPill value={run.profile} /> : null}
                    </div>
                    <div className="mt-1 text-sm text-text-primary">{run.packName}</div>
                    <div className="mt-1 text-xs text-text-muted">
                      {run.id} · {formatTimestamp(run.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <Link
                      href={`${workbenchRoutes.sandbox}?runId=${encodeURIComponent(run.id)}`}
                      className={buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "sm" })}
                    >
                      {isSelected ? "Selected" : "Inspect"}
                    </Link>
                    <Link
                      href={`${workbenchRoutes.sandboxByRunPrefix}/${encodeURIComponent(run.id)}`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Full page
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState compact title="No runs found" detail="Start a run from packs to populate sandbox history." />
        )}
      </Panel>

      <Panel
        title={selectedRun?.packName ?? "Run detail"}
        eyebrow="Selected run"
        description="Detail is read from `/api/operator/runs/:id`; apply uses the run-owned live endpoint."
      >
        {selectedRunId && runDetail ? (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <ScanStat label="Run id" value={truncate(selectedRunId)} detail={selectedRunId} tone="accent" />
              <ScanStat label="Status" value={runDetail.status} detail={formatTimestamp(runDetail.createdAt)} />
              <ScanStat
                label="Evaluations"
                value={String(runDetail.evaluationCount ?? 0)}
                detail={`Winners ${runDetail.winnerCount ?? 0}`}
              />
              <ScanStat
                label="Applied"
                value={appliedToLiveAt ? "yes" : "no"}
                detail={appliedToLiveAt ? formatTimestamp(appliedToLiveAt) : "not applied"}
              />
            </div>

            <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={runDetail.status} />
                {runDetail.profile ? <StatusPill value={runDetail.profile} /> : null}
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                Pack {runDetail.packName} ({runDetail.packId})
              </div>
              {runDetail.errorMessage ? (
                <div className="mt-2 rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-2.5 py-2 text-xs text-[var(--danger)]">
                  {runDetail.errorMessage}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <ApplyRunLiveButton runId={selectedRunId} disabled={!canApply} />
              {!canApply ? (
                <div className="rounded-[10px] border border-bg-border bg-bg-hover/25 px-2.5 py-2 text-xs text-text-muted">
                  Only completed runs can be applied.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState compact title="No run selected" detail="Select a run from above to inspect and apply it." />
        )}
      </Panel>
    </div>
  );
}

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    return await serverFetch<T>(path);
  } catch {
    return null;
  }
}

function normalizeRuns(payload: WorkbenchRunListPayload | WorkbenchRunSummary[]): WorkbenchRunSummary[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.runs) ? payload.runs : [];
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "unknown";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function truncate(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 9)}...${value.slice(-6)}`;
}
