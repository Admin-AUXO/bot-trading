import assert from "node:assert/strict";
import test from "node:test";
import { ExitMonitor } from "./exit-monitor.js";
import { defaultStrategyConfigs, type StrategyConfigMap } from "../utils/strategy-config.js";
import type { PositionState } from "../utils/types.js";

function makePosition(overrides: Partial<PositionState>): PositionState {
  return {
    id: "pos_1",
    mode: "DRY_RUN",
    tradeSource: "AUTO",
    configProfile: "default",
    strategy: "S1_COPY",
    tokenAddress: "mint_1",
    tokenSymbol: "TEST",
    entryPriceSol: 1,
    entryPriceUsd: 1,
    currentPriceSol: 1.25,
    currentPriceUsd: 1.25,
    amountSol: 0.2,
    amountToken: 100,
    remainingToken: 100,
    peakPriceUsd: 1.25,
    stopLossPercent: 20,
    tranche1Filled: true,
    tranche2Filled: false,
    exit1Done: false,
    exit2Done: false,
    exit3Done: false,
    status: "OPEN",
    entryVolume5m: 30_000,
    regime: "NORMAL",
    openedAt: new Date(Date.now() - 10 * 60_000),
    maxPnlPercent: 25,
    minPnlPercent: 0,
    ...overrides,
  };
}

test("ExitMonitor honors runtime take-profit overrides and slippage", async () => {
  const sells: Array<Record<string, unknown>> = [];
  const strategyConfigs: StrategyConfigMap = {
    ...defaultStrategyConfigs,
    S1_COPY: {
      ...defaultStrategyConfigs.S1_COPY,
      tp1Percent: 25,
    },
  };

  const monitor = new ExitMonitor(
    {} as never,
    {
      executeSell: async (params: Record<string, unknown>) => {
        sells.push(params);
        return { success: true };
      },
    } as never,
    {} as never,
    {} as never,
    strategyConfigs,
  );

  await (monitor as any).checkScaledExits(makePosition({ strategy: "S1_COPY" }), 24, 0, 777);
  assert.equal(sells.length, 0);

  await (monitor as any).checkScaledExits(makePosition({ strategy: "S1_COPY" }), 25, 0, 777);
  assert.equal(sells.length, 1);
  assert.equal(sells[0].maxSlippageBps, 777);
  assert.equal(sells[0].exitReason, "TAKE_PROFIT_T1");
});

test("ExitMonitor uses configured S3 hard time limit instead of a hidden override", () => {
  const strategyConfigs: StrategyConfigMap = {
    ...defaultStrategyConfigs,
    S3_MOMENTUM: {
      ...defaultStrategyConfigs.S3_MOMENTUM,
      timeLimitMinutes: 30,
    },
  };

  const monitor = new ExitMonitor(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    strategyConfigs,
  );

  const s3Position = makePosition({ strategy: "S3_MOMENTUM" });
  assert.equal((monitor as any).shouldTimeLimit(s3Position, 29), false);
  assert.equal((monitor as any).shouldTimeLimit(s3Position, 30), true);
});
