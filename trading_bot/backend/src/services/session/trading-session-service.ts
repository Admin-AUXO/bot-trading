import { Prisma, type TradingSession } from "@prisma/client";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import type {
  BotSettings,
  LiveStrategySettings,
  TradingSessionHistoryPayload,
  TradingSessionSnapshot,
} from "../../types/domain.js";
import { recordOperatorEvent } from "../operator-events.js";
import type { DiscoveryLabRunDetail } from "../discovery-lab-service.js";
import {
  buildDefaultLiveStrategy,
  RuntimeConfigService,
} from "../runtime-config.js";

type TradingSessionModeValue = "DRY_RUN" | "LIVE";

type TradingSessionServiceDeps = {
  config: RuntimeConfigService;
  getDiscoveryLabRun: (runId: string) => Promise<DiscoveryLabRunDetail | null>;
  armLiveRuntime?: () => Promise<void>;
};

type SessionStartInput = {
  runId: string;
  mode?: TradingSessionModeValue;
  confirmation: string;
  liveDeployToken?: string;
  requestIp?: string | null;
};

type SessionRevertInput = {
  sessionId: string;
  mode?: TradingSessionModeValue;
  confirmation: string;
  liveDeployToken?: string;
  requestIp?: string | null;
};

type SessionSummary = {
  tradeCount: number;
  openPositionCount: number;
  closedPositionCount: number;
  realizedPnlUsd: Prisma.Decimal;
};

type SessionRecordWithSummary = {
  row: TradingSession;
  summary: SessionSummary;
};

const ACTIVE_SESSION_ORDER = [{ startedAt: "desc" }, { createdAt: "desc" }] as const;
const DEFAULT_SESSION_LIMIT = 25;
const MAX_SESSION_LIMIT = 100;
const SESSION_STOP_PAUSE_REASON = "trading session stopped; apply or resume a live strategy before reopening entries";
const SESSION_STOPPED_REASON = "STOPPED";
const SESSION_REPLACED_REASON = "REPLACED";
const SESSION_REVERTED_REASON = "REVERTED";
const SESSION_PAUSED_REASON = "trading session paused by operator";

export class TradingSessionService {
  constructor(private readonly deps: TradingSessionServiceDeps) {}

  async getCurrentSession(): Promise<TradingSessionSnapshot | null> {
    const activeSession = await this.getActiveSessionRecord(db);
    if (!activeSession) {
      return null;
    }
    return this.mapSessionRecord(activeSession);
  }

  async listSessions(limit = DEFAULT_SESSION_LIMIT): Promise<TradingSessionHistoryPayload> {
    const [rows, botState] = await Promise.all([
      db.tradingSession.findMany({
        take: normalizeSessionLimit(limit),
        orderBy: ACTIVE_SESSION_ORDER,
      }),
      db.botState.findUnique({
        where: { id: "singleton" },
        select: { pauseReason: true },
      }),
    ]);
    const sessions = await Promise.all(rows.map((row) => this.mapSession(row)));
    return {
      currentSession: sessions.find((session) => session.stoppedAt == null) ?? null,
      sessions,
      runtimePauseReason: botState?.pauseReason ?? null,
    };
  }

