import { db } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { BirdeyeClient } from "../services/birdeye-client.js";
import { HeliusClient } from "../services/helius-client.js";
import { RuntimeConfigService } from "../services/runtime-config.js";
import { RiskEngine } from "./risk-engine.js";
import { ExecutionEngine } from "./execution-engine.js";
import { ExitEngine } from "./exit-engine.js";
import { GraduationEngine } from "./graduation-engine.js";
import { createApiServer } from "../api/server.js";

export class BotRuntime {
  private stopped = false;
  private readonly config = new RuntimeConfigService();
  private readonly risk = new RiskEngine(this.config);
  private readonly birdeye = new BirdeyeClient(env.BIRDEYE_API_KEY);
  private readonly helius = new HeliusClient(env.HELIUS_RPC_URL);
  private readonly execution = new ExecutionEngine(this.risk, this.config);
  private readonly exits = new ExitEngine(this.birdeye, this.execution, this.config, this.risk);
  private readonly graduation = new GraduationEngine(this.birdeye, this.helius, this.execution, this.risk, this.config);
  private discoveryHandle?: NodeJS.Timeout;
  private evaluationHandle?: NodeJS.Timeout;
  private exitHandle?: NodeJS.Timeout;
  private maintenanceHandle?: NodeJS.Timeout;

  async start(): Promise<void> {
    await this.config.ensure();
    await this.risk.ensureState();
    const startupSettings = await this.config.getSettings();
    const app = createApiServer({
      getSnapshot: () => this.getSnapshot(),
      getSettings: () => this.config.getSettings(),
      patchSettings: (input) => this.config.patchSettings(input),
      pause: (reason) => this.pause(reason),
      resume: () => this.resume(),
      triggerDiscovery: () => this.safeRun("manual discovery", () => this.graduation.discover()),
      triggerEvaluation: () => this.safeRun("manual evaluation", () => this.graduation.evaluateDueCandidates()),
      triggerExitCheck: () => this.safeRun("manual exit check", () => this.exits.run()),
    });

    app.listen(env.BOT_PORT, () => {
      logger.info({ port: env.BOT_PORT }, "trading_bot api listening");
    });

    await this.safeRun("initial discovery", () => this.graduation.discover());
    await this.safeRun("initial evaluation", () => this.graduation.evaluateDueCandidates());
    await this.safeRun("initial exit check", () => this.exits.run());

    this.scheduleDiscovery();
    this.scheduleEvaluation();
    this.scheduleExit();
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
    }
  }

  private async getSnapshot() {
    const [botState, settings, openPositions, queuedCandidates, latestCandidates, latestFills, providerSummary] = await Promise.all([
      this.risk.getSnapshot(),
      this.config.getSettings(),
      db.position.count({ where: { status: "OPEN" } }),
      db.candidate.count({ where: { status: { in: ["DISCOVERED", "SKIPPED", "ERROR"] } } }),
      db.candidate.findMany({ take: 20, orderBy: { discoveredAt: "desc" } }),
      db.fill.findMany({ take: 20, orderBy: { createdAt: "desc" } }),
      db.$queryRawUnsafe(`
        SELECT provider, total_calls, total_units, avg_latency_ms, error_count
        FROM v_api_provider_daily
        WHERE session_date = CURRENT_DATE
        ORDER BY provider
      `) as Promise<unknown[]>,
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
      settings,
      openPositions,
      queuedCandidates,
      latestCandidates,
      latestFills,
      providerSummary,
    };
  }

  private scheduleDiscovery(): void {
    void this.scheduleLoop("discovery loop", async () => this.config.getSettings().then((settings) => settings.cadence.discoveryIntervalMs), () => this.graduation.discover(), (handle) => {
      this.discoveryHandle = handle;
    });
  }

  private scheduleEvaluation(): void {
    void this.scheduleLoop("evaluation loop", async () => this.config.getSettings().then((settings) => settings.cadence.evaluationIntervalMs), () => this.graduation.evaluateDueCandidates(), (handle) => {
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

  private async pause(reason?: string): Promise<void> {
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        pauseReason: reason?.trim() || "manual pause",
      },
    });
  }

  private async resume(): Promise<void> {
    await db.botState.update({
      where: { id: "singleton" },
      data: {
        pauseReason: null,
      },
    });
  }
}
