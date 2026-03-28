import { config } from "../config/index.js";
import { createChildLogger } from "../utils/logger.js";
import { aggregateDailyStats } from "../core/stats-aggregator.js";
import type { RiskManager } from "../core/risk-manager.js";
import type { RegimeDetector } from "../core/regime-detector.js";
import type { BirdeyeService } from "../services/birdeye.js";
import type { JupiterService } from "../services/jupiter.js";
import type { OutcomeTracker } from "../services/outcome-tracker.js";
import type { CopyTradeStrategy } from "../strategies/copy-trade.js";

const log = createChildLogger("bootstrap:intervals");

export function registerRuntimeIntervals(deps: {
  birdeye: BirdeyeService;
  jupiter: JupiterService;
  outcomeTracker: OutcomeTracker;
  regimeDetector: RegimeDetector;
  riskManager: RiskManager;
  s1: CopyTradeStrategy;
}): ReturnType<typeof setInterval>[] {
  const handles: ReturnType<typeof setInterval>[] = [];

  handles.push(setInterval(async () => {
    try {
      const solPrice = await deps.jupiter.getSolPriceUsd();
      if (solPrice) deps.regimeDetector.updateSolPrice(solPrice);
      const trending = await deps.birdeye.getTokenTrending();
      deps.regimeDetector.updateTrendingCount(trending.length);
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
      await deps.riskManager.saveState();
    } catch (err) {
      log.error({ err }, "risk manager save failed");
    }
  }, config.main.riskSaveIntervalMs));

  handles.push(setInterval(async () => {
    try {
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
