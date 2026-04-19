import Link from "next/link";
import { CompactPageHeader, CompactStatGrid, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { RunSessionStartPanel } from "@/components/workbench/workbench-actions";
import { WorkbenchGraderActions } from "@/components/workbench/workbench-grader-actions";
import { WorkbenchFlowStrip } from "@/components/workbench/workbench-flow-strip";
import { WorkbenchRunResultsTable } from "@/components/workbench/workbench-run-results-table";
import { buttonVariants } from "@/components/ui/button";
import { buildWorkbenchRunResultRows, summarizeWorkbenchRunResults } from "@/lib/workbench-run-results";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  WorkbenchRunDetailPayload,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

export async function WorkbenchRunsSurface(props: { selectedRunId?: string | null }) {
  const runsPayload = await serverFetch<WorkbenchRunListPayload | WorkbenchRunSummary[]>("/api/operator/runs?limit=12");
  const runs = normalizeRuns(runsPayload);
  const selectedRunId = normalizeId(props.selectedRunId) ?? runs[0]?.id ?? null;
  const selectedSummary = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;

  const detailPayload = selectedRunId
    ? await safeFetch<WorkbenchRunDetailPayload>(`/api/operator/runs/${encodeURIComponent(selectedRunId)}`)
    : null;
  const runDetail = detailPayload?.run ?? null;
  const canApply = Boolean(selectedRunId && detailPayload?.summary?.canApplyLive);
  const resultRows = runDetail ? buildWorkbenchRunResultRows(runDetail) : [];
  const resultSummary = summarizeWorkbenchRunResults(resultRows);

  return (
    <div className="space-y-5">
      <WorkbenchFlowStrip
        current="runs"
        focusLabel={selectedSummary?.packName ?? "Choose a run"}
        focusDetail={selectedRunId
          ? `Run ${truncate(selectedRunId)} · results, grade, and deployment decisions stay on one surface.`
          : "Review one run at a time and move it forward from the same page."}
      />

      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Runs"
        description="Review recent runs, judge the output, and move the right one into a session."
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: "Queue", value: String(runs.length), detail: "Recent runs" },
            {
              label: "Selected",
              value: selectedSummary?.packName ?? "None",
              detail: selectedSummary?.status ?? "Pick a run",
              tone: selectedSummary ? "accent" : "default",
            },
            {
              label: "Outcomes",
              value: `${resultSummary.winners}/${resultSummary.rejected}`,
              detail: "winner / rejected",
              tone: resultSummary.winners > 0 ? "accent" : "default",
            },
            {
              label: "Deployable",
              value: canApply ? "Yes" : "No",
              detail: selectedSummary?.profile ?? "Awaiting review",
              tone: canApply ? "warning" : "default",
            },
          ]}
        />
      </CompactPageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.55fr)_minmax(19rem,0.95fr)]">
        <Panel
          title="Run queue"
          eyebrow="Recent runs"
          description="Open one run and keep it in view while you decide what to do next."
          className="xl:sticky xl:top-[calc(var(--shell-header-height)+1rem)] xl:self-start"
        >
          {runs.length > 0 ? (
            <div className="max-h-[calc(100vh-var(--shell-header-height)-14rem)] space-y-2 overflow-y-auto pr-1">
              {runs.map((run) => {
                const isSelected = run.id === selectedRunId;
                return (
                  <article
                    key={run.id}
                    className={`rounded-[12px] border px-3 py-3 ${
                      isSelected ? "border-[rgba(163,230,53,0.24)] bg-[#11150f]" : "border-bg-border bg-bg-hover/20"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill value={run.status} />
                      {run.appliedToLiveAt ? <StatusPill value="applied" /> : null}
                      {run.profile ? <StatusPill value={run.profile} /> : null}
                    </div>
                    <div className="mt-2 text-sm font-medium text-text-primary">{run.packName}</div>
                    <div className="mt-1 text-xs text-text-secondary">{formatTimestamp(run.createdAt)}</div>
                    <div className="mt-2 grid gap-1 text-xs text-text-muted">
                      <span>Run {truncate(run.id)}</span>
                      <span>Winners {run.winnerCount ?? 0} · Evaluations {run.evaluationCount ?? 0}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`${workbenchRoutes.runs}?runId=${encodeURIComponent(run.id)}`}
                        prefetch={false}
                        className={buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "sm" })}
                      >
                        {isSelected ? "Current run" : "Open run"}
                      </Link>
                      <Link
                        href={`${workbenchRoutes.editor}?pack=${encodeURIComponent(run.packId)}`}
                        prefetch={false}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Open pack
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-bg-border bg-bg-hover text-text-muted">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/></svg>
              </div>
              <div className="text-sm font-medium text-text-secondary">No runs found</div>
              <div className="mt-1 max-w-xs text-xs text-text-muted">
                Start a run from Packs or Editor to populate review.
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={workbenchRoutes.packs}
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Browse packs
                </Link>
                <Link
                  href={workbenchRoutes.editor}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Open editor
                </Link>
              </div>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Results"
            eyebrow="Primary review"
            description="One row per mint. Winners, passes, and rejections stay explicit, and the row actions work like a normal dashboard table."
          >
            {runDetail ? (
              <WorkbenchRunResultsTable run={runDetail} />
            ) : (
              <EmptyState compact title="No run selected" detail="Open a run from the queue to inspect the results table." />
            )}
          </Panel>

          {runDetail?.errorMessage || !runDetail?.report ? (
            <Panel
              title="Diagnostics"
              eyebrow="Secondary evidence"
              description="Only show the run issues that change whether you trust the table above."
            >
              <div className="space-y-2 text-sm text-text-secondary">
                {runDetail?.errorMessage ? (
                  <div className="rounded-[12px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-3 py-2 text-[var(--danger)]">
                    {runDetail.errorMessage}
                  </div>
                ) : null}
                {!runDetail?.report ? (
                  <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 px-3 py-2">
                    {runDetail?.status === "COMPLETED"
                      ? "Report still generating, check back in 30s."
                      : "This run does not have a persisted report yet, so the results table cannot render token rows."}
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          <Panel
            title="Run summary"
            eyebrow="Current run"
            description="Keep the facts and next actions tight. Do not restate the same run in three places."
          >
            {runDetail ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <ScanStat label="Status" value={runDetail.status} detail={formatTimestamp(runDetail.createdAt)} tone="accent" />
                  <ScanStat
                    label="Window"
                    value={`${formatTimestamp(runDetail.startedAt)} -> ${formatTimestamp(runDetail.completedAt)}`}
                    detail={runDetail.profile ?? "profile unknown"}
                  />
                  <ScanStat
                    label="Winners"
                    value={String(resultSummary.winners)}
                    detail={`Pass ${resultSummary.passes} · Reject ${resultSummary.rejected}`}
                  />
                  <ScanStat
                    label="Evaluations"
                    value={String(runDetail.evaluationCount ?? 0)}
                    detail={`Run ${truncate(runDetail.id)}`}
                  />
                </div>

                <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={runDetail.status} />
                    {runDetail.profile ? <StatusPill value={runDetail.profile} /> : null}
                    {runDetail.appliedToLiveAt ? <StatusPill value="applied" /> : null}
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">
                    Pack {runDetail.packName} ({runDetail.packId})
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`${workbenchRoutes.editor}?pack=${encodeURIComponent(runDetail.packId)}`}
                      prefetch={false}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Open pack
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState compact title="No run selected" detail="Pick a run first so the summary and actions have a real target." />
            )}
          </Panel>

          <Panel
            title="Grade"
            eyebrow="Decision review"
            description="Review the grade, persist it if needed, and create a tuned draft from the same rail."
          >
            {runDetail ? (
              <WorkbenchGraderActions runId={runDetail.id} runStatus={runDetail.status} />
            ) : (
              <EmptyState compact title="No run selected" detail="Open a run before you review the grade." />
            )}
          </Panel>

          <Panel
            title="Deploy"
            eyebrow="Session start"
            description="Only runs with deployable calibration should leave this page and become a session."
          >
            {runDetail ? (
              <RunSessionStartPanel
                runId={runDetail.id}
                disabled={!canApply}
                disabledReason={!canApply ? "Only completed runs with deployable calibration can start a session." : null}
              />
            ) : (
              <EmptyState compact title="No run selected" detail="Open a run before you try to start a session." />
            )}
          </Panel>
        </div>
      </div>
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

function normalizeRuns(payload: WorkbenchRunListPayload | WorkbenchRunSummary[] | null): WorkbenchRunSummary[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.runs) ? payload.runs : [];
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
