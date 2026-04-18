import Link from "next/link";
import { CompactPageHeader, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { WorkbenchPackEditorForm } from "@/components/workbench/workbench-pack-editor-form";
import { StartPackRunButton } from "@/components/workbench/workbench-actions";
import { buttonVariants } from "@/components/ui/button";
import { workbenchRoutes } from "@/lib/dashboard-routes";
import { serverFetch } from "@/lib/server-api";
import type {
  DiscoveryLabPack,
  WorkbenchPackListPayload,
  WorkbenchPackSummary,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

type PackDetailPayload = {
  pack?: DiscoveryLabPack;
  recentRuns?: WorkbenchRunSummary[];
};

export async function WorkbenchEditorSurface(props: { selectedPackId?: string | null }) {
  const listPayload = await safeFetch<WorkbenchPackListPayload | WorkbenchPackSummary[]>("/api/operator/packs");
  const packs = normalizePacks(listPayload);
  const selectedPackId = normalizeId(props.selectedPackId) ?? packs[0]?.id ?? null;

  const [detailPayload, runsPayload] = selectedPackId
    ? await Promise.all([
        safeFetch<PackDetailPayload>(`/api/operator/packs/${encodeURIComponent(selectedPackId)}`),
        safeFetch<WorkbenchRunListPayload | { runs?: WorkbenchRunSummary[] }>(
          `/api/operator/packs/${encodeURIComponent(selectedPackId)}/runs?limit=20`,
        ),
      ])
    : [null, null];

  const pack = detailPayload?.pack ?? null;
  const recentRuns = mergeRuns(detailPayload?.recentRuns, runsPayload);

  return (
    <div className="space-y-5">
      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Editor"
        description="Backend-owned pack editor over `/api/operator/packs*` with direct save and start-run actions."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link href={workbenchRoutes.packs} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Open packs
            </Link>
            <Link href={workbenchRoutes.grader} className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Open grader
            </Link>
          </div>
        )}
      />

      <Panel
        title="Pack selector"
        eyebrow="Catalog"
        description="Pick a pack, edit it, save through the dedicated pack route, then launch a run."
      >
        {packs.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {packs.map((packItem) => {
              const isSelected = packItem.id === selectedPackId;
              return (
                <article
                  key={packItem.id}
                  className={`rounded-[12px] border px-3 py-3 ${
                    isSelected ? "border-[rgba(163,230,53,0.24)] bg-[#11150f]" : "border-bg-border bg-bg-hover/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold tracking-[-0.02em] text-text-primary">
                        {packItem.name}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs text-text-muted">
                        {packItem.description || "No description"}
                      </div>
                    </div>
                    <StatusPill value={packItem.kind} />
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">Updated {formatTimestamp(packItem.updatedAt)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`${workbenchRoutes.editor}?pack=${encodeURIComponent(packItem.id)}`}
                      className={buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "sm" })}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Link>
                    <Link
                      href={`${workbenchRoutes.editorByIdPrefix}/${encodeURIComponent(packItem.id)}`}
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
          <EmptyState compact title="No packs available" detail="`/api/operator/packs` returned an empty list." />
        )}
      </Panel>

      <Panel
        title={pack?.name ?? "Pack detail"}
        eyebrow="Selected pack"
        description="This editor writes pack updates via `/api/operator/packs/:id` and starts runs via `/api/operator/packs/:id/runs`."
      >
        {pack ? (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <ScanStat label="Pack id" value={truncate(pack.id)} detail={pack.id} tone="accent" />
              <ScanStat label="Profile" value={pack.defaultProfile} detail={`Sources ${pack.defaultSources.length}`} />
              <ScanStat
                label="Recipes"
                value={String(Array.isArray(pack.recipes) ? pack.recipes.length : 0)}
                detail="JSON-editable"
              />
              <ScanStat
                label="Recent runs"
                value={String(recentRuns.length)}
                detail={recentRuns[0]?.status ?? "none"}
              />
            </div>

            <WorkbenchPackEditorForm
              pack={{
                id: pack.id,
                kind: pack.kind,
                name: pack.name,
                description: pack.description,
                thesis: pack.thesis,
                defaultProfile: pack.defaultProfile,
                defaultSources: pack.defaultSources,
                thresholdOverrides: asRecord(pack.thresholdOverrides),
                recipes: Array.isArray(pack.recipes) ? pack.recipes : [],
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <StartPackRunButton packId={pack.id} />
              <div className="text-xs text-text-muted">Starts a run on the dedicated operator pack route.</div>
            </div>

            {recentRuns.length > 0 ? (
              <div className="space-y-2">
                {recentRuns.map((run) => (
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
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Link
                        href={`${workbenchRoutes.graderByRunPrefix}/${encodeURIComponent(run.id)}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Grade
                      </Link>
                      <Link
                        href={`${workbenchRoutes.sandboxByRunPrefix}/${encodeURIComponent(run.id)}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Sandbox
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState compact title="No runs yet" detail="Start a run from this editor to seed grader and sandbox." />
            )}
          </div>
        ) : (
          <EmptyState compact title="No pack selected" detail="Select a pack from the catalog first." />
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

function normalizePacks(payload: WorkbenchPackListPayload | WorkbenchPackSummary[] | null): WorkbenchPackSummary[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.packs) ? payload.packs : [];
}

function mergeRuns(
  detailRuns: WorkbenchRunSummary[] | undefined,
  runsPayload: WorkbenchRunListPayload | { runs?: WorkbenchRunSummary[] } | null,
): WorkbenchRunSummary[] {
  if (Array.isArray(detailRuns) && detailRuns.length > 0) {
    return detailRuns;
  }
  if (!runsPayload || !Array.isArray(runsPayload.runs)) {
    return [];
  }
  return runsPayload.runs;
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
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 9)}...${value.slice(-6)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
