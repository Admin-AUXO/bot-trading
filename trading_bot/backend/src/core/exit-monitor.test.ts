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

test("ExitMonitor.batchCheck consumes router exit refresh data instead of direct Birdeye price polling", async () => {
  const sells: Array<Record<string, unknown>> = [];
  let refreshCalls = 0;

  const monitor = new ExitMonitor(
    {
      getById: () => makePosition({ strategy: "S1_COPY", tokenAddress: "mint_router", currentPriceUsd: 1 }),
      updatePrice: () => undefined,
    } as never,
    {
      executeSell: async (params: Record<string, unknown>) => {
        sells.push(params);
        return { success: true };
      },
    } as never,
    {
      getSolPriceUsd: async () => 1,
    } as never,
    {
      refreshExitContext: async () => {
        refreshCalls += 1;
        return new Map([
          ["mint_router", {
            tokenAddress: "mint_router",
            priceUsd: 1.31,
            liquidityUsd: 25_000,
            priceSource: "JUPITER_PRICE",
            updatedAt: 123456,
          }],
        ]);
      },
    } as never,
    defaultStrategyConfigs,
  );

  (monitor as any).monitoredIds = new Set(["pos_1"]);
  await (monitor as any).batchCheck();

  assert.equal(refreshCalls, 1);
  assert.equal(sells.length, 1);
  assert.equal(sells[0].exitReason, "TAKE_PROFIT_T1");
});

test("ExitMonitor rate-limits S3 fade slow-path refreshes instead of polling Birdeye every batch", async () => {
  let tradeDataCalls = 0;
  const sells: Array<Record<string, unknown>> = [];
  const position = makePosition({
    strategy: "S3_MOMENTUM",
    tokenAddress: "mint_s3",
    tokenSymbol: "S3",
    currentPriceUsd: 1,
    currentPriceSol: 1,
    peakPriceUsd: 1,
    entryPriceUsd: 1,
    entryPriceSol: 1,
    entryVolume5m: 30_000,
  });

  const monitor = new ExitMonitor(
    {
      getById: () => position,
      updatePrice: (_id: string, priceSol: number, priceUsd: number) => {
        position.currentPriceSol = priceSol;
        position.currentPriceUsd = priceUsd;
        position.peakPriceUsd = Math.max(position.peakPriceUsd, priceUsd);
      },
    } as never,
    {
      executeSell: async (params: Record<string, unknown>) => {
        sells.push(params);
        return { success: true };
      },
    } as never,
    {
      getSolPriceUsd: async () => 1,
    } as never,
    {
      refreshExitContext: async () => new Map([
        ["mint_s3", {
          tokenAddress: "mint_s3",
          priceUsd: 1.05,
          liquidityUsd: 25_000,
          priceSource: "JUPITER_PRICE",
          updatedAt: 123456,
        }],
      ]),
    } as never,
    defaultStrategyConfigs,
    {
      getTradeData: async () => {
        tradeDataCalls += 1;
        return {
          volume5m: 45_000,
          volumeHistory5m: 35_000,
          volumeBuy5m: 25_000,
          trade5m: 12,
          buy5m: 8,
          uniqueWallet5m: 120,
        };
      },
    } as never,
  );

  (monitor as any).monitoredIds = new Set(["pos_1"]);
  await (monitor as any).batchCheck();
  await (monitor as any).batchCheck();

  assert.equal(tradeDataCalls, 1);
  assert.equal(sells.length, 0);
});

test("ExitMonitor skips overlapping batches so a slow exit cycle does not double-sell", async () => {
  let refreshCalls = 0;
  let sellCalls = 0;
  let releaseSell!: () => void;
  const sellGate = new Promise<void>((resolve) => {
    releaseSell = resolve;
  });

  const monitor = new ExitMonitor(
    {
      getById: () => makePosition({ strategy: "S1_COPY", tokenAddress: "mint_overlap", currentPriceUsd: 1 }),
      updatePrice: () => undefined,
    } as never,
    {
      executeSell: async () => {
        sellCalls += 1;
        await sellGate;
        return { success: true };
      },
    } as never,
    {
      getSolPriceUsd: async () => 1,
    } as never,
    {
      refreshExitContext: async () => {
        refreshCalls += 1;
        return new Map([
          ["mint_overlap", {
            tokenAddress: "mint_overlap",
            priceUsd: 1.31,
            liquidityUsd: 25_000,
            priceSource: "JUPITER_PRICE",
            updatedAt: 123456,
          }],
        ]);
      },
    } as never,
    defaultStrategyConfigs,
  );

  (monitor as any).monitoredIds = new Set(["pos_1"]);
  const first = (monitor as any).batchCheck();
  const second = (monitor as any).batchCheck();
  await Promise.resolve();
  releaseSell();
  await Promise.all([first, second]);

  assert.equal(refreshCalls, 1);
  assert.equal(sellCalls, 1);
});
