import Link from "next/link";
import { CompactPageHeader, CompactStatGrid, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { RunSessionStartPanel } from "@/components/workbench/workbench-actions";
import { WorkbenchGraderActions } from "@/components/workbench/workbench-grader-actions";
import { WorkbenchFlowStrip } from "@/components/workbench/workbench-flow-strip";
import { buttonVariants } from "@/components/ui/button";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  WorkbenchRunDetailPayload,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

type RunDetailView = {
  id: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  packId: string;
  packName: string;
  profile?: string | null;
  winnerCount?: number | null;
  evaluationCount?: number | null;
  errorMessage?: string | null;
  appliedToLiveAt?: string | null;
  canApplyLive: boolean;
};

export async function WorkbenchGraderSurface(props: { selectedRunId?: string | null }) {
  const runsPayload = await safeFetch<WorkbenchRunListPayload | WorkbenchRunSummary[]>("/api/operator/runs?limit=20");
  const runs = normalizeRuns(runsPayload);
  const selectedRunId = normalizeId(props.selectedRunId) ?? runs[0]?.id ?? null;

  const runPayload = selectedRunId
    ? await safeFetch<WorkbenchRunDetailPayload>(`/api/operator/runs/${encodeURIComponent(selectedRunId)}`)
    : null;
  const selectedRun = normalizeRunDetail(runPayload);

  return (
    <div className="space-y-5">
      <WorkbenchFlowStrip
        current="grader"
        focusLabel={selectedRun?.packName ?? "Choose a run to review"}
        focusDetail="Grade the run, create a tuned draft if needed, then start a session from here when the evidence is good enough."
      />

      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Grader"
        description="Review one completed run. Tune or deploy from the same surface."
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: "Queue", value: String(runs.length), detail: "Recent runs" },
            {
              label: "Selected",
              value: selectedRun?.packName ?? "None",
              detail: selectedRun?.status ?? "Pick a run",
              tone: selectedRun ? "accent" : "default",
            },
            {
              label: "Evaluations",
              value: String(selectedRun?.evaluationCount ?? 0),
              detail: `Winners ${selectedRun?.winnerCount ?? 0}`,
            },
            {
              label: "Deployable",
              value: selectedRun?.canApplyLive ? "Yes" : "No",
              detail: selectedRun?.profile ?? "Awaiting review",
              tone: selectedRun?.canApplyLive ? "warning" : "default",
            },
          ]}
        />
      </CompactPageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.15fr)]">
      <Panel
        title="Run index"
        eyebrow="Review queue"
        description="Keep the queue visible while you review the active run."
        className="xl:sticky xl:top-[calc(var(--shell-header-height)+1rem)] xl:self-start"
      >
        {runs.length > 0 ? (
          <div className="max-h-[calc(100vh-var(--shell-header-height)-14rem)] space-y-2 overflow-y-auto pr-1">
            {runs.map((run) => {
              const isSelected = run.id === selectedRunId;
              return (
                <article
                  key={run.id}
                  className={`grid gap-2 rounded-[12px] border px-3 py-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] ${
                    isSelected ? "border-[rgba(163,230,53,0.24)] bg-[#11150f]" : "border-bg-border bg-bg-hover/20"
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
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link
                      href={`${workbenchRoutes.grader}?runId=${encodeURIComponent(run.id)}`}
                      prefetch={false}
                      className={buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "sm" })}
                    >
                      {isSelected ? "Selected" : "Inspect"}
                    </Link>
                    <Link
                      href={`${workbenchRoutes.graderByRunPrefix}/${encodeURIComponent(run.id)}`}
                      prefetch={false}
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
          <EmptyState compact title="No runs returned" detail="`/api/operator/runs` is empty." />
        )}
      </Panel>

      <Panel
        title={selectedRun ? `Run ${truncate(selectedRun.id)}` : "Run detail"}
        eyebrow="Active review"
        description="Outcome, deployability, and tuning actions stay together."
      >
        {selectedRun ? (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <ScanStat label="Status" value={selectedRun.status} detail={formatTimestamp(selectedRun.createdAt)} tone="accent" />
              <ScanStat
                label="Window"
                value={`${formatTimestamp(selectedRun.startedAt)} -> ${formatTimestamp(selectedRun.completedAt)}`}
                detail={selectedRun.profile ?? "profile unknown"}
              />
              <ScanStat
                label="Evaluations"
                value={String(selectedRun.evaluationCount ?? 0)}
                detail={`Winners ${selectedRun.winnerCount ?? 0}`}
              />
              <ScanStat
                label="Applied"
                value={selectedRun.appliedToLiveAt ? "yes" : "no"}
                detail={selectedRun.appliedToLiveAt ? formatTimestamp(selectedRun.appliedToLiveAt) : "not applied"}
              />
            </div>

            <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={selectedRun.status} />
                {selectedRun.profile ? <StatusPill value={selectedRun.profile} /> : null}
              </div>
              <div className="mt-2 text-xs text-text-secondary">
                Pack {selectedRun.packName} ({selectedRun.packId})
              </div>
              {selectedRun.errorMessage ? (
                <div className="mt-2 rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-2.5 py-2 text-xs text-[var(--danger)]">
                  {selectedRun.errorMessage}
                </div>
              ) : null}
            </div>

            <RunSessionStartPanel
              runId={selectedRun.id}
              disabled={!selectedRun.canApplyLive}
              disabledReason={!selectedRun.canApplyLive ? "Only completed, calibratable runs can be applied." : null}
            />

            <WorkbenchGraderActions runId={selectedRun.id} runStatus={selectedRun.status} />
          </div>
        ) : (
          <EmptyState compact title="No run selected" detail="Pick a run from the queue first." />
        )}
      </Panel>
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

function normalizeRunDetail(payload: WorkbenchRunDetailPayload | null): RunDetailView | null {
  if (!payload) {
    return null;
  }
  return toRunDetailView(
    payload.run as Record<string, unknown>,
    payload.summary as Record<string, unknown>,
  );
}

function toRunDetailView(run: Record<string, unknown>, summary: Record<string, unknown>): RunDetailView | null {
  const id = asString(run.id);
  const status = asString(summary.status) ?? asString(run.status);
  const createdAt = asString(summary.createdAt) ?? asString(run.createdAt);
  const packId = asString(summary.packId) ?? asString(run.packId);
  const packName = asString(summary.packName) ?? asString(run.packName);
  if (!id || !status || !createdAt || !packId || !packName) {
    return null;
  }

  const canApplyLive = asBoolean(summary.canApplyLive)
    ?? (status === "COMPLETED" && run.strategyCalibration != null);

  return {
    id,
    status,
    createdAt,
    startedAt: asString(summary.startedAt) ?? asString(run.startedAt),
    completedAt: asString(summary.completedAt) ?? asString(run.completedAt),
    packId,
    packName,
    profile: asString(summary.profile) ?? asString(run.profile),
    winnerCount: asNumber(summary.winnerCount) ?? asNumber(run.winnerCount),
    evaluationCount: asNumber(summary.evaluationCount) ?? asNumber(run.evaluationCount),
    errorMessage: asString(summary.errorMessage) ?? asString(run.errorMessage),
    appliedToLiveAt: asString(summary.appliedToLiveAt) ?? asString(run.appliedToLiveAt),
    canApplyLive,
  };
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
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
