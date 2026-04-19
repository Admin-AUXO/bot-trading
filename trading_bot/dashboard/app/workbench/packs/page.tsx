import Link from "next/link";
import { CompactPageHeader, CompactStatGrid, DisclosurePanel, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { StartPackRunButton } from "@/components/workbench/workbench-actions";
import { WorkbenchFlowStrip } from "@/components/workbench/workbench-flow-strip";
import { buttonVariants } from "@/components/ui/button";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  DiscoveryLabPack,
  TradingSessionSnapshot,
  WorkbenchPackDetailPayload,
  WorkbenchPackListPayload,
  WorkbenchPackRunsPayload,
  WorkbenchPackSummary,
  WorkbenchRunSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkbenchPacksPage({
  searchParams,
}: {
  searchParams?: Promise<{ pack?: string }>;
}) {
  const params = (await searchParams) ?? {};

  const packsPayload = await serverFetch<WorkbenchPackListPayload | WorkbenchPackSummary[]>("/api/operator/packs");
  const packs = normalizePacks(packsPayload);
  const currentSession = extractCurrentSession(packsPayload);

  const selectedPackId = params.pack ?? packs[0]?.id ?? null;
  const selectedPack = selectedPackId ? packs.find((pack) => pack.id === selectedPackId) ?? null : null;
  const [detailPayload, runsPayload] = selectedPackId
    ? await Promise.all([
        safeFetch<WorkbenchPackDetailPayload>(`/api/operator/packs/${encodeURIComponent(selectedPackId)}`),
        safeFetch<WorkbenchPackRunsPayload>(
          `/api/operator/packs/${encodeURIComponent(selectedPackId)}/runs?limit=12`,
        ),
      ])
    : [null, null];

  const packDetail = detailPayload?.pack ?? null;
  const packRuns = normalizeRuns(runsPayload?.runs ?? []);

  return (
    <div className="space-y-5">
      <WorkbenchFlowStrip
        current="packs"
        focusLabel={selectedPack?.name ?? "Choose a pack"}
        focusDetail="Pick the strategy shape here, then open the editor before you waste time running the wrong draft."
      />

      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Packs"
        description="Pick the pack. Then edit, run, and review it in order."
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: "Catalog", value: formatCount(packs.length), detail: "Visible packs" },
            {
              label: "Selected",
              value: selectedPack?.name ?? "None",
              detail: selectedPack ? selectedPack.kind : "Pick a pack",
              tone: selectedPack ? "accent" : "default",
            },
            {
              label: "Recent runs",
              value: formatCount(packRuns.length),
              detail: packRuns[0]?.status ?? "No recent runs",
            },
            {
              label: "Live session",
              value: currentSession?.packName ?? "Idle",
              detail: currentSession ? `Since ${formatTimestamp(currentSession.startedAt)}` : "No active deployment",
              tone: currentSession ? "warning" : "default",
            },
          ]}
        />
      </CompactPageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.2fr)] 2xl:grid-cols-[minmax(20rem,0.75fr)_max-content]">
        <Panel
          title="Pack inventory"
          eyebrow="Catalog"
          description="Keep the catalog visible while you inspect one active pack."
          className="xl:sticky xl:top-[calc(var(--shell-header-height)+1rem)] xl:self-start"
        >
          {packs.length === 0 ? (
            <EmptyState
              compact
              title="No packs returned"
              detail="The backend has no pack rows right now, so there is nothing to schedule."
            />
          ) : (
            <div className="max-h-[calc(100vh-var(--shell-header-height)-14rem)] space-y-2 overflow-y-auto pr-1">
              {packs.map((pack) => {
                const isSelected = pack.id === selectedPackId;
                return (
                  <article
                    key={pack.id}
                    className={`rounded-[14px] border px-3 py-3 ${
                      isSelected
                        ? "border-[rgba(163,230,53,0.24)] bg-[#11150f]"
                        : "border-bg-border bg-bg-hover/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display text-[0.95rem] font-semibold tracking-[-0.02em] text-text-primary">
                          {pack.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-text-secondary">{pack.description}</div>
                      </div>
                      <StatusPill value={pack.kind} />
                    </div>

                    <div className="mt-2 grid gap-1 text-xs text-text-muted">
                      <span>Updated {formatTimestamp(pack.updatedAt)}</span>
                      <span>Runs {formatCount(pack.runCount)}</span>
                      <span>Latest run {pack.latestRunStatus ?? "unknown"}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`${workbenchRoutes.packs}?pack=${encodeURIComponent(pack.id)}`}
                        prefetch={false}
                        className={buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "sm" })}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </Link>
                      <Link
                        href={`${workbenchRoutes.editor}?pack=${encodeURIComponent(pack.id)}`}
                        prefetch={false}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Edit
                      </Link>
                      <StartPackRunButton packId={pack.id} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title={packDetail?.name ?? selectedPack?.name ?? "Pack detail"}
          eyebrow="Active selection"
          description="Summary first. Recent runs only when you need them."
        >
          {selectedPackId ? (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <ScanStat label="Pack id" value={truncate(selectedPackId)} detail={selectedPackId} tone="accent" />
                <ScanStat
                  label="Run count"
                  value={String(packRuns.length)}
                  detail={packRuns[0]?.status ?? "No runs"}
                />
                <ScanStat
                  label="Sources"
                  value={String(packDetail?.defaultSources.length ?? 0)}
                  detail={(packDetail?.defaultSources ?? []).join(", ") || "None"}
                />
                <ScanStat
                  label="Recipes"
                  value={String(packDetail?.recipes.length ?? 0)}
                  detail={packDetail?.defaultProfile ?? "profile unknown"}
                />
              </div>

              {packDetail ? (
                <div className="rounded-[12px] border border-bg-border bg-bg-hover/20 p-3">
                  <div className="text-xs text-text-secondary">{packDetail.description || "No description provided."}</div>
                  {packDetail.thesis ? <div className="mt-2 text-xs text-text-muted">Thesis: {packDetail.thesis}</div> : null}
                  <div className="mt-2 text-xs text-text-muted">
                    Threshold overrides: {Object.keys(packDetail.thresholdOverrides ?? {}).length}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`${workbenchRoutes.editor}?pack=${encodeURIComponent(selectedPackId)}`}
                      prefetch={false}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Open editor
                    </Link>
                    <StartPackRunButton packId={selectedPackId} />
                  </div>
                </div>
              ) : null}

              {packRuns.length > 0 ? (
                <DisclosurePanel
                  title="Recent runs"
                  description="Open only when you need recent sandbox context for this pack."
                  badge={<span className="meta-chip">{formatCount(packRuns.length)} runs</span>}
                >
                  <div className="space-y-2">
                    {packRuns.map((run) => (
                      <article
                        key={run.id}
                        className="grid gap-2 rounded-[12px] border border-bg-border bg-bg-hover/20 px-3 py-2.5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill value={run.status} />
                            {run.appliedToLiveAt ? <StatusPill value="applied" /> : null}
                          </div>
                          <div className="mt-1 text-sm text-text-primary">{run.id}</div>
                          <div className="mt-1 text-xs text-text-muted">
                            Created {formatTimestamp(run.createdAt)}
                            {run.completedAt ? ` · Completed ${formatTimestamp(run.completedAt)}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <Link
                            href={`${workbenchRoutes.runs}?runId=${encodeURIComponent(run.id)}`}
                            prefetch={false}
                            className={buttonVariants({ variant: "secondary", size: "sm" })}
                          >
                            Open run
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </DisclosurePanel>
              ) : (
                <EmptyState
                  compact
                  title="No runs for this pack"
                  detail="Start one from this page to populate sandbox history."
                />
              )}
            </div>
          ) : (
            <EmptyState compact title="No pack selected" detail="Pick a pack from the catalog to inspect it." />
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

function normalizePacks(
  payload: WorkbenchPackListPayload | WorkbenchPackSummary[] | null | undefined,
): WorkbenchPackSummary[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.packs) ? payload.packs : [];
}

function normalizeRuns(runs: WorkbenchRunSummary[] | null | undefined): WorkbenchRunSummary[] {
  return Array.isArray(runs) ? runs : [];
}

function extractCurrentSession(
  payload: WorkbenchPackListPayload | WorkbenchPackSummary[] | null | undefined,
): TradingSessionSnapshot | null {
  if (!payload || Array.isArray(payload)) {
    return null;
  }
  return payload.currentSession ?? null;
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

function formatCount(value: number | null | undefined): string {
  return Number.isFinite(value) ? String(value) : "0";
}

function truncate(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 9)}...${value.slice(-6)}`;
}
