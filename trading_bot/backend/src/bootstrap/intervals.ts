import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { aggregateDailyStats } from "../core/stats-aggregator.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { JupiterService } from "../services/jupiter.js";
import type { MarketRouter } from "../services/market-router.js";
import type { OutcomeTracker } from "../services/outcome-tracker.js";
import type { CopyTradeStrategy } from "../strategies/copy-trade.js";
import type { ApiBudgetManager } from "../core/api-budget-manager.js";

const log = createChildLogger("bootstrap:intervals");

export function registerRuntimeIntervals(deps: {
  birdeye: BirdeyeService;
  jupiter: JupiterService;
  marketRouter: Pick<MarketRouter, "getMarketBreadthSample">;
  outcomeTracker: OutcomeTracker;
  regimeDetector: RegimeDetector;
  riskManager: RiskManager;
  apiBudgetManager: ApiBudgetManager;
  s1: CopyTradeStrategy;
  isS1Enabled: () => boolean;
  walletReconciler?: () => Promise<number | null>;
}): ReturnType<typeof setInterval>[] {
  const handles: ReturnType<typeof setInterval>[] = [];

  handles.push(setInterval(async () => {
    try {
      const solPrice = await deps.jupiter.getSolPriceUsd();
      if (solPrice) deps.regimeDetector.updateSolPrice(solPrice);
      const breadth = await deps.marketRouter.getMarketBreadthSample({
        interval: "1h",
        limit: config.regime.trendingSampleSize,
      });
      deps.regimeDetector.updateTrendingCount(breadth.length);
    } catch (err) {
      log.error({ err }, "regime update failed");
    }
  }, config.regime.evalIntervalMs));

  handles.push(setInterval(() => {
    try {
      deps.riskManager.checkDailyReset();
    } catch (err) {
      log.error({ err }, "daily reset check failed");
    }
  }, config.main.dailyResetCheckIntervalMs));

  handles.push(setInterval(async () => {
    try {
      await deps.apiBudgetManager.persistCurrentState();
      await deps.riskManager.saveState();
    } catch (err) {
      log.error({ err }, "risk manager save failed");
    }
  }, config.main.riskSaveIntervalMs));

  handles.push(setInterval(async () => {
    try {
      const credits = await deps.birdeye.getCreditsUsage({ purpose: "ANALYTICS", essential: false });
      if (credits) {
        deps.apiBudgetManager.recordProviderSnapshot("BIRDEYE", credits);
      }
      await deps.apiBudgetManager.persistCurrentState();
    } catch (err) {
      log.error({ err }, "api budget sync failed");
    }
  }, config.apiBudgets.syncIntervalMs));

  if (deps.walletReconciler) {
    handles.push(setInterval(async () => {
      try {
        await deps.walletReconciler?.();
      } catch (err) {
        log.error({ err }, "wallet reconcile failed");
      }
    }, config.main.walletReconcileIntervalMs));
  }

  handles.push(setInterval(async () => {
    try {
      if (!deps.isS1Enabled()) {
        log.info("wallet scoring skipped — S1 disabled");
        return;
      }
      if (!deps.apiBudgetManager.shouldRunNonEssential("HELIUS")) {
        log.info("wallet scoring skipped — HELIUS quota in soft/hard limit state");
        return;
      }
      await deps.s1.runWalletScoring();
    } catch (err) {
      log.error({ err }, "wallet scoring failed");
    }
  }, config.main.walletScoringIntervalMs));

  handles.push(setInterval(async () => {
    try {
      await aggregateDailyStats();
    } catch (err) {
      log.error({ err }, "stats aggregation failed");
    }
  }, config.main.statsAggregationIntervalMs));

  handles.push(setInterval(async () => {
    try {
      await deps.outcomeTracker.backfillWouldHaveWon();
    } catch (err) {
      log.error({ err }, "would-have-won backfill failed");
    }
  }, config.main.outcomeBackfillIntervalMs));

  return handles;
}
