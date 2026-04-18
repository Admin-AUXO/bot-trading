import { db } from "../../db/client.js";
import type {
  DiscoveryLabPack,
  DiscoveryLabPackKind,
  DiscoveryLabProfile,
  DiscoveryLabRunDetail,
  DiscoveryLabRunStatus,
  DiscoveryLabRunSummary,
  DiscoveryLabThresholdOverrides,
} from "../discovery-lab-service.js";
import type { LiveStrategySettings } from "../../types/domain.js";

const DEFAULT_RUN_LIMIT = 20;
const MAX_RUN_LIMIT = 100;

type DiscoveryLabRunRow = {
  id: string;
  status: DiscoveryLabRunStatus;
  createdAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  appliedToLiveAt: Date | null;
  appliedConfigVersionId: number | null;
  packId: string;
  packName: string;
  packKind: string;
  profile: string;
  sources: unknown;
  allowOverfiltered: boolean;
  queryCount: number | null;
  winnerCount: number | null;
  evaluationCount: number | null;
  errorMessage: string | null;
  packSnapshot: unknown;
  thresholdOverrides: unknown;
  strategyCalibration: unknown;
  stdout: string | null;
  stderr: string | null;
  report: unknown;
};

export class StrategyRunReadService {
  async getRun(runId: string): Promise<DiscoveryLabRunDetail | null> {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      throw new Error("runId is required");
    }

    const row = await db.discoveryLabRun.findUnique({
      where: { id: normalizedRunId },
    });
    return row ? mapRunDetailRow(row) : null;
  }

  async listRunSummaries(limit = DEFAULT_RUN_LIMIT, packId?: string): Promise<DiscoveryLabRunSummary[]> {
    const normalizedPackId = typeof packId === "string" ? packId.trim() : "";
    const rows = await db.discoveryLabRun.findMany({
      where: normalizedPackId ? { packId: normalizedPackId } : undefined,
      orderBy: [{ startedAt: "desc" }],
      take: normalizeLimit(limit),
    });
    return rows.map((row) => mapRunSummaryRow(row));
  }
}

export function mapRunSummaryRow(row: DiscoveryLabRunRow): DiscoveryLabRunSummary {
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
    profile: row.profile as DiscoveryLabProfile,
    sources: Array.isArray(row.sources) ? row.sources.filter((entry): entry is string => typeof entry === "string") : [],
    allowOverfiltered: row.allowOverfiltered,
    queryCount: row.queryCount,
    winnerCount: row.winnerCount,
    evaluationCount: row.evaluationCount,
    errorMessage: row.errorMessage,
  };
}

export function mapRunDetailRow(row: DiscoveryLabRunRow): DiscoveryLabRunDetail {
  return {
    ...mapRunSummaryRow(row),
    packSnapshot: row.packSnapshot as DiscoveryLabPack,
    thresholdOverrides: (row.thresholdOverrides ?? {}) as DiscoveryLabThresholdOverrides,
    strategyCalibration: (row.strategyCalibration ?? null) as LiveStrategySettings | null,
    stdout: row.stdout ?? "",
    stderr: row.stderr ?? "",
    report: row.report as DiscoveryLabRunDetail["report"],
  };
}

function mapPackKindFromDb(kind: string): DiscoveryLabPackKind {
  return kind === "CREATED" ? "created" : "custom";
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_RUN_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_RUN_LIMIT);
}
