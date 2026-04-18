import { db } from "../../db/client.js";
import type {
  DiscoveryLabRunDetail,
  DiscoveryLabRunRequest,
  DiscoveryLabRunSummary,
} from "../discovery-lab-service.js";
import type {
  DiscoveryLabApplyLiveStrategyResponse,
  OperatorRunDetailPayload,
  OperatorRunListPayload,
  OperatorRunSummary,
  TradingSessionSnapshot,
} from "../../types/domain.js";
import type { TradingSessionService } from "../session/trading-session-service.js";
import type { StrategyRunReadService } from "./strategy-run-read-service.js";
import type { RunRunner } from "./run-runner.js";

type StrategyRunServiceDeps = {
  runRunner: RunRunner;
  sessions: TradingSessionService;
  runReads: StrategyRunReadService;
};

const DEFAULT_RUN_LIMIT = 20;
const MAX_RUN_LIMIT = 100;

export class StrategyRunService {
  constructor(private readonly deps: StrategyRunServiceDeps) {}

  async listRuns(limit = DEFAULT_RUN_LIMIT, packId?: string): Promise<OperatorRunListPayload> {
    const normalizedPackId = typeof packId === "string" ? packId.trim() : "";
    const [rows, currentSession] = await Promise.all([
      db.discoveryLabRun.findMany({
        where: normalizedPackId ? { packId: normalizedPackId } : undefined,
        orderBy: [{ startedAt: "desc" }],
        take: normalizeLimit(limit),
        select: {
          id: true,
          status: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          appliedToLiveAt: true,
          appliedConfigVersionId: true,
          packId: true,
          packName: true,
          packKind: true,
          profile: true,
          sources: true,
          allowOverfiltered: true,
          queryCount: true,
          winnerCount: true,
          evaluationCount: true,
          errorMessage: true,
          strategyCalibration: true,
        },
      }),
      this.deps.sessions.getCurrentSession(),
    ]);

    return {
      currentSession,
      runs: rows.map((row) => this.mapRunSummary(row, currentSession)),
    };
  }

  async getRunDetail(runId: string): Promise<OperatorRunDetailPayload | null> {
    const normalizedRunId = runId.trim();
    if (!normalizedRunId) {
      throw new Error("runId is required");
    }

    const [detail, currentSession] = await Promise.all([
      this.deps.runReads.getRun(normalizedRunId),
      this.deps.sessions.getCurrentSession(),
    ]);
    if (!detail) {
      return null;
    }

    return {
      currentSession,
      summary: this.mapDetailSummary(detail, currentSession),
      run: detail,
    };
  }

  async startRun(input: DiscoveryLabRunRequest): Promise<DiscoveryLabRunDetail> {
    return this.deps.runRunner.startRun(input);
  }

  async startRunForPack(
    packId: string,
    input: Omit<DiscoveryLabRunRequest, "packId">,
  ): Promise<DiscoveryLabRunDetail> {
    const normalizedPackId = packId.trim();
    if (!normalizedPackId) {
      throw new Error("packId is required");
    }
    return this.deps.runRunner.startRun({
      ...input,
      packId: normalizedPackId,
    });
  }

  async applyRunToLive(input: {
    runId: string;
    mode?: "DRY_RUN" | "LIVE";
    confirmation: string;
    liveDeployToken?: string;
    requestIp?: string | null;
  }): Promise<DiscoveryLabApplyLiveStrategyResponse> {
    return this.deps.sessions.startSession(input);
  }

  async listDiscoverySummaries(): Promise<DiscoveryLabRunSummary[]> {
    return this.deps.runReads.listRunSummaries();
  }

  async getDiscoveryRun(runId: string): Promise<DiscoveryLabRunDetail | null> {
    return this.deps.runReads.getRun(runId);
  }

  private mapRunSummary(
    row: {
      id: string;
      status: string;
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
      strategyCalibration: unknown;
    },
    currentSession: TradingSessionSnapshot | null,
  ): OperatorRunSummary {
    const canApplyLive = isDeployableCalibration(row.strategyCalibration, row.status, row.packId);
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
      packKind: row.packKind === "CREATED" ? "created" : "custom",
      profile: row.profile as OperatorRunSummary["profile"],
      sources: Array.isArray(row.sources) ? row.sources.filter((entry): entry is string => typeof entry === "string") : [],
      allowOverfiltered: row.allowOverfiltered,
      queryCount: row.queryCount,
      winnerCount: row.winnerCount,
      evaluationCount: row.evaluationCount,
      errorMessage: row.errorMessage,
      canApplyLive,
      isCurrentSessionSource: currentSession?.sourceRunId === row.id,
    };
  }

  private mapDetailSummary(detail: DiscoveryLabRunDetail, currentSession: TradingSessionSnapshot | null): OperatorRunSummary {
    const canApplyLive = isDeployableCalibration(detail.strategyCalibration, detail.status, detail.packId);
    return {
      id: detail.id,
      status: detail.status,
      createdAt: detail.createdAt,
      startedAt: detail.startedAt,
      completedAt: detail.completedAt,
      appliedToLiveAt: detail.appliedToLiveAt ?? null,
      appliedConfigVersionId: detail.appliedConfigVersionId ?? null,
      packId: detail.packId,
      packName: detail.packName,
      packKind: detail.packKind,
      profile: detail.profile,
      sources: detail.sources,
      allowOverfiltered: detail.allowOverfiltered,
      queryCount: detail.queryCount,
      winnerCount: detail.winnerCount,
      evaluationCount: detail.evaluationCount,
      errorMessage: detail.errorMessage,
      canApplyLive,
      isCurrentSessionSource: currentSession?.sourceRunId === detail.id,
    };
  }
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_RUN_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_RUN_LIMIT);
}

function isDeployableCalibration(
  calibration: unknown,
  status: string,
  packId: string,
): boolean {
  if (status !== "COMPLETED" || packId === "__inline__" || packId === "inline") {
    return false;
  }
  if (!calibration || typeof calibration !== "object") {
    return false;
  }

  const value = calibration as {
    packId?: string | null;
    calibrationSummary?: {
      winnerCount?: number | null;
      calibrationConfidence?: number | null;
      avgWinnerTimeSinceGraduationMin?: number | null;
    } | null;
  };
  const calibratedPackId = typeof value.packId === "string" ? value.packId : null;
  const winnerCount = value.calibrationSummary?.winnerCount ?? 0;
  const confidence = value.calibrationSummary?.calibrationConfidence ?? 0;
  const avgWinnerMinutes = value.calibrationSummary?.avgWinnerTimeSinceGraduationMin ?? Number.POSITIVE_INFINITY;

  return Boolean(calibratedPackId)
    && calibratedPackId !== "__inline__"
    && winnerCount > 0
    && confidence >= 0.56
    && (avgWinnerMinutes > 30 || winnerCount >= 3);
}
