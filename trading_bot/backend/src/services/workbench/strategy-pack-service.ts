import { db } from "../../db/client.js";
import type {
  DiscoveryLabPack,
  DiscoveryLabPackDraft,
  DiscoveryLabPackKind,
  DiscoveryLabValidationIssue,
  OperatorPackDetailPayload,
  OperatorPackListPayload,
  OperatorPackSummary,
  TradingSessionSnapshot,
} from "../../types/domain.js";
import type { PackRepo } from "./pack-repo.js";
import type { StrategyPackDraftValidator } from "./strategy-pack-draft-validator.js";

type StrategyPackServiceDeps = {
  packs: PackRepo;
  validator: StrategyPackDraftValidator;
  getCurrentSession: () => Promise<TradingSessionSnapshot | null>;
};

const DEFAULT_PACK_LIMIT = 100;

export class StrategyPackService {
  constructor(private readonly deps: StrategyPackServiceDeps) {}

  async listDiscoveryLabPacks(): Promise<DiscoveryLabPack[]> {
    return this.deps.packs.listPacks();
  }

  async validatePack(input: DiscoveryLabPackDraft, allowOverfiltered = false): Promise<{
    ok: boolean;
    issues: DiscoveryLabValidationIssue[];
    pack: DiscoveryLabPackDraft;
  }> {
    return this.deps.validator.validateDraft(input, allowOverfiltered);
  }

