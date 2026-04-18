import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { HeliusClient } from "../services/helius-client.js";
import { AdaptiveContextBuilder } from "../services/adaptive/adaptive-context-builder.js";
import { AdaptiveThresholdService } from "../services/adaptive/adaptive-threshold-service.js";
import { OperatorDeskService } from "../services/operator-desk.js";
import { recordOperatorEvent } from "../services/operator-events.js";
import { ProviderBudgetService } from "../services/provider-budget-service.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { DiscoveryLabMarketRegimeService } from "../services/discovery-lab-market-regime-service.js";
import { DiscoveryLabManualEntryService } from "../services/discovery-lab-manual-entry.js";
import { buildAdaptiveModelState } from "../services/adaptive-model.js";
import { TokenEnrichmentService } from "../services/enrichment/token-enrichment-service.js";
import { HeliusWatchService } from "../services/helius/helius-watch-service.js";
import { MarketIntelService } from "../services/market/market-intel-service.js";
import { MarketStrategyIdeasService } from "../services/market/market-strategy-ideas-service.js";
import { TradingSessionService } from "../services/session/trading-session-service.js";
import { DISCOVERY_LAB_KNOWN_SOURCES, DISCOVERY_LAB_PROFILES } from "../services/workbench/discovery-lab-shared.js";
import { PackRepo } from "../services/workbench/pack-repo.js";
import { PackGradingService } from "../services/workbench/pack-grading-service.js";
import { RunRunner } from "../services/workbench/run-runner.js";
import { StrategyPackDraftValidator } from "../services/workbench/strategy-pack-draft-validator.js";
import { StrategyPackService } from "../services/workbench/strategy-pack-service.js";
import { StrategyRunReadService } from "../services/workbench/strategy-run-read-service.js";
import { StrategyRunResultsService } from "../services/workbench/strategy-run-results-service.js";
import { StrategyRunService } from "../services/workbench/strategy-run-service.js";
import { RiskEngine } from "./risk-engine.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExitEngine } from "./exit-engine.js";
import { GraduationEngine } from "./graduation-engine.js";
import { createApiServer } from "../api/server.js";
import { BOT_STATE_ID } from "./constants.js";
import type { DiscoveryLabCatalog, DiscoveryLabRunRequest } from "../services/discovery-lab-service.js";

const QUEUED_CANDIDATE_STATUSES = ["DISCOVERED", "SKIPPED", "ERROR"] as const;
const LIVE_STARTUP_PAUSE_REASON = "live mode is paused on startup; resume from the dashboard to begin trading";

export class BotRuntime {
  private stopped = false;
  private readonly config = new RuntimeConfigService();
  private readonly risk = new RiskEngine(this.config);
  private readonly birdeye = new BirdeyeClient(env.BIRDEYE_API_KEY);
  private readonly helius = new HeliusClient(env.HELIUS_RPC_URL);
  private readonly providerBudget = new ProviderBudgetService();
  private readonly adaptiveContext = new AdaptiveContextBuilder();
  private readonly adaptiveThresholds = new AdaptiveThresholdService();
  private readonly packDraftValidator = new StrategyPackDraftValidator();
  private readonly packRepo = new PackRepo();
  private readonly strategyRunReads = new StrategyRunReadService();
  private readonly runRunner = new RunRunner({
    packs: this.packRepo,
    validator: this.packDraftValidator,
  });
  private readonly packGrading = new PackGradingService({
    runReads: this.strategyRunReads,
    packs: this.packRepo,
  });
  private readonly discoveryLabMarketRegime = new DiscoveryLabMarketRegimeService({
    getRun: (runId) => this.strategyRunReads.getRun(runId),
  });
  private readonly tokenEnrichment = new TokenEnrichmentService(this.birdeye);
  private readonly marketIntel = new MarketIntelService({
    birdeye: this.birdeye,
    enrichment: this.tokenEnrichment,
    getSettings: () => this.config.getSettings(),
  });
  private readonly marketStrategyIdeas = new MarketStrategyIdeasService({
    getSettings: () => this.config.getSettings(),
    marketIntel: this.marketIntel,
  });
  private readonly tradingSessions = new TradingSessionService({
    config: this.config,
    getDiscoveryLabRun: (runId) => this.strategyRunReads.getRun(runId),
    armLiveRuntime: () => this.armLiveLoopsFromDashboard(),
  });
  private readonly strategyPacks = new StrategyPackService({
    packs: this.packRepo,
    validator: this.packDraftValidator,
    getCurrentSession: () => this.tradingSessions.getCurrentSession(),
  });
  private readonly strategyRuns = new StrategyRunService({
    runRunner: this.runRunner,
    sessions: this.tradingSessions,
    runReads: this.strategyRunReads,
  });
  private readonly execution = new ExecutionEngine(this.risk, this.config);
  private readonly discoveryLabManualEntry = new DiscoveryLabManualEntryService(this.strategyRunReads, this.execution);
  private readonly strategyRunResults = new StrategyRunResultsService({
    runReads: this.strategyRunReads,
    marketRegime: this.discoveryLabMarketRegime,
    tokenInsight: this.tokenEnrichment,
    manualEntry: this.discoveryLabManualEntry,
  });
  private readonly exits = new ExitEngine(
    this.birdeye,
    this.execution,
    this.config,
    this.risk,
    this.adaptiveContext,
    this.adaptiveThresholds,
    (mints) => this.heliusWatch.getMintActivityMap(mints),
  );
  private readonly graduation = new GraduationEngine(
    this.birdeye,
    this.helius,
    this.execution,
    this.risk,
    this.config,
    this.adaptiveContext,
    this.adaptiveThresholds,
  );
  private readonly desk = new OperatorDeskService(this.config, this.risk, this.providerBudget);
  private readonly heliusWatch = new HeliusWatchService({
    getSettings: () => this.config.getSettings(),
    getPauseReason: async () => (await this.risk.getSnapshot()).pauseReason,
    triggerDiscovery: () => this.graduation.discover(),
  });
  private discoveryHandle?: NodeJS.Timeout;
  private evaluationHandle?: NodeJS.Timeout;
  private exitHandle?: NodeJS.Timeout;
  private maintenanceHandle?: NodeJS.Timeout;

