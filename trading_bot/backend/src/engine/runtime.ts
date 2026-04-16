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
import { DiscoveryLabService } from "../services/discovery-lab-service.js";
import { DiscoveryLabMarketRegimeService } from "../services/discovery-lab-market-regime-service.js";
import { DiscoveryLabMarketStatsService } from "../services/discovery-lab-market-stats-service.js";
import { DiscoveryLabManualEntryService } from "../services/discovery-lab-manual-entry.js";
import { DiscoveryLabStrategySuggestionService } from "../services/discovery-lab-strategy-suggestion-service.js";
import { DiscoveryLabTokenInsightService } from "../services/discovery-lab-token-insight-service.js";
import { buildAdaptiveModelState } from "../services/adaptive-model.js";
import { getStrategyPreset } from "../services/strategy-presets.js";
import { RiskEngine } from "./risk-engine.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExitEngine } from "./exit-engine.js";
import { GraduationEngine } from "./graduation-engine.js";
import { createApiServer } from "../api/server.js";

const QUEUED_CANDIDATE_STATUSES = ["DISCOVERED", "SKIPPED", "ERROR"] as const;
const LIVE_STARTUP_PAUSE_REASON = "live mode is paused on startup; resume from the dashboard to begin trading";

export class BotRuntime {
  private stopped = false;
  private readonly config = new RuntimeConfigService();
  private readonly risk = new RiskEngine(this.config);
  private readonly birdeye = new BirdeyeClient(env.BIRDEYE_API_KEY);
  private readonly helius = new HeliusClient(env.HELIUS_RPC_URL);
  private readonly providerBudget = new ProviderBudgetService();
  private readonly sharedFacts = new SharedTokenFactsService();
  private readonly discoveryLab = new DiscoveryLabService();
  private readonly discoveryLabMarketRegime = new DiscoveryLabMarketRegimeService({
    getRun: (runId) => this.discoveryLab.getRun(runId),
  });
  private readonly discoveryLabTokenInsight = new DiscoveryLabTokenInsightService(this.birdeye);
  private readonly discoveryLabMarketStats = new DiscoveryLabMarketStatsService({
    birdeye: this.birdeye,
    tokenInsight: this.discoveryLabTokenInsight,
    getSettings: () => this.config.getSettings(),
  });
  private readonly discoveryLabStrategySuggestions = new DiscoveryLabStrategySuggestionService({
    getSettings: () => this.config.getSettings(),
    getMarketStats: (input) => this.discoveryLabMarketStats.getMarketStats(input),
  });
  private readonly execution = new ExecutionEngine(this.risk, this.config);
  private readonly discoveryLabManualEntry = new DiscoveryLabManualEntryService(this.discoveryLab, this.execution);
  private readonly exits = new ExitEngine(this.birdeye, this.execution, this.config, this.risk);
  private readonly graduation = new GraduationEngine(this.birdeye, this.helius, this.execution, this.risk, this.config);
  private readonly desk = new OperatorDeskService(this.config, this.risk, this.providerBudget);
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

