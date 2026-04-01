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
import { resolveRuntimeState } from "../core/runtime-state.js";
import { terminateStatsWorker } from "../core/stats-aggregator.js";
import { ApiBudgetManager } from "../core/api-budget-manager.js";
import { HeliusService } from "../services/helius.js";
import { BirdeyeService } from "../services/birdeye.js";
import { DexScreenerService } from "../services/dexscreener.js";
import { JupiterService } from "../services/jupiter.js";
import { MarketRouter } from "../services/market-router.js";
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
  const jupiter = new JupiterService();

  const positionTracker = new PositionTracker();
  const regimeDetector = new RegimeDetector();
  const configProfileManager = new ConfigProfileManager();

  await configProfileManager.loadProfiles();
  const runtimeState = resolveRuntimeState(configProfileManager, config.tradeMode);
  const riskManager = new RiskManager(positionTracker, regimeDetector, {
    persistState: isLive,
    runtimeState,
  });
  const apiBudgetManager = new ApiBudgetManager(apiCallBuffer, riskManager);

  await riskManager.loadState();
  await apiBudgetManager.loadState();

  const helius = new HeliusService(apiBudgetManager);
  const birdeye = new BirdeyeService(apiBudgetManager);
  const dexscreener = new DexScreenerService();
  const marketRouter = new MarketRouter({ jupiter, dexscreener, birdeye });

  const executor: ITradeExecutor = isLive
    ? new TradeExecutor(positionTracker, riskManager, jupiter, helius, runtimeState)
    : new DryRunExecutor(positionTracker, riskManager, jupiter, runtimeState);

  const exitMonitor = new ExitMonitor(positionTracker, executor, jupiter, marketRouter, runtimeState, birdeye);
  const outcomeTracker = new OutcomeTracker(marketRouter, apiBudgetManager);
  const marketTickRecorder = new MarketTickRecorder(jupiter, marketRouter, regimeDetector, apiBudgetManager);

  const s1 = new CopyTradeStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, helius, marketRouter, birdeye, {
    runtimeState,
  });
  const s2 = new GraduationStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, helius, marketRouter, birdeye, {
    runtimeState,
  });
  const s3 = new MomentumStrategy(riskManager, positionTracker, executor, exitMonitor, regimeDetector, marketRouter, birdeye, {
    runtimeState,
  });

  const loadRuntimeScopePositions = async (): Promise<void> => {
    exitMonitor.stopAll();
    await positionTracker.loadOpenPositions(runtimeState.scope);
    for (const position of positionTracker.getOpen(runtimeState.scope)) {
      exitMonitor.startMonitoring(position);
    }
  };
  await loadRuntimeScopePositions();

  regimeDetector.startPeriodicEvaluation();

  const reconcileWalletBalance = async (): Promise<number | null> => {
    if (!isLive) return null;
    const balanceSol = await helius.getWalletBalanceSol(config.solana.publicKey, {
      mode: runtimeState.scope.mode,
      configProfile: runtimeState.scope.configProfile,
      purpose: "RECONCILIATION",
      essential: true,
    });
    if (balanceSol === null) return null;
    riskManager.updateWalletBalance(balanceSol);
    return balanceSol;
  };
  await reconcileWalletBalance();

  const startStrategies = async (): Promise<void> => {
    await s1.start();
    await s2.start();
    await s3.start();
  };

  const stopStrategies = (): void => {
    s1.stop();
    s2.stop();
    s3.stop();
  };

  await startStrategies();

  outcomeTracker.start();
  marketTickRecorder.start();

  const applyRuntimeProfile = async (profileName: string) => {
    if (profileName === runtimeState.scope.configProfile) {
      await configProfileManager.toggleProfile(profileName, true);
      return { scope: { ...runtimeState.scope }, status: "active" as const };
    }

    const blockedOpenPositions = await db.position.count({
      where: {
        mode: runtimeState.scope.mode,
        configProfile: { not: profileName },
        status: { in: ["OPEN", "PARTIALLY_CLOSED"] },
      },
    });

    if (blockedOpenPositions > 0) {
      throw new Error(`close all ${runtimeState.scope.mode} positions before switching profiles`);
    }

    const switchPauseReason = "profile switch in progress";
    let switched = false;
    riskManager.pause(switchPauseReason);
    await riskManager.saveState();
    stopStrategies();
    exitMonitor.stopAll();

    try {
      await configProfileManager.toggleProfile(profileName, true);
      const nextRuntimeState = resolveRuntimeState(configProfileManager, runtimeState.scope.mode, profileName);
      runtimeState.scope = nextRuntimeState.scope;
      runtimeState.strategyConfigs = nextRuntimeState.strategyConfigs;
      runtimeState.capitalConfig = nextRuntimeState.capitalConfig;

      await loadRuntimeScopePositions();
      await reconcileWalletBalance();
      await startStrategies();
      switched = true;

      log.info({ mode: runtimeState.scope.mode, profile: runtimeState.scope.configProfile }, "runtime profile switched");
      return { scope: { ...runtimeState.scope }, status: "activated" as const };
    } finally {
      if (switched) {
        riskManager.unpause(switchPauseReason);
      }
      await riskManager.saveState();
    }
  };

  startApiServer({
    riskManager,
    positionTracker,
    regimeDetector,
    configProfileManager,
    tradeExecutor: executor,
    runtimeState,
    apiBudgetManager,
    walletReconciler: isLive ? reconcileWalletBalance : undefined,
    applyRuntimeProfile,
  });

  const intervals = registerRuntimeIntervals({
    birdeye,
    jupiter,
    marketRouter,
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
  log.info({ mode: config.tradeMode, profile: runtimeState.scope.configProfile }, "trading bot running — all strategies active");

  const shutdown = async () => {
    log.info("shutting down...");
    stopStrategies();
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
