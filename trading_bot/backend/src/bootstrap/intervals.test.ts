import assert from "node:assert/strict";
import test from "node:test";
import { registerRuntimeIntervals } from "./intervals.js";
import { captureIntervals } from "../test/helpers.js";

test("registerRuntimeIntervals still runs would-have-won backfill when Birdeye non-essential work is blocked", async () => {
  const { callbacks, restore } = captureIntervals();

  try {
    let wouldHaveWonCalled = false;

    registerRuntimeIntervals({
      birdeye: {
        getCreditsUsage: async () => null,
      } as never,
      jupiter: {
        getSolPriceUsd: async () => null,
      } as never,
      marketRouter: {
        getMarketBreadthSample: async () => [],
      } as never,
      outcomeTracker: {
        backfillWouldHaveWon: async () => {
          wouldHaveWonCalled = true;
        },
      } as never,
      regimeDetector: {
        updateSolPrice: () => undefined,
        updateTrendingCount: () => undefined,
      } as never,
      riskManager: {
        checkDailyReset: () => undefined,
        saveState: async () => undefined,
      } as never,
      apiBudgetManager: {
        persistCurrentState: async () => undefined,
        recordProviderSnapshot: () => undefined,
        shouldRunNonEssential: () => false,
      } as never,
      s1: {
        runWalletScoring: async () => undefined,
      } as never,
      isS1Enabled: () => true,
    });

    await callbacks.at(-1)?.();
    assert.equal(wouldHaveWonCalled, true);
  } finally {
    restore();
  }
});
