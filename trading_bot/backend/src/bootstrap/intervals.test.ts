import assert from "node:assert/strict";
import test from "node:test";
import { registerRuntimeIntervals } from "./intervals.js";

test("registerRuntimeIntervals still runs would-have-won backfill when Birdeye non-essential work is blocked", async () => {
  const originalSetInterval = globalThis.setInterval;
  const callbacks: Array<() => unknown> = [];

  globalThis.setInterval = (((
    callback: (...args: any[]) => unknown,
    _delay?: number,
    ...args: any[]
  ) => {
    callbacks.push(() => callback(...args));
    return callbacks.length as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval);

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
    });

    await callbacks.at(-1)?.();
    assert.equal(wouldHaveWonCalled, true);
  } finally {
    globalThis.setInterval = originalSetInterval;
  }
});
