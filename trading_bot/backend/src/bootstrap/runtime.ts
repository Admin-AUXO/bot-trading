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
import { ApiBudgetManager } from "../core/api-budget-manager.js";
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
import type { ExecutionScope } from "../utils/types.js";

const log = createChildLogger("main");

export async function startTradingBot(): Promise<void> {
  const isLive = config.tradeMode === "LIVE";
  log.info({ mode: config.tradeMode }, "initializing trading bot");

  const apiCallBuffer = new ApiCallBuffer();
  const jupiter = new JupiterService();

  const positionTracker = new PositionTracker();
  const regimeDetector = new RegimeDetector();
  const configProfileManager = new ConfigProfileManager();

  await configProfileManager.loadProfiles();
  const activeProfile = configProfileManager.getActiveProfile(config.tradeMode);
  const scope: ExecutionScope = {
    mode: config.tradeMode,
    configProfile: activeProfile?.name ?? "default",
  };
  const strategyConfigs = {
    S1_COPY: configProfileManager.getStrategyConfig(scope.configProfile, "s1"),
    S2_GRADUATION: configProfileManager.getStrategyConfig(scope.configProfile, "s2"),
    S3_MOMENTUM: configProfileManager.getStrategyConfig(scope.configProfile, "s3"),
  };
  const capitalConfig = configProfileManager.getCapitalConfig(scope.configProfile);
  const riskManager = new RiskManager(positionTracker, regimeDetector, {
    capitalConfig,
    persistState: isLive,
    scope,
    strategyConfigs: {
      S1_COPY: {
        maxPositions: strategyConfigs.S1_COPY.maxPositions,
        positionSizeSol: strategyConfigs.S1_COPY.positionSizeSol,
      },
      S2_GRADUATION: {
        maxPositions: strategyConfigs.S2_GRADUATION.maxPositions,
        positionSizeSol: strategyConfigs.S2_GRADUATION.positionSizeSol,
      },
      S3_MOMENTUM: {
        maxPositions: strategyConfigs.S3_MOMENTUM.maxPositions,
        positionSizeSol: strategyConfigs.S3_MOMENTUM.positionSizeSol,
      },
    },
  });
  const apiBudgetManager = new ApiBudgetManager(apiCallBuffer, riskManager);

  await positionTracker.loadOpenPositions(scope);
  await riskManager.loadState();
  await apiBudgetManager.loadState();

  const helius = new HeliusService(apiBudgetManager);
  const birdeye = new BirdeyeService(apiBudgetManager);

  const executor: ITradeExecutor = isLive
    ? new TradeExecutor(positionTracker, riskManager, jupiter, helius, scope, strategyConfigs)
    : new DryRunExecutor(positionTracker, riskManager, jupiter, scope, strategyConfigs);

  const exitMonitor = new ExitMonitor(positionTracker, executor, jupiter, birdeye, strategyConfigs);
  const outcomeTracker = new OutcomeTracker(birdeye, apiBudgetManager);
  const marketTickRecorder = new MarketTickRecorder(jupiter, birdeye, regimeDetector, apiBudgetManager);

  const s1 = new CopyTradeStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, helius, birdeye, {
    scope,
    strategyConfig: strategyConfigs.S1_COPY,
  });
  const s2 = new GraduationStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, helius, birdeye, {
    scope,
    strategyConfig: strategyConfigs.S2_GRADUATION,
  });
  const s3 = new MomentumStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, birdeye, {
    scope,
    strategyConfig: strategyConfigs.S3_MOMENTUM,
  });

  for (const position of positionTracker.getOpen(scope)) {
    exitMonitor.startMonitoring(position);
  }

  regimeDetector.startPeriodicEvaluation();

  const reconcileWalletBalance = async (): Promise<number | null> => {
    if (!isLive) return null;
    const balanceSol = await helius.getWalletBalanceSol(config.solana.publicKey, {
      mode: scope.mode,
      configProfile: scope.configProfile,
      purpose: "RECONCILIATION",
      essential: true,
    });
    if (balanceSol === null) return null;
    riskManager.updateWalletBalance(balanceSol);
    return balanceSol;
  };
  await reconcileWalletBalance();

  await s1.start();
  await s2.start();
  await s3.start();

  outcomeTracker.start();
  marketTickRecorder.start();

  startApiServer({
    riskManager,
    positionTracker,
    regimeDetector,
    configProfileManager,
    tradeExecutor: executor,
    scope,
    strategyConfigs,
    capitalConfig,
    apiBudgetManager,
    walletReconciler: isLive ? reconcileWalletBalance : undefined,
  });

  const intervals = registerRuntimeIntervals({
    birdeye,
    jupiter,
    outcomeTracker,
    regimeDetector,
    riskManager,
    apiBudgetManager,
    s1,
    walletReconciler: isLive ? reconcileWalletBalance : undefined,
  });

  await apiBudgetManager.persistCurrentState();
  await riskManager.saveState();

  if (!isLive) {
    log.info("DRY-RUN MODE — no real transactions will be submitted");
  }
  log.info({ mode: config.tradeMode, profile: scope.configProfile }, "trading bot running — all strategies active");

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
    await apiBudgetManager.persistCurrentState();
    await riskManager.saveState();
    apiCallBuffer.stop();
    for (const handle of intervals) clearInterval(handle);
    await db.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