  async startSession(input: SessionStartInput): Promise<{
    ok: true;
    session: TradingSessionSnapshot;
    strategy: LiveStrategySettings;
  }> {
    const normalizedRunId = input.runId.trim();
    if (!normalizedRunId) {
      throw new Error("runId is required");
    }

    const run = await this.deps.getDiscoveryLabRun(normalizedRunId);
    if (!run || !run.report) {
      throw new Error("discovery-lab run not found or not completed");
    }
    const calibration = this.requireReadyCalibration(run);
    const currentSettings = await this.deps.config.getSettings();
    const mode = normalizeSessionMode(input.mode, currentSettings.tradeMode);
    requireConfirmation(input.confirmation, buildConfirmationPhrase("START", mode));
    this.assertLiveDeploymentAuthorized(mode, input.requestIp, input.liveDeployToken);

    const prepared = await this.deps.config.preparePatch({
      tradeMode: mode,
      strategy: {
        livePresetId: calibration.dominantPresetId ?? currentSettings.strategy.livePresetId,
        liveStrategy: calibration,
      },
    });
    const appliedAt = new Date();

    const result = await db.$transaction(async (tx) => {
      const activeSession = await this.getActiveSessionRecord(tx);
      const nextPack = calibration.packId
        ? await tx.strategyPack.findUnique({
            where: { id: calibration.packId },
            select: { id: true, name: true, version: true },
          })
        : null;
      const previousPackId = activeSession?.row.packId ?? prepared.current.strategy.liveStrategy.packId ?? null;
      const previousPack = previousPackId
        ? await tx.strategyPack.findUnique({
            where: { id: previousPackId },
            select: { name: true, version: true },
          })
        : null;

      const configResult = await this.deps.config.applyPreparedPatch(tx, prepared, {
        appliedBy: "direct_patch",
        changedPaths: prepared.changedPaths,
        liveAffectingPaths: prepared.liveAffectingPaths,
      });

      if (activeSession) {
        await this.closeSession(tx, activeSession, {
          stoppedAt: appliedAt,
          stoppedReason: SESSION_REPLACED_REASON,
          stoppedConfigVersionId: configResult.configVersionId,
        });
      }

      await this.syncPackDeploymentState(tx, nextPack?.id ?? null);

      const createdSession = await tx.tradingSession.create({
        data: {
          mode,
          packId: nextPack?.id ?? null,
          packName: calibration.packName ?? nextPack?.name ?? run.packName,
          packVersion: nextPack?.version ?? null,
          sourceRunId: normalizedRunId,
          previousPackId,
          previousPackName: activeSession?.row.packName
            ?? prepared.current.strategy.liveStrategy.packName
            ?? previousPack?.name
            ?? null,
          previousPackVersion: activeSession?.row.packVersion ?? previousPack?.version ?? null,
          startedConfigVersionId: configResult.configVersionId,
          startedAt: appliedAt,
        },
      });

      await tx.discoveryLabRun.update({
        where: { id: normalizedRunId },
        data: {
          appliedToLiveAt: appliedAt,
          appliedConfigVersionId: configResult.configVersionId,
        },
      });

      return createdSession;
    });

    this.deps.config.cacheSettings(prepared.next);
    const session = await this.mapSession(result);

    await recordOperatorEvent({
      kind: "settings_apply",
      title: "Trading session started",
      detail: `Run ${run.packName} deployed ${session.packName} in ${mode} mode with a ${calibration.capitalModifierPercent}% capital modifier.`,
      entityType: "trading_session",
      entityId: session.id,
      metadata: {
        runId: normalizedRunId,
        sessionId: session.id,
        packId: session.packId,
        packName: session.packName,
        packVersion: session.packVersion,
        mode,
        dominantMode: calibration.dominantMode,
        dominantPresetId: calibration.dominantPresetId,
        winnerCount: calibration.calibrationSummary?.winnerCount ?? 0,
        capitalModifierPercent: calibration.capitalModifierPercent,
      },
    });

    return {
      ok: true,
      session,
      strategy: calibration,
    };
  }