  async start(): Promise<void> {
    await this.config.ensure();
    await this.risk.ensureState();
    await this.discoveryLab.ensure();
    await this.migrationWatcher.start();
    const startupSettings = await this.config.getSettings();
    const startupState = await this.armLiveStartupPause(startupSettings.tradeMode);
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
      patchSettings: (input) => this.config.patchSettings(input),
      pause: (reason) => this.pause(reason),
      resume: () => this.resume(),
      triggerDiscovery: () => this.runDiscoveryNow(),
      triggerEvaluation: () => this.runEvaluationNow(),
      triggerExitCheck: () => this.runExitCheckNow(),
      getDiscoveryLabCatalog: () => this.discoveryLab.getCatalog(),
      validateDiscoveryLabDraft: (input, allowOverfiltered) => this.discoveryLab.validateDraft(input, allowOverfiltered),
      saveDiscoveryLabPack: (input) => this.discoveryLab.savePack(input),
      deleteDiscoveryLabPack: (packId) => this.discoveryLab.deletePack(packId),
      startDiscoveryLabRun: (input) => this.discoveryLab.startRun(input),
      listDiscoveryLabRuns: () => this.discoveryLab.listRunSummaries(),
      getDiscoveryLabRun: (runId) => this.discoveryLab.getRun(runId),
      getDiscoveryLabMarketRegime: (runId) => this.discoveryLabMarketRegime.getMarketRegime(runId),
      getDiscoveryLabMarketStats: (input) => this.discoveryLabMarketStats.getMarketStats(input),
      getDiscoveryLabStrategySuggestions: (input) => this.discoveryLabStrategySuggestions.getSuggestions(input),
      getDiscoveryLabTokenInsight: (input) => this.getDiscoveryLabTokenInsight(input),
      enterDiscoveryLabManualTrade: (input) => this.enterDiscoveryLabManualTrade(input),
      applyDiscoveryLabLiveStrategy: (input) => this.applyDiscoveryLabLiveStrategy(input),
    });

    app.listen(env.BOT_PORT, () => {
      logger.info({ port: env.BOT_PORT }, "trading_bot api listening");
    });

    if (startupSettings.tradeMode === "LIVE") {
      await this.safeRun("initial exit check", () => this.exits.run());
      this.scheduleExit();

      if (!startupState.pauseReason) {
        await this.safeRun("initial discovery", () => this.graduation.discover());
        await this.safeRun("initial evaluation", () => this.graduation.evaluateDueCandidates());
        this.scheduleDiscovery();
        this.scheduleEvaluation();
      }
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
    const [botState, entryGate, openPositions, queuedCandidates, latestCandidates, latestFills, providerSummary, providerBudget] = await Promise.all([
      this.risk.getSnapshot(),
      this.risk.canOpenPosition(settings),
      db.position.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { status: { in: [...QUEUED_CANDIDATE_STATUSES] } } }),
      db.candidate.findMany({ take: 20, orderBy: { discoveredAt: "desc" } }),
      db.fill.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
      this.getProviderSummaryForSnapshot(),
      this.providerBudget.getBirdeyeBudgetSnapshot(),
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
      adaptiveModel: buildAdaptiveModelState(settings),
    };
  }

  private async getProviderSummaryForSnapshot(): Promise<unknown[]> {
    try {
      return await db.$queryRawUnsafe(`
        SELECT provider, total_calls, total_units, avg_latency_ms, error_count
        FROM v_api_provider_daily
        WHERE session_date = CURRENT_DATE
        ORDER BY provider
      `) as unknown[];
    } catch (error) {
      logger.warn({ err: error }, "snapshot provider view unavailable; falling back to ApiEvent aggregation");
    }

    try {
      return await db.$queryRawUnsafe(`
        SELECT
          provider,
          COUNT(*)::int AS total_calls,
          COALESCE(SUM(units), 0)::int AS total_units,
          AVG(COALESCE("latencyMs", 0))::numeric(12, 2) AS avg_latency_ms,
          SUM(CASE WHEN success THEN 0 ELSE 1 END)::int AS error_count
        FROM "ApiEvent"
        WHERE DATE_TRUNC('day', "calledAt")::date = CURRENT_DATE
        GROUP BY provider
        ORDER BY provider
      `) as unknown[];
    } catch (error) {
      logger.error({ err: error }, "snapshot provider fallback query failed");
      return [];
    }
  }

  private async armLiveStartupPause(tradeMode: string) {
    const state = await this.risk.getSnapshot();
    if (tradeMode !== "LIVE" || state.pauseReason) {
      return state;
    }

    const next = await db.botState.update({
      where: { id: "singleton" },
      data: { pauseReason: LIVE_STARTUP_PAUSE_REASON },
    });
    await recordOperatorEvent({
      kind: "control_state",
      level: "warning",
      title: "Live mode held on startup",
      detail: "Backend booted in LIVE mode but stayed paused until an operator resumes from the dashboard.",
    });
    return next;
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
      db.tokenMetrics.deleteMany({
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
    await this.graduation.discover();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Discovery triggered",
      detail: "Operator requested a manual discovery sweep.",
    });
  }

  private async runEvaluationNow(): Promise<void> {
    await this.graduation.evaluateDueCandidates();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Evaluation triggered",
      detail: "Operator requested an immediate evaluation pass.",
    });
  }

  private async runExitCheckNow(): Promise<void> {
    await this.exits.run();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Exit check triggered",
      detail: "Operator requested an immediate exit sweep.",
    });
  }

  private async enterDiscoveryLabManualTrade(
    input: {
      runId?: string;
      mint?: string;
      positionSizeUsd?: number;
      exitOverrides?: Record<string, number>;
    },
  ) {
    const result = await this.discoveryLabManualEntry.enterFromRun({
      runId: input.runId ?? "",
      mint: input.mint ?? "",
      positionSizeUsd: input.positionSizeUsd,
      exitOverrides: input.exitOverrides,
    });
    await this.ensureExitMonitoringArmed();
    await this.exits.run();
    await recordOperatorEvent({
      kind: "manual_action",
      title: "Discovery-lab trade entered",
      detail: `Opened ${result.symbol} from discovery-lab results and refreshed exit monitoring immediately.`,
      entityType: "position",
      entityId: result.positionId,
      metadata: {
        candidateId: result.candidateId,
        positionId: result.positionId,
        symbol: result.symbol,
        entryPriceUsd: result.entryPriceUsd,
        strategyPresetId: result.strategyPresetId,
        runId: input.runId ?? null,
        mint: input.mint ?? null,
        entryOrigin: "discovery_lab_manual_entry",
      },
    });
    return result;
  }

  private async getDiscoveryLabTokenInsight(input: { mint?: string }) {
    return this.discoveryLabTokenInsight.getInsight(input.mint ?? "");
  }

  private async applyDiscoveryLabLiveStrategy(input: { runId?: string }) {
    const runId = typeof input.runId === "string" ? input.runId.trim() : "";
    if (!runId) {
      throw new Error("runId is required");
    }

    const run = await this.discoveryLab.getRun(runId);
    if (!run || !run.report) {
      throw new Error("discovery-lab run not found or not completed");
    }
    const calibration = run.strategyCalibration;
    if (!calibration) {
      throw new Error("strategy calibration is unavailable for this run");
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

    const currentSettings = await this.config.getSettings();
    await this.config.patchSettings({
      strategy: {
        dryRunPresetId: currentSettings.strategy.dryRunPresetId,
        heliusWatcherEnabled: currentSettings.strategy.heliusWatcherEnabled,
        livePresetId: calibration.dominantPresetId ?? "FIRST_MINUTE_POSTGRAD_CONTINUATION",
        liveStrategy: calibration,
      },
    });

    await recordOperatorEvent({
      kind: "settings_apply",
      title: "Discovery-lab live strategy applied",
      detail: `Run ${run.packName} updated the active live strategy with pack discovery, calibrated exits, and a ${calibration.capitalModifierPercent}% capital modifier.`,
      metadata: {
        runId,
        packId: calibration.packId,
        packName: calibration.packName,
        dominantMode: calibration.dominantMode,
        dominantPresetId: calibration.dominantPresetId,
        winnerCount: calibration.calibrationSummary?.winnerCount ?? 0,
        capitalModifierPercent: calibration.capitalModifierPercent,
      },
    });

    return {
      ok: true as const,
      strategy: calibration,
    };
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
    const settings = await this.config.getSettings();
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        pauseReason: null,
      },
    });
    if (settings.tradeMode === "LIVE") {
      await this.armLiveLoopsFromDashboard();
    }
    await recordOperatorEvent({
      kind: "control_state",
      title: "Bot resumed",
      detail: "Manual pause cleared.",
    });
  }

  private async armLiveLoopsFromDashboard(): Promise<void> {
    if (!this.discoveryHandle) {
      await this.safeRun("initial discovery", () => this.graduation.discover());
      this.scheduleDiscovery();
    }
    if (!this.evaluationHandle) {
      await this.safeRun("initial evaluation", () => this.graduation.evaluateDueCandidates());
      this.scheduleEvaluation();
    }
    if (!this.exitHandle) {
      await this.safeRun("initial exit check", () => this.exits.run());
      this.scheduleExit();
    }
  }

  private async ensureExitMonitoringArmed(): Promise<void> {
    if (!this.exitHandle) {
      this.scheduleExit();
    }
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
