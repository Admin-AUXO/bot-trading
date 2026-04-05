import assert from "node:assert/strict";
import test from "node:test";
import { TradeExecutor } from "./trade-executor.js";
import { defaultStrategyConfigs } from "../utils/strategy-config.js";

test("executeBuy uses canIncreasePosition for tranche fills", async () => {
  const riskCalls: string[] = [];
  const riskManager = {
    canOpenPosition: () => {
      riskCalls.push("open");
      return { allowed: true };
    },
    canIncreasePosition: () => {
      riskCalls.push("increase");
      return { allowed: false, reason: "manual pause" };
    },
    reservePosition: () => {
      riskCalls.push("reserve");
    },
    releasePosition: () => {
      riskCalls.push("release");
    },
  };

  const jupiter = {
    toBaseUnits: async () => {
      throw new Error("should not normalize when the tranche fill is blocked early");
    },
  };

  const executor = new TradeExecutor(
    {} as never,
    riskManager as never,
    jupiter as never,
    {} as never,
    { mode: "DRY_RUN", configProfile: "default" },
    defaultStrategyConfigs,
  );

  const result = await executor.executeBuy({
    strategy: "S3_MOMENTUM",
    tokenAddress: "So11111111111111111111111111111111111111112",
    tokenSymbol: "TEST",
    amountSol: 0.1,
    maxSlippageBps: 500,
    regime: "NORMAL",
    positionId: "pos_test",
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "manual pause");
  assert.deepEqual(riskCalls, ["increase"]);
});

test("executeBuy blocks duplicate token exposure before risk checks", async () => {
  const riskCalls: string[] = [];
  const executor = new TradeExecutor(
    {
      holdsToken: () => true,
    } as never,
    {
      canOpenPosition: () => {
        riskCalls.push("open");
        return { allowed: true };
      },
    } as never,
    {} as never,
    {} as never,
    { mode: "DRY_RUN", configProfile: "default" },
    defaultStrategyConfigs,
  );

  const result = await executor.executeBuy({
    strategy: "S1_COPY",
    tokenAddress: "So11111111111111111111111111111111111111112",
    tokenSymbol: "TEST",
    amountSol: 0.2,
    maxSlippageBps: 500,
    regime: "NORMAL",
  });

  assert.equal(result.success, false);
  assert.equal(result.error, "token already held in active runtime");
  assert.deepEqual(riskCalls, []);
});