  async listPacks(limit = DEFAULT_PACK_LIMIT): Promise<OperatorPackListPayload> {
    const [rows, strategyRows, runRows, currentSession] = await Promise.all([
      db.discoveryLabPack.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: normalizeLimit(limit),
      }),
      db.strategyPack.findMany({
        select: {
          id: true,
          status: true,
          grade: true,
          version: true,
          publishedAt: true,
        },
      }),
      db.discoveryLabRun.findMany({
        select: {
          id: true,
          packId: true,
          status: true,
          winnerCount: true,
          startedAt: true,
          completedAt: true,
          appliedToLiveAt: true,
        },
        orderBy: [{ startedAt: "desc" }],
      }),
      this.deps.getCurrentSession(),
    ]);

    const strategyById = new Map(strategyRows.map((row) => [row.id, row]));
    const runStats = new Map<string, {
      runCount: number;
      completedRunCount: number;
      winnerCount: number;
      lastRunStartedAt: string | null;
      lastRunStatus: string | null;
      latestAppliedAt: string | null;
    }>();

    for (const row of runRows) {
      const current = runStats.get(row.packId) ?? {
        runCount: 0,
        completedRunCount: 0,
        winnerCount: 0,
        lastRunStartedAt: null,
        lastRunStatus: null,
        latestAppliedAt: null,
      };
      current.runCount += 1;
      if (row.completedAt) {
        current.completedRunCount += 1;
      }
      current.winnerCount += row.winnerCount ?? 0;
      if (!current.lastRunStartedAt) {
        current.lastRunStartedAt = row.startedAt.toISOString();
        current.lastRunStatus = row.status;
      }
      if (!current.latestAppliedAt && row.appliedToLiveAt) {
        current.latestAppliedAt = row.appliedToLiveAt.toISOString();
      }
      runStats.set(row.packId, current);
    }

    return {
      currentSession,
      packs: rows
        .map((row) => this.mapPackSummary(row, strategyById.get(row.id), runStats.get(row.id), currentSession))
        .sort((left, right) => {
          if (left.isDeployed !== right.isDeployed) {
            return left.isDeployed ? -1 : 1;
          }
          if (left.kind !== right.kind) {
            return left.kind === "created" ? -1 : 1;
          }
          return left.name.localeCompare(right.name);
        }),
    };
  }

  async getPack(packId: string): Promise<OperatorPackDetailPayload | null> {
    const normalizedPackId = packId.trim();
    if (!normalizedPackId) {
      throw new Error("packId is required");
    }

    const [packRow, strategyRow, recentRuns, latestVersion, currentSession] = await Promise.all([
      db.discoveryLabPack.findUnique({ where: { id: normalizedPackId } }),
      db.strategyPack.findUnique({
        where: { id: normalizedPackId },
        select: {
          id: true,
          status: true,
          grade: true,
          version: true,
          publishedAt: true,
        },
      }),
      db.discoveryLabRun.findMany({
        where: { packId: normalizedPackId },
        orderBy: [{ startedAt: "desc" }],
        take: 8,
        select: {
          id: true,
          packId: true,
          packName: true,
          packKind: true,
          profile: true,
          sources: true,
          allowOverfiltered: true,
          status: true,
          queryCount: true,
          winnerCount: true,
          evaluationCount: true,
          errorMessage: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          appliedToLiveAt: true,
          appliedConfigVersionId: true,
          strategyCalibration: true,
        },
      }),
      db.strategyPackVersion.findFirst({
        where: { packId: normalizedPackId },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          version: true,
          createdAt: true,
          notes: true,
        },
      }),
      this.deps.getCurrentSession(),
    ]);

    if (!packRow) {
      return null;
    }

    const summary = this.mapPackSummary(
      packRow,
      strategyRow,
      buildPackStatsFromRuns(recentRuns),
      currentSession,
    );

    return {
      currentSession,
      pack: {
        ...summary,
        ...mapDiscoveryLabPackRow(packRow),
        draft: mapDiscoveryLabPackRow(packRow),
        latestVersionId: latestVersion?.id ?? null,
        latestVersionNumber: latestVersion?.version ?? null,
        latestVersionCreatedAt: latestVersion?.createdAt.toISOString() ?? null,
        latestVersionNotes: latestVersion?.notes ?? null,
      },
      recentRuns: recentRuns.map((row) => mapRunSummaryRow(row, currentSession)),
    };
  }

  async savePack(input: DiscoveryLabPackDraft): Promise<OperatorPackDetailPayload> {
    const validation = await this.deps.validator.validateDraft(input, true);
    if (!validation.ok) {
      throw new Error("pack validation failed");
    }
    const pack = await this.deps.packs.savePack(validation.pack);
    const detail = await this.getPack(pack.id);
    if (!detail) {
      throw new Error("saved pack could not be loaded");
    }
    return detail;
  }

  async deletePack(packId: string): Promise<{ ok: true }> {
    return this.deps.packs.deletePack(packId);
  }

  private mapPackSummary(
    row: {
      id: string;
      kind: string;
      name: string;
      description: string;
      thesis: string | null;
      defaultProfile: string;
      defaultSources: unknown;
      thresholdOverrides: unknown;
      recipes: unknown;
      updatedAt: Date;
      sourcePath: string | null;
    },
    strategyRow: {
      id: string;
      status: string;
      grade: string | null;
      version: number;
      publishedAt: Date | null;
    } | null | undefined,
    runStats: {
      runCount: number;
      completedRunCount: number;
      winnerCount: number;
      lastRunStartedAt: string | null;
      lastRunStatus: string | null;
      latestAppliedAt: string | null;
    } | undefined,
    currentSession: TradingSessionSnapshot | null,
  ): OperatorPackSummary {
    const recipes = Array.isArray(row.recipes) ? row.recipes : [];
    const thresholdOverrides = isRecord(row.thresholdOverrides) ? row.thresholdOverrides : {};
    const isDeployed = currentSession?.packId === row.id && currentSession.stoppedAt == null;

    return {
      id: row.id,
      kind: mapPackKindFromDb(row.kind),
      name: row.name,
      description: row.description,
      thesis: row.thesis,
      defaultProfile: row.defaultProfile,
      defaultSources: asStringArray(row.defaultSources),
      recipeCount: recipes.length,
      thresholdOverrideCount: Object.keys(thresholdOverrides).length,
      updatedAt: row.updatedAt.toISOString(),
      sourcePath: row.sourcePath,
      status: strategyRow?.status ?? null,
      grade: strategyRow?.grade ?? null,
      version: strategyRow?.version ?? null,
      publishedAt: strategyRow?.publishedAt?.toISOString() ?? null,
      runCount: runStats?.runCount ?? 0,
      completedRunCount: runStats?.completedRunCount ?? 0,
      winnerCount: runStats?.winnerCount ?? 0,
      lastRunStartedAt: runStats?.lastRunStartedAt ?? null,
      lastRunAt: runStats?.lastRunStartedAt ?? null,
      lastRunStatus: runStats?.lastRunStatus ?? null,
      latestRunStatus: runStats?.lastRunStatus ?? null,
      latestAppliedAt: runStats?.latestAppliedAt ?? null,
      currentSessionId: isDeployed ? currentSession?.id ?? null : null,
      isDeployed,
    };
  }
}

