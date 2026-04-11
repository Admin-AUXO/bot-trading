import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { HeliusClient } from "../services/helius-client.js";
import { HeliusMigrationWatcher } from "../services/helius-migration-watcher.js";
import { OperatorDeskService } from "../services/operator-desk.js";
import { recordOperatorEvent } from "../services/operator-events.js";
import { ProviderBudgetService } from "../services/provider-budget-service.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { SharedTokenFactsService } from "../services/shared-token-facts.js";
import { getStrategyPreset } from "../services/strategy-presets.js";
import { RiskEngine } from "./risk-engine.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExitEngine } from "./exit-engine.js";
import { GraduationEngine } from "./graduation-engine.js";
import { ResearchDryRunEngine } from "./research-dry-run-engine.js";
import { createApiServer } from "../api/server.js";

const QUEUED_CANDIDATE_STATUSES = ["DISCOVERED", "SKIPPED", "ERROR"] as const;

export class BotRuntime {
  private stopped = false;
  private readonly config = new RuntimeConfigService();
  private readonly risk = new RiskEngine(this.config);
  private readonly birdeye = new BirdeyeClient(env.BIRDEYE_API_KEY);
  private readonly helius = new HeliusClient(env.HELIUS_RPC_URL);
  private readonly providerBudget = new ProviderBudgetService();
  private readonly sharedFacts = new SharedTokenFactsService();
  private readonly execution = new ExecutionEngine(this.risk, this.config);
  private readonly exits = new ExitEngine(this.birdeye, this.execution, this.config, this.risk);
  private readonly graduation = new GraduationEngine(this.birdeye, this.helius, this.execution, this.risk, this.config);
  private readonly research = new ResearchDryRunEngine(this.graduation, this.birdeye, this.config);
  private readonly desk = new OperatorDeskService(this.config, this.risk, this.providerBudget, this.research);
  private readonly migrationWatcher = new HeliusMigrationWatcher(
    env.HELIUS_RPC_URL,
    env.HELIUS_MIGRATION_WATCH_PROGRAM_IDS,
    env.HELIUS_MIGRATION_WATCH_DEBOUNCE_MS,
    async ({ programId, signature }) => this.handleMigrationSignal(programId, signature),
  );
  private discoveryHandle?: NodeJS.Timeout;
  private evaluationHandle?: NodeJS.Timeout;
  private exitHandle?: NodeJS.Timeout;
  private maintenanceHandle?: NodeJS.Timeout;
  private researchHandle?: NodeJS.Timeout;

