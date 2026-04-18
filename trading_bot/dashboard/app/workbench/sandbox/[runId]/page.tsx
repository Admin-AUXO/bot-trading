import Link from "next/link";
import { notFound } from "next/navigation";
import { CompactPageHeader, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { ApplyRunLiveButton } from "@/components/workbench/workbench-actions";
import { buttonVariants } from "@/components/ui/button";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  WorkbenchRunDetailPayload,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkbenchSandboxRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const [runPayload, runsPayload] = await Promise.all([
    safeFetch<WorkbenchRunDetailPayload>(`/api/operator/runs/${encodeURIComponent(runId)}`),
    safeFetch<WorkbenchRunListPayload | WorkbenchRunSummary[]>("/api/operator/runs?limit=12"),
  ]);
  const run = runPayload?.run ?? null;
  if (!run) {
    notFound();
  }
  const appliedToLiveAt = run.appliedToLiveAt ?? null;
  const runs = normalizeRuns(runsPayload);
  const canApply = Boolean(runPayload?.summary?.canApplyLive);

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Strategy workbench"
        title={`Sandbox run ${truncate(run.id)}`}
        description="Dedicated run page backed by `/api/operator/runs/:id` and run-owned apply-live."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${workbenchRoutes.sandbox}?runId=${encodeURIComponent(run.id)}`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Open in sandbox list
            </Link>
            <Link href={workbenchRoutes.packs} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Back to packs
            </Link>
          </div>
        )}
      />

      <Panel title="Run summary" eyebrow="Detail" description="Primary run contract from backend run seam.">
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <ScanStat label="Status" value={run.status} detail={formatTimestamp(run.createdAt)} tone="accent" />
            <ScanStat
              label="Window"
              value={`${formatTimestamp(run.startedAt)} -> ${formatTimestamp(run.completedAt)}`}
              detail={run.profile ?? "profile unknown"}
            />
            <ScanStat
              label="Evaluations"
              value={String(run.evaluationCount ?? 0)}
              detail={`Winners ${run.winnerCount ?? 0}`}
            />
            <ScanStat
              label="Applied"
              value={appliedToLiveAt ? "yes" : "no"}
              detail={appliedToLiveAt ? formatTimestamp(appliedToLiveAt) : "not applied"}
            />
          </div>

          <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill value={run.status} />
              {run.profile ? <StatusPill value={run.profile} /> : null}
              <StatusPill value={run.packName} />
            </div>
            <div className="mt-2 text-xs text-text-secondary">
              Pack id: {run.packId} | Run id: {run.id}
            </div>
            {run.errorMessage ? (
              <div className="mt-2 rounded-[10px] border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-2.5 py-2 text-xs text-[var(--danger)]">
                {run.errorMessage}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <ApplyRunLiveButton runId={run.id} disabled={!canApply} />
            {!canApply ? (
              <div className="rounded-[10px] border border-bg-border bg-bg-hover/25 px-2.5 py-2 text-xs text-text-muted">
                Only completed runs can be applied.
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Nearby runs" eyebrow="Context" description="Recent runs so navigation stays local to sandbox.">
        {runs.length > 0 ? (
          <div className="space-y-2">
            {runs.map((item) => (
              <article
                key={item.id}
                className={`grid gap-2 rounded-[12px] border px-3 py-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)] ${
                  item.id === run.id
                    ? "border-[rgba(163,230,53,0.24)] bg-[#11150f]"
                    : "border-bg-border bg-bg-hover/20"
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={item.status} />
                    {item.appliedToLiveAt ? <StatusPill value="applied" /> : null}
                  </div>
                  <div className="mt-1 text-sm text-text-primary">{item.packName}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {item.id} · {formatTimestamp(item.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <Link
                    href={`${workbenchRoutes.sandboxByRunPrefix}/${encodeURIComponent(item.id)}`}
                    className={buttonVariants({ variant: item.id === run.id ? "secondary" : "ghost", size: "sm" })}
                  >
                    {item.id === run.id ? "Current" : "Open"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState compact title="No nearby runs" detail="The backend returned only this run detail." />
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

function normalizeRuns(payload: WorkbenchRunListPayload | WorkbenchRunSummary[] | null): WorkbenchRunSummary[] {
  if (!payload) {
    return [];
  }
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
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