function mapDiscoveryLabPackRow(row: {
  id: string;
  kind: string;
  name: string;
  description: string;
  thesis: string | null;
  targetPnlBand: unknown;
  defaultProfile: string;
  defaultSources: unknown;
  thresholdOverrides: unknown;
  recipes: unknown;
  updatedAt: Date;
  sourcePath: string | null;
}): DiscoveryLabPack {
  return {
    id: row.id,
    kind: mapPackKindFromDb(row.kind),
    name: row.name,
    description: row.description,
    thesis: row.thesis ?? undefined,
    targetPnlBand: isRecord(row.targetPnlBand) ? row.targetPnlBand as DiscoveryLabPack["targetPnlBand"] : undefined,
    defaultProfile: row.defaultProfile as DiscoveryLabPack["defaultProfile"],
    defaultSources: asStringArray(row.defaultSources),
    thresholdOverrides: isRecord(row.thresholdOverrides) ? row.thresholdOverrides as DiscoveryLabPack["thresholdOverrides"] : {},
    recipes: Array.isArray(row.recipes) ? row.recipes as DiscoveryLabPack["recipes"] : [],
    updatedAt: row.updatedAt.toISOString(),
    sourcePath: row.sourcePath ?? "db://discovery-lab-pack",
  };
}

function buildPackStatsFromRuns(runs: Array<{
  status: string;
  winnerCount: number | null;
  startedAt: Date;
  completedAt: Date | null;
  appliedToLiveAt: Date | null;
}>): {
  runCount: number;
  completedRunCount: number;
  winnerCount: number;
  lastRunStartedAt: string | null;
  lastRunStatus: string | null;
  latestAppliedAt: string | null;
} {
  const latestRun = runs[0];
  return {
    runCount: runs.length,
    completedRunCount: runs.filter((run) => run.completedAt != null).length,
    winnerCount: runs.reduce((sum, run) => sum + (run.winnerCount ?? 0), 0),
    lastRunStartedAt: latestRun?.startedAt.toISOString() ?? null,
    lastRunStatus: latestRun?.status ?? null,
    latestAppliedAt: runs.find((run) => run.appliedToLiveAt != null)?.appliedToLiveAt?.toISOString() ?? null,
  };
}

function mapRunSummaryRow(
  row: {
    id: string;
    packId: string;
    packName: string;
    packKind: string;
    profile: string;
    sources: unknown;
    allowOverfiltered: boolean;
    status: string;
    queryCount: number | null;
    winnerCount: number | null;
    evaluationCount: number | null;
    errorMessage: string | null;
    createdAt: Date;
    startedAt: Date;
    completedAt: Date | null;
    appliedToLiveAt: Date | null;
    appliedConfigVersionId: number | null;
    strategyCalibration: unknown;
  },
  currentSession: TradingSessionSnapshot | null,
): OperatorPackDetailPayload["recentRuns"][number] {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    appliedToLiveAt: row.appliedToLiveAt?.toISOString() ?? null,
    appliedConfigVersionId: row.appliedConfigVersionId ?? null,
    packId: row.packId,
    packName: row.packName,
    packKind: mapPackKindFromDb(row.packKind),
    profile: row.profile as OperatorPackDetailPayload["recentRuns"][number]["profile"],
    sources: asStringArray(row.sources),
    allowOverfiltered: row.allowOverfiltered,
    queryCount: row.queryCount,
    winnerCount: row.winnerCount,
    evaluationCount: row.evaluationCount,
    errorMessage: row.errorMessage,
    canApplyLive: Boolean(row.strategyCalibration) && row.status === "COMPLETED",
    isCurrentSessionSource: currentSession?.sourceRunId === row.id,
  };
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_PACK_LIMIT;
  }
  return Math.min(Math.floor(limit), DEFAULT_PACK_LIMIT);
}

function mapPackKindFromDb(kind: string): DiscoveryLabPackKind {
  if (kind === "CREATED") {
    return "created";
  }
  return "custom";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
