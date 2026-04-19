import Link from "next/link";
import { CompactPageHeader, CompactStatGrid, DisclosurePanel, EmptyState, Panel, ScanStat, StatusPill } from "@/components/dashboard-primitives";
import { WorkbenchPackEditorForm } from "@/components/workbench/workbench-pack-editor-form";
import { StartPackRunButton } from "@/components/workbench/workbench-actions";
import { WorkbenchFlowStrip } from "@/components/workbench/workbench-flow-strip";
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
      <WorkbenchFlowStrip
        current="editor"
        focusLabel={pack?.name ?? "Choose a pack to edit"}
        focusDetail="Tune the draft here, then launch a sandbox run. Save is not the end of the workflow."
      />

      <CompactPageHeader
        eyebrow="Strategy workbench"
        title="Editor"
        description="Edit one pack at a time. Save it, then run it."
      >
        <CompactStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: "Catalog", value: String(packs.length), detail: "Editable packs" },
            {
              label: "Selected",
              value: pack?.name ?? "None",
              detail: pack?.defaultProfile ?? "Pick a pack",
              tone: pack ? "accent" : "default",
            },
            {
              label: "Recipes",
              value: String(Array.isArray(pack?.recipes) ? pack.recipes.length : 0),
              detail: "Current draft blocks",
            },
            {
              label: "Recent runs",
              value: String(recentRuns.length),
              detail: recentRuns[0]?.status ?? "No run history",
            },
          ]}
        />
      </CompactPageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.2fr)]">
        <Panel
          title="Pack selector"
          eyebrow="Catalog"
          description="Keep the pack list visible while you edit."
          className="xl:sticky xl:top-[calc(var(--shell-header-height)+1rem)] xl:self-start"
        >
          {packs.length > 0 ? (
            <div className="max-h-[calc(100vh-var(--shell-header-height)-14rem)] space-y-2 overflow-y-auto pr-1">
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
                      prefetch={false}
                      className={buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "sm" })}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </Link>
                    <Link
                      href={`${workbenchRoutes.editorByIdPrefix}/${encodeURIComponent(packItem.id)}`}
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
            <EmptyState compact title="No packs available" detail="`/api/operator/packs` returned an empty list." />
          )}
        </Panel>

        <Panel
          title={pack?.name ?? "Pack detail"}
          eyebrow="Active draft"
          description="Edit first. Run second."
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
                <Link
                  href={`${workbenchRoutes.packs}?pack=${encodeURIComponent(pack.id)}`}
                  prefetch={false}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Back to packs
                </Link>
                <div className="text-xs text-text-muted">Launches a fresh sandbox run for the current pack.</div>
              </div>

              {recentRuns.length > 0 ? (
                <DisclosurePanel
                  title="Recent runs"
                  description="Open only when you need the latest run context for this draft."
                  badge={<span className="meta-chip">{recentRuns.length} runs</span>}
                >
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
                            prefetch={false}
                            className={buttonVariants({ variant: "secondary", size: "sm" })}
                          >
                            Grade
                          </Link>
                          <Link
                            href={`${workbenchRoutes.sandboxByRunPrefix}/${encodeURIComponent(run.id)}`}
                            prefetch={false}
                            className={buttonVariants({ variant: "ghost", size: "sm" })}
                          >
                            Sandbox
                          </Link>
                        </div>
                      </article>
                    ))}
                  </div>
                </DisclosurePanel>
              ) : (
                <EmptyState compact title="No runs yet" detail="Start a run from this editor to seed grader and sandbox." />
              )}
            </div>
          ) : (
            <EmptyState compact title="No pack selected" detail="Select a pack from the catalog first." />
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