  async start(): Promise<void> {
    await this.config.ensure();
    await this.risk.ensureState();
    await this.migrationWatcher.start();
    const startupSettings = await this.config.getSettings();
    const app = createApiServer({
      getSnapshot: () => this.getSnapshot(),
      getDeskShell: () => this.desk.getShell(),
      getDeskHome: () => this.desk.getHome(),
      listDeskEvents: (limit) => this.desk.getEvents(limit),
      listCandidateQueue: (bucket) => this.desk.getCandidateQueue(bucket),
      getCandidateDetail: (candidateId) => this.desk.getCandidateDetail(candidateId),
      listPositionBook: (book) => this.desk.getPositionBook(book),
      getPositionDetail: (positionId) => this.desk.getPositionDetail(positionId),
      getDiagnostics: () => this.desk.getDiagnostics(),
      getSettings: () => this.config.getSettings(),
      getSettingsControl: () => this.desk.getSettingsControl(),
      patchSettings: (input) => this.config.patchSettings(input),
      patchSettingsDraft: (input) => this.patchSettingsDraft(input),
      discardSettingsDraft: () => this.discardSettingsDraft(),
      runSettingsDryRun: () => this.runSettingsDryRun(),
      promoteSettingsDraft: () => this.promoteSettingsDraft(),
      pause: (reason) => this.pause(reason),
      resume: () => this.resume(),
      triggerDiscovery: () => this.runDiscoveryNow(),
      triggerEvaluation: () => this.runEvaluationNow(),
      triggerExitCheck: () => this.runExitCheckNow(),
      triggerResearchDryRun: () => this.runResearchDryRun(),
      listResearchRuns: (limit) => this.research.listRuns(limit),
      getResearchRun: (runId) => this.research.getRun(runId),
      getResearchRunTokens: (runId) => this.research.listRunTokens(runId),
      getResearchRunPositions: (runId) => this.research.listRunPositions(runId),
    });

    app.listen(env.BOT_PORT, () => {
      logger.info({ port: env.BOT_PORT }, "trading_bot api listening");
    });

    if (startupSettings.tradeMode === "LIVE") {
      await this.safeRun("initial discovery", () => this.graduation.discover());
      await this.safeRun("initial evaluation", () => this.graduation.evaluateDueCandidates());
      await this.safeRun("initial exit check", () => this.exits.run());

      this.scheduleDiscovery();
      this.scheduleEvaluation();
      this.scheduleExit();
    } else {
      await this.resumeResearchPolling();
    }

    this.scheduleMaintenance();

    logger.info({
      tradeMode: startupSettings.tradeMode,
      discoveryIntervalMs: startupSettings.cadence.discoveryIntervalMs,
      evaluationIntervalMs: startupSettings.cadence.evaluationIntervalMs,
      exitIntervalMs: startupSettings.cadence.exitIntervalMs,
    }, "trading_bot runtime started");

    const shutdown = async () => {
      this.stopped = true;
      if (this.discoveryHandle) clearTimeout(this.discoveryHandle);
      if (this.evaluationHandle) clearTimeout(this.evaluationHandle);
      if (this.exitHandle) clearTimeout(this.exitHandle);
      if (this.maintenanceHandle) clearTimeout(this.maintenanceHandle);
      if (this.researchHandle) clearTimeout(this.researchHandle);
      await this.migrationWatcher.stop();
      await db.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  private async safeRun(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      logger.error({ err: error, label }, "runtime task failed");
      await recordOperatorEvent({
        kind: "runtime_failure",
        level: "danger",
        title: `${label} failed`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async getSnapshot() {
    const settings = await this.config.getSettings();
    const [botState, entryGate, openPositions, queuedCandidates, latestCandidates, latestFills, providerSummary, providerBudget, research] = await Promise.all([
      this.risk.getSnapshot(),
      this.risk.canOpenPosition(settings),
      db.position.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { status: { in: [...QUEUED_CANDIDATE_STATUSES] } } }),
      db.candidate.findMany({ take: 20, orderBy: { discoveredAt: "desc" } }),
      db.fill.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
      db.$queryRawUnsafe(`
        SELECT provider, total_calls, total_units, avg_latency_ms, error_count
        FROM v_api_provider_daily
        WHERE session_date = CURRENT_DATE
        ORDER BY provider
      `) as Promise<unknown[]>,
      this.providerBudget.getBirdeyeBudgetSnapshot(),
      this.research.getStatus(),
    ]);

    return {
      botState: {
        tradeMode: botState.tradeMode,
        capitalUsd: Number(botState.capitalUsd),
        cashUsd: Number(botState.cashUsd),
        realizedPnlUsd: Number(botState.realizedPnlUsd),
        pauseReason: botState.pauseReason,
        lastDiscoveryAt: botState.lastDiscoveryAt,
        lastEvaluationAt: botState.lastEvaluationAt,
        lastExitCheckAt: botState.lastExitCheckAt,
      },
      entryGate: {
        allowed: entryGate.allowed,
        reason: entryGate.reason ?? null,
        retryable: entryGate.retryable ?? false,
        dailyRealizedPnlUsd: entryGate.dailyRealizedPnlUsd ?? 0,
        consecutiveLosses: entryGate.consecutiveLosses ?? 0,
      },
      settings,
      openPositions,
      queuedCandidates,
      latestCandidates,
      latestFills,
      providerSummary,
      providerBudget,
      research,
    };
  }

  private scheduleDiscovery(): void {
    void this.scheduleLoop("discovery loop", async () => {
      const settings = await this.config.getSettings();
      return this.isUsHours()
        ? settings.cadence.discoveryIntervalMs
        : settings.cadence.offHoursDiscoveryIntervalMs;
    }, () => this.graduation.discover(), (handle) => {
      this.discoveryHandle = handle;
    });
  }

  private scheduleEvaluation(): void {
    void this.scheduleLoop("evaluation loop", async () => {
      const [settings, queuedCandidates] = await Promise.all([
        this.config.getSettings(),
        db.candidate.count({ where: { status: { in: [...QUEUED_CANDIDATE_STATUSES] } } }),
      ]);

      return queuedCandidates > 0
        ? settings.cadence.evaluationIntervalMs
        : settings.cadence.idleEvaluationIntervalMs;
    }, () => this.graduation.evaluateDueCandidates(), (handle) => {
      this.evaluationHandle = handle;
    });
  }

  private scheduleExit(): void {
    void this.scheduleLoop("exit loop", async () => this.config.getSettings().then((settings) => settings.cadence.exitIntervalMs), () => this.exits.run(), (handle) => {
      this.exitHandle = handle;
    });
  }

  private scheduleMaintenance(): void {
    void this.scheduleLoop("maintenance loop", async () => env.MAINTENANCE_INTERVAL_MS, () => this.runMaintenance(), (handle) => {
      this.maintenanceHandle = handle;
    });
  }

  private async resumeResearchPolling(): Promise<void> {
    const nextDelayMs = await this.research.getNextPollDelayMs();
    if (nextDelayMs !== null) {
      this.scheduleResearch(nextDelayMs);
    }
  }

  private async runResearchDryRun(): Promise<void> {
    await this.research.startRun();
    if (this.researchHandle) {
      clearTimeout(this.researchHandle);
    }
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Research dry run started",
      detail: "Operator launched a bounded research dry run.",
    });
    const nextDelayMs = await this.research.getNextPollDelayMs();
    if (nextDelayMs !== null) {
      this.scheduleResearch(nextDelayMs);
    }
  }

  private scheduleResearch(delayMs: number): void {
    if (this.stopped) return;
    this.researchHandle = setTimeout(async () => {
      try {
        const state = await this.research.pollActiveRun();
        if (!this.stopped && state.active && state.nextDelayMs) {
          this.scheduleResearch(state.nextDelayMs);
        }
      } catch (error) {
        logger.error({ err: error }, "research polling timer failed");
        const nextDelayMs = await this.research.getNextPollDelayMs();
        if (!this.stopped && nextDelayMs !== null) {
          this.scheduleResearch(nextDelayMs);
        }
      }
    }, delayMs);
  }

  private async scheduleLoop(
    label: string,
    getDelayMs: () => Promise<number>,
    fn: () => Promise<void>,
    assign: (handle: NodeJS.Timeout) => void,
  ): Promise<void> {
    if (this.stopped) return;
    const delayMs = await getDelayMs();
    assign(setTimeout(async () => {
      await this.safeRun(label, fn);
      await this.scheduleLoop(label, getDelayMs, fn, assign);
    }, delayMs));
  }

  private async runMaintenance(): Promise<void> {
    const [rawPayloadResult, snapshotResult, apiEventResult] = await Promise.all([
      db.rawApiPayload.deleteMany({
        where: {
          capturedAt: {
            lt: new Date(Date.now() - env.RAW_PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.tokenSnapshot.deleteMany({
        where: {
          capturedAt: {
            lt: new Date(Date.now() - env.SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.apiEvent.deleteMany({
        where: {
          calledAt: {
            lt: new Date(Date.now() - env.API_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    logger.info({
      rawPayloadDeleted: rawPayloadResult.count,
      snapshotDeleted: snapshotResult.count,
      apiEventDeleted: apiEventResult.count,
    }, "runtime maintenance completed");
  }

  private async runDiscoveryNow(): Promise<void> {
    await this.ensureLiveControl("manual discovery");
    await this.graduation.discover();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Discovery triggered",
      detail: "Operator requested a manual discovery sweep.",
    });
  }

  private async runEvaluationNow(): Promise<void> {
    await this.ensureLiveControl("manual evaluation");
    await this.graduation.evaluateDueCandidates();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Evaluation triggered",
      detail: "Operator requested an immediate evaluation pass.",
    });
  }

  private async runExitCheckNow(): Promise<void> {
    await this.ensureLiveControl("manual exit check");
    await this.exits.run();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Exit check triggered",
      detail: "Operator requested an immediate exit sweep.",
    });
  }

  private async ensureLiveControl(label: string): Promise<void> {
    const settings = await this.config.getSettings();
    if (settings.tradeMode !== "LIVE") {
      throw new Error(`${label} is only available in LIVE mode`);
    }
  }

  private async pause(reason?: string): Promise<void> {
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        pauseReason: reason?.trim() || "manual pause",
      },
    });
    await recordOperatorEvent({
      kind: "control_state",
      level: "warning",
      title: "Bot paused",
      detail: reason?.trim() || "manual pause",
    });
  }

  private async resume(): Promise<void> {
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        pauseReason: null,
      },
    });
    await recordOperatorEvent({
      kind: "control_state",
      title: "Bot resumed",
      detail: "Manual pause cleared.",
    });
  }

  private async handleMigrationSignal(programId: string, signature: string): Promise<void> {
    await this.sharedFacts.rememberMigrationSignal({ programId, signature });

    const settings = await this.config.getSettings();
    const livePreset = getStrategyPreset(settings.strategy.livePresetId);
    if (
      settings.tradeMode !== "LIVE"
      || !settings.strategy.heliusWatcherEnabled
      || !livePreset.requiresHeliusWatcher
    ) {
      return;
    }

    await recordOperatorEvent({
      kind: "provider_signal",
      title: "Helius migration signal",
      detail: `Observed watched migration program ${programId}; triggering an immediate discovery sweep.`,
      metadata: {
        programId,
        signature,
        strategyPresetId: settings.strategy.livePresetId,
      },
    });

    await this.graduation.discover();
  }

  private async patchSettingsDraft(input: Partial<import("../types/domain.js").BotSettings>) {
    const next = await this.config.patchDraft(input);
    await recordOperatorEvent({
      kind: "settings_draft",
      title: "Settings draft updated",
      detail: next.changedPaths.length > 0 ? `${next.changedPaths.length} fields changed in draft.` : "Draft created without material changes.",
      metadata: { changedPaths: next.changedPaths },
    });
    return next;
  }

  private async discardSettingsDraft() {
    const state = await this.config.discardDraft();
    await recordOperatorEvent({
      kind: "settings_draft",
      title: "Settings draft discarded",
      detail: "Pending config changes were dropped.",
    });
    return state;
  }

  private async runSettingsDryRun() {
    const state = await this.config.getControlState();
    if (!state.draft) {
      throw new Error("no settings draft is available");
    }
    if (!state.validation.ok) {
      throw new Error("draft settings are invalid; fix validation issues before running a dry run");
    }

    const [currentGate, draftGate, openPositions, queuedCandidates] = await Promise.all([
      this.risk.canOpenPosition(state.active),
      this.risk.canOpenPosition(state.draft),
      db.position.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { status: { in: [...QUEUED_CANDIDATE_STATUSES] } } }),
    ]);

    const currentReason = currentGate.reason ?? null;
    const draftReason = draftGate.reason ?? null;
    const noNewBlocker = draftGate.allowed || (!currentGate.allowed && currentReason === draftReason);
    const summary = {
      ranAt: new Date().toISOString(),
      basedOnUpdatedAt: state.activeUpdatedAt,
      changedPaths: state.changedPaths,
      liveAffectingPaths: state.liveAffectingPaths,
      currentGate: {
        allowed: currentGate.allowed,
        reason: currentReason,
      },
      draftGate: {
        allowed: draftGate.allowed,
        reason: draftReason,
      },
      openPositions,
      queuedCandidates,
      noNewBlocker,
      safeToPromote: state.liveAffectingPaths.length === 0 || noNewBlocker,
    };

    const next = await this.config.saveDraftDryRun(summary);
    await recordOperatorEvent({
      kind: "settings_dry_run",
      level: summary.safeToPromote ? "info" : "warning",
      title: "Settings dry run completed",
      detail: summary.safeToPromote
        ? "Draft review is ready for operator promotion."
        : draftReason ?? "Draft introduced a new blocker.",
      metadata: summary as Record<string, unknown>,
    });
    return next;
  }

  private async promoteSettingsDraft() {
    const state = await this.config.getControlState();
    if (!state.draft) {
      throw new Error("no settings draft is available");
    }
    if (state.liveAffectingPaths.length > 0) {
      if (!state.dryRun) {
        throw new Error("run a settings dry run before promoting live-affecting changes");
      }
      if (!state.dryRun.safeToPromote) {
        throw new Error("draft dry run did not pass review; fix blockers before promoting");
      }
      if (state.dryRun.basedOnUpdatedAt !== state.activeUpdatedAt) {
        throw new Error("active settings changed after the draft dry run; rerun the dry run before promoting");
      }
    }

    const next = await this.config.promoteDraft();
    await recordOperatorEvent({
      kind: "settings_promote",
      title: "Settings promoted",
      detail: `${state.changedPaths.length} draft fields moved to active settings.`,
      metadata: { changedPaths: state.changedPaths },
    });
    return next;
  }

  private isUsHours(now = new Date()): boolean {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: env.US_HOURS_TIMEZONE,
        hour: "2-digit",
        hour12: false,
      });
      const hour = Number(formatter.format(now));
      return Number.isFinite(hour) && hour >= env.US_HOURS_START_HOUR && hour < env.US_HOURS_END_HOUR;
    } catch {
      const utcHour = now.getUTCHours();
      return utcHour >= 13 && utcHour < 24;
    }
  }
}
