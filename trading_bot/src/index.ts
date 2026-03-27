import "dotenv/config";
import { config } from "./config/index.js";
import { createChildLogger } from "./utils/logger.js";
import { db } from "./db/client.js";
import { ApiCallBuffer } from "./utils/api-call-buffer.js";
import { PositionTracker } from "./core/position-tracker.js";
import { RegimeDetector } from "./core/regime-detector.js";
import { RiskManager } from "./core/risk-manager.js";
import { TradeExecutor } from "./core/trade-executor.js";
import { DryRunExecutor } from "./core/dry-run-executor.js";
import { ExitMonitor } from "./core/exit-monitor.js";
import { ConfigProfileManager } from "./core/config-profile.js";
import { HeliusService } from "./services/helius.js";
import { BirdeyeService } from "./services/birdeye.js";
import { JupiterService } from "./services/jupiter.js";
import { OutcomeTracker } from "./services/outcome-tracker.js";
import { MarketTickRecorder } from "./services/market-tick-recorder.js";
import { CopyTradeStrategy } from "./strategies/copy-trade.js";
import { GraduationStrategy } from "./strategies/graduation.js";
import { MomentumStrategy } from "./strategies/momentum.js";
import { startApiServer } from "./api/server.js";
import { aggregateDailyStats, terminateStatsWorker } from "./core/stats-aggregator.js";
import type { ITradeExecutor } from "./utils/trade-executor-interface.js";

const log = createChildLogger("main");

async function main() {
  const isLive = config.tradeMode === "LIVE";
  log.info({ mode: config.tradeMode }, "initializing trading bot");

  const apiCallBuffer = new ApiCallBuffer();
  const helius = new HeliusService(apiCallBuffer);
  const birdeye = new BirdeyeService(apiCallBuffer);
  const jupiter = new JupiterService();

  const positionTracker = new PositionTracker();
  const regimeDetector = new RegimeDetector();
  const riskManager = new RiskManager(positionTracker, regimeDetector);
  const configProfileManager = new ConfigProfileManager();

  await positionTracker.loadOpenPositions();
  await riskManager.loadState();
  await configProfileManager.loadProfiles();

  const executor: ITradeExecutor = isLive
    ? new TradeExecutor(positionTracker, riskManager, jupiter, helius)
    : new DryRunExecutor(positionTracker, riskManager, jupiter, "default");

  const exitMonitor = new ExitMonitor(positionTracker, executor, jupiter, birdeye);

  const outcomeTracker = new OutcomeTracker(birdeye, jupiter);
  const marketTickRecorder = new MarketTickRecorder(jupiter, birdeye, regimeDetector);

  const s1 = new CopyTradeStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, helius, birdeye);
  const s2 = new GraduationStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, helius, birdeye);
  const s3 = new MomentumStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, birdeye);

  const openPositions = positionTracker.getOpen();
  for (const pos of openPositions) {
    exitMonitor.startMonitoring(pos);
  }

  regimeDetector.startPeriodicEvaluation();

  const intervals: ReturnType<typeof setInterval>[] = [];

  intervals.push(setInterval(async () => {
    try {
      const solPrice = await jupiter.getSolPriceUsd();
      if (solPrice) regimeDetector.updateSolPrice(solPrice);
      const trending = await birdeye.getTokenTrending();
      regimeDetector.updateTrendingCount(trending.length);
    } catch (err) {
      log.error({ err }, "regime update failed");
    }
  }, config.regime.evalIntervalMs));

  intervals.push(setInterval(() => {
    try {
      riskManager.checkDailyReset();
    } catch (err) {
      log.error({ err }, "daily reset check failed");
    }
  }, config.main.dailyResetCheckIntervalMs));

  intervals.push(setInterval(async () => {
    try {
      await riskManager.saveState();
    } catch (err) {
      log.error({ err }, "risk manager save failed");
    }
  }, config.main.riskSaveIntervalMs));

  await s1.start();
  await s2.start();
  await s3.start();

  outcomeTracker.start();
  marketTickRecorder.start();

  startApiServer({ riskManager, positionTracker, regimeDetector, configProfileManager, tradeExecutor: executor });

  intervals.push(setInterval(async () => {
    try {
      await s1.runWalletScoring();
    } catch (err) {
      log.error({ err }, "wallet scoring failed");
    }
  }, config.main.walletScoringIntervalMs));

  intervals.push(setInterval(async () => {
    try {
      await aggregateDailyStats();
    } catch (err) {
      log.error({ err }, "stats aggregation failed");
    }
  }, config.main.statsAggregationIntervalMs));

  intervals.push(setInterval(async () => {
    try {
      await outcomeTracker.backfillWouldHaveWon();
    } catch (err) {
      log.error({ err }, "would-have-won backfill failed");
    }
  }, config.main.outcomeBackfillIntervalMs));

  await riskManager.saveState();

  if (!isLive) {
    log.info("DRY-RUN MODE — no real transactions will be submitted");
  }
  log.info({ mode: config.tradeMode }, "trading bot running — all strategies active");

  const shutdown = async () => {
    log.info("shutting down...");
    s1.stop();
    s2.stop();
    s3.stop();
    exitMonitor.stopAll();
    regimeDetector.stop();
    outcomeTracker.stop();
    marketTickRecorder.stop();
    terminateStatsWorker();
    helius.disconnect();
    await riskManager.saveState();
    apiCallBuffer.stop();
    for (const h of intervals) clearInterval(h);
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.fatal({ err }, "bot crashed");
  process.exit(1);
});
