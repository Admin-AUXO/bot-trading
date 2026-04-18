import { DiscoveryLabClient } from "@/components/discovery-lab-client";
import { serverFetch } from "@/lib/server-api";
import type {
  DiscoveryLabCatalog,
  DiscoveryLabPack,
  DiscoveryLabRuntimeSnapshot,
  WorkbenchPackDetailPayload,
  WorkbenchPackListPayload,
  WorkbenchPackSummary,
  WorkbenchRunListPayload,
  WorkbenchRunSummary,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoveryLabStudioPage() {
  const [catalog, runtimeSnapshot] = await Promise.all([
    fetchStudioCatalog(),
    serverFetch<DiscoveryLabRuntimeSnapshot>("/api/status"),
  ]);

  return (
    <DiscoveryLabClient
      initialCatalog={catalog}
      initialRuntimeSnapshot={runtimeSnapshot}
    />
  );
}

async function fetchStudioCatalog(): Promise<DiscoveryLabCatalog> {
  const [packsPayload, runsPayload] = await Promise.all([
    serverFetch<WorkbenchPackListPayload | WorkbenchPackSummary[]>("/api/operator/packs?limit=100"),
    serverFetch<WorkbenchRunListPayload | WorkbenchRunSummary[]>("/api/operator/runs?limit=30"),
  ]);
  const packSummaries = normalizePackListPayload(packsPayload);
  const runSummaries = normalizeRunListPayload(runsPayload);
  const packs = await Promise.all(packSummaries.map((pack) => fetchPackForStudio(pack)));
  const packKindById = new Map(packs.map((pack) => [pack.id, pack.kind]));
  const runs = runSummaries.map((run) => toDiscoveryRunSummary(run, packKindById.get(run.packId)));
  const knownSourceSet = new Set<string>(["pump_dot_fun"]);
  for (const pack of packs) {
    for (const source of pack.defaultSources ?? []) {
      const normalized = normalizeId(source);
      if (normalized) knownSourceSet.add(normalized);
    }
  }
  for (const run of runs) {
    for (const source of run.sources ?? []) {
      const normalized = normalizeId(source);
      if (normalized) knownSourceSet.add(normalized);
    }
  }

  return {
    packs,
    activeRun: runs.find((run) => run.status === "RUNNING") ?? null,
    recentRuns: runs,
    profiles: ["runtime", "high-value", "scalp"],
    knownSources: [...knownSourceSet],
  };
}

async function fetchPackForStudio(summary: WorkbenchPackSummary): Promise<DiscoveryLabPack> {
  try {
    const detail = await serverFetch<WorkbenchPackDetailPayload>(`/api/operator/packs/${encodeURIComponent(summary.id)}`);
    if (detail.pack) {
      return detail.pack;
    }
  } catch {
  }

  return {
    id: summary.id,
    kind: summary.kind,
    name: summary.name,
    description: summary.description ?? "",
    thesis: summary.thesis ?? undefined,
    defaultProfile: summary.defaultProfile ?? "high-value",
    defaultSources: summary.defaultSources ?? [],
    thresholdOverrides: {},
    recipes: [],
    updatedAt: summary.updatedAt,
    sourcePath: summary.sourcePath ?? "db://discovery-lab-pack",
  };
}

function normalizePackListPayload(payload: WorkbenchPackListPayload | WorkbenchPackSummary[]): WorkbenchPackSummary[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.packs) ? payload.packs : [];
}

function normalizeRunListPayload(payload: WorkbenchRunListPayload | WorkbenchRunSummary[]): WorkbenchRunSummary[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  return Array.isArray(payload.runs) ? payload.runs : [];
}

function toDiscoveryRunSummary(
  run: WorkbenchRunSummary,
  packKind: DiscoveryLabPack["kind"] | undefined,
): DiscoveryLabCatalog["recentRuns"][number] {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? run.createdAt,
    completedAt: run.completedAt ?? null,
    appliedToLiveAt: run.appliedToLiveAt ?? null,
    appliedConfigVersionId: run.appliedConfigVersionId ?? null,
    packId: run.packId,
    packName: run.packName,
    packKind: packKind ?? "custom",
    profile: run.profile ?? "high-value",
    sources: run.sources ?? [],
    allowOverfiltered: run.allowOverfiltered ?? false,
    queryCount: null,
    winnerCount: run.winnerCount ?? null,
    evaluationCount: run.evaluationCount ?? null,
    errorMessage: run.errorMessage ?? null,
  };
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