  async stopSession(sessionId: string, reason?: string): Promise<TradingSessionSnapshot> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required");
    }

    const prepared = await this.deps.config.preparePatch({
      strategy: {
        liveStrategy: buildDefaultLiveStrategy(),
      },
    });
    const stoppedAt = new Date();
    const stoppedReason = normalizeStopReason(reason);

    const stopped = await db.$transaction(async (tx) => {
      const activeSession = await this.requireActiveSessionRecord(tx, normalizedSessionId);
      const configResult = await this.deps.config.applyPreparedPatch(tx, prepared, {
        appliedBy: "direct_patch",
        changedPaths: prepared.changedPaths,
        liveAffectingPaths: prepared.liveAffectingPaths,
      });

      await tx.botState.update({
        where: { id: "singleton" },
        data: { pauseReason: SESSION_STOP_PAUSE_REASON },
      });

      await this.syncPackDeploymentState(tx, null);
      return this.closeSession(tx, activeSession, {
        stoppedAt,
        stoppedReason,
        stoppedConfigVersionId: configResult.configVersionId,
      });
    });

    this.deps.config.cacheSettings(prepared.next);

    await recordOperatorEvent({
      kind: "control_state",
      level: "warning",
      title: "Trading session stopped",
      detail: `Session ${stopped.packName} was closed and live strategy deployment was cleared.`,
      entityType: "trading_session",
      entityId: stopped.id,
      metadata: {
        sessionId: stopped.id,
        packId: stopped.packId,
        packName: stopped.packName,
        packVersion: stopped.packVersion,
        stoppedReason: stopped.stoppedReason,
      },
    });

    return stopped;
  }

  async pauseSession(sessionId: string, reason?: string): Promise<TradingSessionSnapshot> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required");
    }

    const paused = await db.$transaction(async (tx) => {
      const activeSession = await this.requireActiveSessionRecord(tx, normalizedSessionId);
      await tx.botState.update({
        where: { id: "singleton" },
        data: {
          pauseReason: normalizePauseReason(reason),
        },
      });
      return this.mapSessionRecord(activeSession);
    });

    await recordOperatorEvent({
      kind: "control_state",
      level: "warning",
      title: "Trading session paused",
      detail: paused.packName,
      entityType: "trading_session",
      entityId: paused.id,
      metadata: {
        sessionId: paused.id,
        packId: paused.packId,
        packName: paused.packName,
      },
    });

    return paused;
  }

  async resumeSession(sessionId: string): Promise<TradingSessionSnapshot> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required");
    }

    const resumed = await db.$transaction(async (tx) => {
      const activeSession = await this.requireActiveSessionRecord(tx, normalizedSessionId);
      await tx.botState.update({
        where: { id: "singleton" },
        data: {
          pauseReason: null,
        },
      });
      return this.mapSessionRecord(activeSession);
    });

    if (resumed.mode === "LIVE") {
      await this.deps.armLiveRuntime?.();
    }

    await recordOperatorEvent({
      kind: "control_state",
      title: "Trading session resumed",
      detail: resumed.packName,
      entityType: "trading_session",
      entityId: resumed.id,
      metadata: {
        sessionId: resumed.id,
        packId: resumed.packId,
        packName: resumed.packName,
      },
    });

    return resumed;
  }

  async revertSession(input: SessionRevertInput): Promise<{
    ok: true;
    session: TradingSessionSnapshot;
    strategy: LiveStrategySettings;
  }> {
    const normalizedSessionId = input.sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required");
    }

    const activeSession = await this.requireActiveSessionRecord(db, normalizedSessionId);
    const currentSettings = await this.deps.config.getSettings();
    const mode = normalizeSessionMode(input.mode, activeSession.row.mode);
    requireConfirmation(input.confirmation, buildConfirmationPhrase("REVERT", mode));
    this.assertLiveDeploymentAuthorized(mode, input.requestIp, input.liveDeployToken);

    const previousDeployment = await this.getPreviousDeploymentConfig(activeSession.row, currentSettings);
    const prepared = await this.deps.config.preparePatch({
      tradeMode: mode,
      strategy: {
        livePresetId: previousDeployment.livePresetId,
        liveStrategy: previousDeployment.liveStrategy,
      },
    });
    const appliedAt = new Date();

    const result = await db.$transaction(async (tx) => {
      const currentSession = await this.requireActiveSessionRecord(tx, normalizedSessionId);
      const nextPack = previousDeployment.liveStrategy.packId
        ? await tx.strategyPack.findUnique({
            where: { id: previousDeployment.liveStrategy.packId },
            select: { id: true, name: true, version: true },
          })
        : null;

      const configResult = await this.deps.config.applyPreparedPatch(tx, prepared, {
        appliedBy: "direct_patch",
        changedPaths: prepared.changedPaths,
        liveAffectingPaths: prepared.liveAffectingPaths,
      });

      await this.closeSession(tx, currentSession, {
        stoppedAt: appliedAt,
        stoppedReason: SESSION_REVERTED_REASON,
        stoppedConfigVersionId: configResult.configVersionId,
      });

      await this.syncPackDeploymentState(tx, nextPack?.id ?? null);

      const createdSession = await tx.tradingSession.create({
        data: {
          mode,
          packId: nextPack?.id ?? previousDeployment.liveStrategy.packId ?? null,
          packName: previousDeployment.liveStrategy.packName ?? nextPack?.name ?? "Reverted pack",
          packVersion: nextPack?.version ?? null,
          sourceRunId: previousDeployment.liveStrategy.sourceRunId,
          previousPackId: currentSession.row.packId,
          previousPackName: currentSession.row.packName,
          previousPackVersion: currentSession.row.packVersion,
          startedConfigVersionId: configResult.configVersionId,
          startedAt: appliedAt,
        },
      });

      if (previousDeployment.liveStrategy.sourceRunId) {
        await tx.discoveryLabRun.updateMany({
          where: { id: previousDeployment.liveStrategy.sourceRunId },
          data: {
            appliedToLiveAt: appliedAt,
            appliedConfigVersionId: configResult.configVersionId,
          },
        });
      }

      return createdSession;
    });

    this.deps.config.cacheSettings(prepared.next);
    const session = await this.mapSession(result);

    await recordOperatorEvent({
      kind: "settings_apply",
      title: "Trading session reverted",
      detail: `Reverted deployment to ${session.packName} in ${mode} mode.`,
      entityType: "trading_session",
      entityId: session.id,
      metadata: {
        sessionId: session.id,
        sourceSessionId: normalizedSessionId,
        packId: session.packId,
        packName: session.packName,
        packVersion: session.packVersion,
        mode,
        sourceRunId: session.sourceRunId,
      },
    });

    return {
      ok: true,
      session,
      strategy: previousDeployment.liveStrategy,
    };
  }

  async startFromDiscoveryLabRun(runId: string): Promise<{
    ok: true;
    session: TradingSessionSnapshot;
    strategy: LiveStrategySettings;
  }> {
    const currentSettings = await this.deps.config.getSettings();
    return this.startSession({
      runId,
      mode: currentSettings.tradeMode,
      confirmation: buildConfirmationPhrase("START", currentSettings.tradeMode),
      requestIp: "127.0.0.1",
      liveDeployToken: env.LIVE_DEPLOY_2FA_TOKEN,
    });
  }

  private requireReadyCalibration(run: DiscoveryLabRunDetail): LiveStrategySettings {
    const calibration = run.strategyCalibration;
    if (!calibration) {
      throw new Error("strategy calibration is unavailable for this run");
    }
    if (run.packId === "__inline__" || calibration.packId === "__inline__") {
      throw new Error("inline discovery-lab drafts must be saved as packs before applying live");
    }
    if (!calibration.packId?.trim()) {
      throw new Error("strategy calibration is missing a deployable pack id");
    }
    if ((calibration.calibrationSummary?.winnerCount ?? 0) <= 0) {
      throw new Error("cannot apply a live strategy from a run with no winners");
    }
    if ((calibration.calibrationSummary?.calibrationConfidence ?? 0) < 0.56) {
      throw new Error("strategy calibration confidence is too weak to apply safely");
    }
    if (
      (calibration.calibrationSummary?.avgWinnerTimeSinceGraduationMin ?? Number.POSITIVE_INFINITY) <= 30
      && (calibration.calibrationSummary?.winnerCount ?? 0) < 3
    ) {
      throw new Error("sub-30m winner sample is too thin; rerun or widen the pack before applying");
    }

    return calibration;
  }

  private async getPreviousDeploymentConfig(
    session: TradingSession,
    currentSettings: BotSettings,
  ): Promise<{
    livePresetId: BotSettings["strategy"]["livePresetId"];
    liveStrategy: LiveStrategySettings;
  }> {
    if (!session.startedConfigVersionId || session.startedConfigVersionId <= 1) {
      throw new Error("no previous deployment is available to revert");
    }
    const previousVersion = await db.runtimeConfigVersion.findFirst({
      where: {
        id: { lt: session.startedConfigVersionId },
      },
      orderBy: { id: "desc" },
      select: { settings: true },
    });
    const previousSettings = previousVersion?.settings as Partial<BotSettings> | null;
    const liveStrategy = previousSettings?.strategy?.liveStrategy ?? null;
    if (!liveStrategy?.enabled || !liveStrategy.packId) {
      throw new Error("no previous deployed pack is available to revert");
    }
    return {
      livePresetId: previousSettings?.strategy?.livePresetId ?? currentSettings.strategy.livePresetId,
      liveStrategy,
    };
  }

  private async getActiveSessionRecord(
    client: Prisma.TransactionClient | typeof db,
  ): Promise<SessionRecordWithSummary | null> {
    const row = await client.tradingSession.findFirst({
      where: { stoppedAt: null },
      orderBy: ACTIVE_SESSION_ORDER,
    });
    if (!row) {
      return null;
    }

    return {
      row,
      summary: await this.getSessionSummary(client, row),
    };
  }

  private async requireActiveSessionRecord(
    client: Prisma.TransactionClient | typeof db,
    sessionId: string,
  ): Promise<SessionRecordWithSummary> {
    const activeSession = await this.getActiveSessionRecord(client);
    if (!activeSession || activeSession.row.id !== sessionId) {
      const existing = await client.tradingSession.findUnique({
        where: { id: sessionId },
      });
      if (!existing) {
        throw new Error("trading session not found");
      }
      if (existing.stoppedAt) {
        throw new Error("cannot act on an already closed trading session");
      }
      throw new Error("cannot act on a non-active trading session");
    }
    return activeSession;
  }

  private async closeSession(
    tx: Prisma.TransactionClient,
    session: SessionRecordWithSummary,
    input: {
      stoppedAt: Date;
      stoppedReason: string;
      stoppedConfigVersionId: number;
    },
  ): Promise<TradingSessionSnapshot> {
    const summary = await this.getSessionSummary(tx, {
      sourceRunId: session.row.sourceRunId,
      startedAt: session.row.startedAt,
      stoppedAt: input.stoppedAt,
    });
    const closed = await tx.tradingSession.update({
      where: { id: session.row.id },
      data: {
        stoppedAt: input.stoppedAt,
        stoppedReason: input.stoppedReason,
        stoppedConfigVersionId: input.stoppedConfigVersionId,
        realizedPnlUsd: summary.realizedPnlUsd,
        tradeCount: summary.tradeCount,
      },
    });

    return this.mapSessionRecord({ row: closed, summary });
  }

  private async syncPackDeploymentState(
    tx: Prisma.TransactionClient,
    activePackId: string | null,
  ): Promise<void> {
    await tx.strategyPack.updateMany({
      where: { status: "LIVE" },
      data: {
        status: "DRAFT",
        publishedAt: null,
      },
    });

    if (!activePackId) {
      return;
    }

    await tx.strategyPack.update({
      where: { id: activePackId },
      data: {
        status: "LIVE",
        publishedAt: new Date(),
      },
    });
  }

  private async mapSession(row: TradingSession): Promise<TradingSessionSnapshot> {
    return this.mapSessionRecord({
      row,
      summary: await this.getSessionSummary(db, row),
    });
  }

  private mapSessionRecord(record: SessionRecordWithSummary): TradingSessionSnapshot {
    const { row, summary } = record;
    return {
      id: row.id,
      mode: row.mode,
      packId: row.packId,
      packName: row.packName,
      packVersion: row.packVersion,
      sourceRunId: row.sourceRunId,
      previousPackId: row.previousPackId,
      previousPackName: row.previousPackName,
      previousPackVersion: row.previousPackVersion,
      startedConfigVersionId: row.startedConfigVersionId,
      stoppedConfigVersionId: row.stoppedConfigVersionId,
      startedAt: row.startedAt.toISOString(),
      stoppedAt: row.stoppedAt?.toISOString() ?? null,
      stoppedReason: row.stoppedReason,
      tradeCount: summary.tradeCount,
      openPositionCount: summary.openPositionCount,
      closedPositionCount: summary.closedPositionCount,
      realizedPnlUsd: Number(summary.realizedPnlUsd),
    };
  }

  private async getSessionSummary(
    client: Prisma.TransactionClient | typeof db,
    session: Pick<TradingSession, "sourceRunId" | "startedAt" | "stoppedAt">,
  ): Promise<SessionSummary> {
    if (!session.sourceRunId) {
      return {
        tradeCount: 0,
        openPositionCount: 0,
        closedPositionCount: 0,
        realizedPnlUsd: new Prisma.Decimal(0),
      };
    }

    const openedAtWindow = session.stoppedAt == null
      ? { gte: session.startedAt }
      : { gte: session.startedAt, lt: session.stoppedAt };

    const [tradeCount, openPositionCount, closedPositionCount, realized] = await Promise.all([
      client.position.count({
        where: {
          liveStrategyRunId: session.sourceRunId,
          openedAt: openedAtWindow,
        },
      }),
      client.position.count({
        where: {
          liveStrategyRunId: session.sourceRunId,
          status: "OPEN",
          openedAt: openedAtWindow,
        },
      }),
      client.position.count({
        where: {
          liveStrategyRunId: session.sourceRunId,
          status: "CLOSED",
          openedAt: openedAtWindow,
        },
      }),
      client.fill.aggregate({
        _sum: { pnlUsd: true },
        where: {
          side: "SELL",
          position: {
            liveStrategyRunId: session.sourceRunId,
            openedAt: openedAtWindow,
          },
        },
      }),
    ]);

    return {
      tradeCount,
      openPositionCount,
      closedPositionCount,
      realizedPnlUsd: realized._sum.pnlUsd ?? new Prisma.Decimal(0),
    };
  }

  private assertLiveDeploymentAuthorized(
    mode: TradingSessionModeValue,
    requestIp?: string | null,
    liveDeployToken?: string,
  ): void {
    if (mode !== "LIVE") {
      return;
    }
    if (!env.LIVE_DEPLOY_2FA_TOKEN || env.LIVE_DEPLOY_ALLOWED_IPS.length === 0) {
      throw new Error("LIVE session start requires LIVE_DEPLOY_ALLOWED_IPS and LIVE_DEPLOY_2FA_TOKEN");
    }
    if (!liveDeployToken || liveDeployToken.trim() !== env.LIVE_DEPLOY_2FA_TOKEN) {
      throw new Error("LIVE session start requires a valid live deploy token");
    }
    const normalizedRequestIp = normalizeIp(requestIp);
    const allowedIps = env.LIVE_DEPLOY_ALLOWED_IPS
      .map(normalizeIp)
      .filter((value): value is string => Boolean(value));
    if (!normalizedRequestIp || !allowedIps.includes(normalizedRequestIp)) {
      throw new Error(`LIVE session start requires a trusted caller IP; received ${requestIp ?? "unknown"}`);
    }
  }
}

function normalizeSessionLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_SESSION_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_SESSION_LIMIT);
}

function normalizeStopReason(reason: string | undefined): string {
  if (typeof reason !== "string") {
    return SESSION_STOPPED_REASON;
  }
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : SESSION_STOPPED_REASON;
}

function normalizePauseReason(reason: string | undefined): string {
  if (typeof reason !== "string") {
    return SESSION_PAUSED_REASON;
  }
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : SESSION_PAUSED_REASON;
}

function normalizeSessionMode(mode: string | undefined, fallback: TradingSessionModeValue): TradingSessionModeValue {
  return mode === "LIVE" || mode === "DRY_RUN" ? mode : fallback;
}

function buildConfirmationPhrase(action: "START" | "REVERT", mode: TradingSessionModeValue): string {
  return `${action} ${mode} SESSION`;
}

function requireConfirmation(value: string, expected: string): void {
  if (value.trim() !== expected) {
    throw new Error(`confirmation must match ${expected}`);
  }
}

function normalizeIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "::1") {
    return "127.0.0.1";
  }
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  return trimmed;
}
