import { config } from "../config/index.js";
import { db } from "../db/client.js";
import { startApiServer } from "../api/server.js";
import { ApiCallBuffer } from "../utils/api-call-buffer.js";
import { createChildLogger } from "../utils/logger.js";
import { PositionTracker } from "../core/position-tracker.js";
import { RegimeDetector } from "../core/regime-detector.js";
import { RiskManager } from "../core/risk-manager.js";
import { TradeExecutor } from "../core/trade-executor.js";
import { DryRunExecutor } from "../core/dry-run-executor.js";
import { ExitMonitor } from "../core/exit-monitor.js";
import { ConfigProfileManager } from "../core/config-profile.js";
import { terminateStatsWorker } from "../core/stats-aggregator.js";
import { HeliusService } from "../services/helius.js";
import { BirdeyeService } from "../services/birdeye.js";
import { JupiterService } from "../services/jupiter.js";
import { OutcomeTracker } from "../services/outcome-tracker.js";
import { MarketTickRecorder } from "../services/market-tick-recorder.js";
import { CopyTradeStrategy } from "../strategies/copy-trade.js";
import { GraduationStrategy } from "../strategies/graduation.js";
import { MomentumStrategy } from "../strategies/momentum.js";
import { registerRuntimeIntervals } from "./intervals.js";
import type { ITradeExecutor } from "../utils/trade-executor-interface.js";

const log = createChildLogger("main");

export async function startTradingBot(): Promise<void> {
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

  for (const position of positionTracker.getOpen()) {
    exitMonitor.startMonitoring(position);
  }

  regimeDetector.startPeriodicEvaluation();

  await s1.start();
  await s2.start();
  await s3.start();

  outcomeTracker.start();
  marketTickRecorder.start();

  startApiServer({ riskManager, positionTracker, regimeDetector, configProfileManager, tradeExecutor: executor });

  const intervals = registerRuntimeIntervals({
    birdeye,
    jupiter,
    outcomeTracker,
    regimeDetector,
    riskManager,
    s1,
  });

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
    for (const handle of intervals) clearInterval(handle);
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