  async start(): Promise<void> {
    await this.config.ensure();
    await this.risk.ensureState();
    await this.packRepo.ensure();
    await this.runRunner.ensure();
    await this.heliusWatch.start();

    const startupSettings = await this.config.getSettings();
    const startupState = await this.armLiveStartupPause(startupSettings.tradeMode);

    if (startupSettings.tradeMode === "LIVE") {
      await this.safeRun("phantom fill reconciliation", async () => { await this.execution.reconcilePhantomFills(); });
    }
    const app = createApiServer({
      getSnapshot: () => this.getSnapshot(),
      ...this.createDeskApiHandlers(),
      ...this.createPackApiHandlers(),
      ...this.createRunApiHandlers(),
      ...this.createSessionApiHandlers(),
      ...this.createControlApiHandlers(),
      ...this.createDiscoveryLabApiHandlers(),
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
      await this.heliusWatch.stop();
      await db.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  private createDeskApiHandlers() {
    return {
      getDeskShell: () => this.desk.getShell(),
      getDeskHome: () => this.desk.getHome(),
      listDeskEvents: (limit?: number) => this.desk.getEvents(limit),
      listCandidateQueue: (bucket: "ready" | "risk" | "provider" | "data") => this.desk.getCandidateQueue(bucket),
      getCandidateDetail: (candidateId: string) => this.desk.getCandidateDetail(candidateId),
      listPositionBook: (book: "open" | "closed") => this.desk.getPositionBook(book),
      getPositionDetail: (positionId: string) => this.desk.getPositionDetail(positionId),
      getDiagnostics: () => this.desk.getDiagnostics(),
    };
  }

  private createSessionApiHandlers() {
    return {
      listSessions: (limit?: number) => this.tradingSessions.listSessions(limit),
      getCurrentSession: () => this.tradingSessions.getCurrentSession(),
      startSession: (
        input: Parameters<TradingSessionService["startSession"]>[0],
      ) => this.tradingSessions.startSession(input),
      stopSession: (sessionId: string, reason?: string) => this.tradingSessions.stopSession(sessionId, reason),
      pauseSession: (sessionId: string, reason?: string) => this.tradingSessions.pauseSession(sessionId, reason),
      resumeSession: (sessionId: string) => this.tradingSessions.resumeSession(sessionId),
      revertSession: (
        input: Parameters<TradingSessionService["revertSession"]>[0],
      ) => this.tradingSessions.revertSession(input),
    };
  }

  private createPackApiHandlers() {
    return {
      listPacks: (limit?: number) => this.strategyPacks.listPacks(limit),
      validatePack: (
        input: Parameters<StrategyPackService["validatePack"]>[0],
        allowOverfiltered?: boolean,
      ) => this.strategyPacks.validatePack(input, allowOverfiltered),
      getPack: (packId: string) => this.strategyPacks.getPack(packId),
      savePack: (input: Parameters<StrategyPackService["savePack"]>[0]) => this.strategyPacks.savePack(input),
      deletePack: (packId: string) => this.strategyPacks.deletePack(packId),
    };
  }

  private createRunApiHandlers() {
    return {
      listRuns: (limit?: number, packId?: string) => this.strategyRuns.listRuns(limit, packId),
      getRunDetail: (runId: string) => this.strategyRuns.getRunDetail(runId),
      gradeRun: (runId: string, input?: { persist?: boolean }) => this.packGrading.gradeRun(runId, input),
      suggestRunTuning: (runId: string, input?: { apply?: boolean }) => this.packGrading.suggestTuning(runId, input),
      startRunFromPack: (
        packId: string,
        input: Omit<Parameters<StrategyRunService["startRun"]>[0], "packId">,
      ) => this.strategyRuns.startRunForPack(packId, input),
      applyRunToLive: (
        input: Parameters<StrategyRunService["applyRunToLive"]>[0],
      ) => this.strategyRuns.applyRunToLive(input),
      getRunMarketRegime: (runId: string) => this.strategyRunResults.getMarketRegime(runId),
      getRunTokenInsight: (input: { runId?: string; mint?: string }) => this.strategyRunResults.getTokenInsight(input),
      getAdaptiveActivity: (limit?: number) => this.adaptiveThresholds.getActivity(limit),
      enterRunManualTrade: (input: {
        runId?: string;
        mint?: string;
        positionSizeUsd?: number;
        exitOverrides?: Record<string, number>;
      }) => this.enterDiscoveryLabManualTrade(input),
    };
  }

  private createControlApiHandlers() {
    return {
      getSettings: () => this.config.getSettings(),
      patchSettings: (input: Parameters<RuntimeConfigService["patchSettings"]>[0]) => this.config.patchSettings(input),
      pause: (reason?: string) => this.pause(reason),
      resume: () => this.resume(),
      triggerDiscovery: () => this.runDiscoveryNow(),
      triggerEvaluation: () => this.runEvaluationNow(),
      triggerExitCheck: () => this.runExitCheckNow(),
    };
  }

  private createDiscoveryLabApiHandlers() {
    return {
      getDiscoveryLabCatalog: () => this.getDiscoveryLabCatalog(),
      validateDiscoveryLabDraft: (input: Parameters<DiscoveryLabService["validateDraft"]>[0], allowOverfiltered?: boolean) =>
        this.strategyPacks.validatePack(input, allowOverfiltered),
      saveDiscoveryLabPack: async (input: Parameters<DiscoveryLabService["savePack"]>[0]) => {
        const detail = await this.strategyPacks.savePack(input);
        return detail.pack.draft;
      },
      deleteDiscoveryLabPack: (packId: string) => this.strategyPacks.deletePack(packId),
      startDiscoveryLabRun: (input: DiscoveryLabRunRequest) => this.startDiscoveryLabRun(input),
      listDiscoveryLabRuns: () => this.strategyRuns.listDiscoverySummaries(),
      getDiscoveryLabRun: (runId: string) => this.strategyRuns.getDiscoveryRun(runId),
      getDiscoveryLabMarketRegime: (runId: string) => this.strategyRunResults.getMarketRegime(runId),
      getMarketTrending: (input: Parameters<MarketIntelService["getTrending"]>[0]) =>
        this.marketIntel.getTrending(input),
      getMarketTokenStats: (mint: string) => this.marketIntel.getTokenStats(mint),
      getRecentSmartWalletActivity: (mints: string[], limit?: number) =>
        this.marketIntel.getRecentSmartWalletActivity(mints, limit),
      getMarketStrategySuggestions: (input: Parameters<MarketStrategyIdeasService["getSuggestions"]>[0]) =>
        this.marketStrategyIdeas.getSuggestions(input),
      getEnrichment: (mint: string) => this.tokenEnrichment.getEnrichment(mint),
      getDiscoveryLabTokenInsight: (input: { runId?: string; mint?: string }) => this.strategyRunResults.getTokenInsight(input),
      enterDiscoveryLabManualTrade: (
        input: {
          runId?: string;
          mint?: string;
          positionSizeUsd?: number;
          exitOverrides?: Record<string, number>;
        },
      ) => this.enterDiscoveryLabManualTrade(input),
      applyDiscoveryLabLiveStrategy: (
        input: {
          runId?: string;
          mode?: "DRY_RUN" | "LIVE";
          confirmation?: string;
          liveDeployToken?: string;
          requestIp?: string | null;
        },
      ) => this.applyDiscoveryLabLiveStrategy(input),
      ingestHeliusSmartWalletWebhook: (body: unknown, rawBody: string, signature?: string) =>
        this.heliusWatch.ingestSmartWalletWebhook(body, rawBody, signature),
      ingestHeliusLpWebhook: (body: unknown, rawBody: string, signature?: string) =>
        this.heliusWatch.ingestLpWebhook(body, rawBody, signature),
      ingestHeliusHoldersWebhook: (body: unknown, rawBody: string, signature?: string) =>
        this.heliusWatch.ingestHoldersWebhook(body, rawBody, signature),
    };
  }

  private async getDiscoveryLabCatalog(): Promise<DiscoveryLabCatalog> {
    const [packs, recentRuns] = await Promise.all([
      this.strategyPacks.listDiscoveryLabPacks(),
      this.strategyRuns.listDiscoverySummaries(),
    ]);
    return {
      packs,
      activeRun: recentRuns.find((run) => run.status === "RUNNING") ?? null,
      recentRuns,
      profiles: [...DISCOVERY_LAB_PROFILES],
      knownSources: [...DISCOVERY_LAB_KNOWN_SOURCES],
    };
  }

  private async startDiscoveryLabRun(input: DiscoveryLabRunRequest) {
    const packId = typeof input.packId === "string" ? input.packId.trim() : "";
    if (packId) {
      const { packId: _ignoredPackId, ...rest } = input;
      return this.strategyRuns.startRunForPack(packId, rest);
    }
    return this.strategyRuns.startRun(input);
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
    const [botState, entryGate, openPositions, queuedCandidates, latestCandidates, latestFills, providerSummary, providerBudget, heliusWatch] = await Promise.all([
      this.risk.getSnapshot(),
      this.risk.canOpenPosition(settings),
      db.position.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { status: { in: [...QUEUED_CANDIDATE_STATUSES] } } }),
      db.candidate.findMany({ take: 20, orderBy: { discoveredAt: "desc" } }),
      db.fill.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
      this.getProviderSummaryForSnapshot(),
      this.providerBudget.getBirdeyeBudgetSnapshot(),
      this.heliusWatch.getSummary(),
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
      heliusWatch,
      currentSession: await this.tradingSessions.getCurrentSession(),
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
      where: { id: BOT_STATE_ID },
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
    let delayMs: number;
    try {
      delayMs = await getDelayMs();
      this.consecutiveFailures.delete(label);
    } catch (err) {
      logger.error({ err, label }, "scheduleLoop getDelayMs failed; using 30s fallback");
      delayMs = 30_000;
      await this.alertConsecutiveFailure(label);
    }
    assign(setTimeout(async () => {
      await this.safeRun(label, fn);
      await this.scheduleLoop(label, getDelayMs, fn, assign);
    }, delayMs));
  }

  private consecutiveFailures = new Map<string, number>();
  private readonly CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 3;

  private async alertConsecutiveFailure(label: string): Promise<void> {
    const count = (this.consecutiveFailures.get(label) ?? 0) + 1;
    this.consecutiveFailures.set(label, count);
    if (count >= this.CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
      await recordOperatorEvent({
        kind: "runtime_failure",
        level: "danger",
        title: `Runtime loop degraded: ${label}`,
        detail: `${label} has failed to retrieve its schedule delay ${count} consecutive times. Check DB connectivity and configuration.`,
        metadata: { label, consecutiveFailures: count },
      });
      this.consecutiveFailures.set(label, 0);
    }
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
    const result = await this.strategyRunResults.enterManualTrade(input);
    try {
      await this.ensureExitMonitoringArmed();
      await this.exits.run();
    } catch (error) {
      logger.error({ err: error, positionId: result.positionId }, "manual discovery-lab entry opened but exit refresh failed");
      await recordOperatorEvent({
        kind: "runtime_failure",
        level: "warning",
        title: "Discovery-lab entry needs exit refresh follow-up",
        detail: `Position ${result.symbol} opened, but the immediate exit-monitoring refresh failed. Run exit checks now and inspect the position.`,
        entityType: "position",
        entityId: result.positionId,
        metadata: {
          candidateId: result.candidateId,
          positionId: result.positionId,
          symbol: result.symbol,
          runId: input.runId ?? null,
          mint: input.mint ?? null,
          entryOrigin: "discovery_lab_manual_entry",
        },
      });
    }
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

  private async applyDiscoveryLabLiveStrategy(input: {
    runId?: string;
    mode?: "DRY_RUN" | "LIVE";
    confirmation?: string;
    liveDeployToken?: string;
    requestIp?: string | null;
  }) {
    const runId = typeof input.runId === "string" ? input.runId.trim() : "";
    return this.strategyRuns.applyRunToLive({
      runId,
      mode: input.mode,
      confirmation: typeof input.confirmation === "string" ? input.confirmation : "",
      liveDeployToken: typeof input.liveDeployToken === "string" ? input.liveDeployToken : undefined,
      requestIp: input.requestIp,
    });
  }

  private async pause(reason?: string): Promise<void> {
    await db.botState.update({
      where: { id: BOT_STATE_ID },
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
      where: { id: BOT_STATE_ID },
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
