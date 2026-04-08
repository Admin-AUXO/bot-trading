import assert from "node:assert/strict";
import test from "node:test";

const [{ TradeExecutor }, { config }, { defaultStrategyConfigs }] = await Promise.all([
  import("./trade-executor.js"),
  import("../config/index.js"),
  import("../utils/strategy-config.js"),
]);

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

test("executeBuy skips sender tip wiring when no sender endpoints are configured", async () => {
  const mutableHeliusConfig = config.helius as { senderUrls: string[] };
  const originalSenderUrls = [...config.helius.senderUrls];
  let tipCalls = 0;
  let buildOptions: { priorityFee?: number; blockhash?: string; tipLamports?: number; tipAccount?: string | null } | null = null;

  mutableHeliusConfig.senderUrls = [];

  try {
    const executor = new TradeExecutor(
      {
        holdsToken: () => false,
      } as never,
      {
        canOpenPosition: () => ({ allowed: true }),
        reservePosition: () => undefined,
        releasePosition: () => undefined,
      } as never,
      {
        toBaseUnits: async () => 100_000_000,
        getQuote: async () => ({
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "Token1111111111111111111111111111111111111",
          inAmount: "100000000",
          outAmount: "2500000",
          priceImpactPct: 0.1,
          slippageBps: 500,
          routePlan: [],
          inputDecimals: 9,
          outputDecimals: 6,
          inputAmountUi: 0.1,
          outputAmountUi: 2.5,
        }),
        buildSwapTransaction: async (_quote: unknown, options: NonNullable<typeof buildOptions>) => {
          buildOptions = options;
          return null;
        },
      } as never,
      {
        getPriorityFeeEstimate: async () => 11_000,
        getLatestBlockhash: async () => ({ blockhash: "blockhash", lastValidBlockHeight: 1 }),
        nextTipAccount: () => {
          tipCalls++;
          return "unusedTipAccount";
        },
      } as never,
      { mode: "LIVE", configProfile: "default" },
      defaultStrategyConfigs,
    );

    const result = await executor.executeBuy({
      strategy: "S1_COPY",
      tokenAddress: "Token1111111111111111111111111111111111111",
      tokenSymbol: "TEST",
      amountSol: 0.1,
      maxSlippageBps: 500,
      regime: "NORMAL",
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "failed to build swap tx");
    assert.equal(tipCalls, 0);
    assert.deepEqual(buildOptions, {
      priorityFee: 11_000,
      blockhash: "blockhash",
      tipLamports: 0,
      tipAccount: null,
    });
  } finally {
    mutableHeliusConfig.senderUrls = originalSenderUrls;
  }
});

test("executeBuy rotates sender tip accounts when sender endpoints are configured", async () => {
  const mutableHeliusConfig = config.helius as { senderUrls: string[] };
  const originalSenderUrls = [...config.helius.senderUrls];
  let tipCalls = 0;
  let buildOptions: { priorityFee?: number; blockhash?: string; tipLamports?: number; tipAccount?: string | null } | null = null;

  mutableHeliusConfig.senderUrls = ["http://lon-sender.helius-rpc.com/fast", "https://sender.helius-rpc.com/fast"];

  try {
    const executor = new TradeExecutor(
      {
        holdsToken: () => false,
      } as never,
      {
        canOpenPosition: () => ({ allowed: true }),
        reservePosition: () => undefined,
        releasePosition: () => undefined,
      } as never,
      {
        toBaseUnits: async () => 100_000_000,
        getQuote: async () => ({
          inputMint: "So11111111111111111111111111111111111111112",
          outputMint: "Token1111111111111111111111111111111111111",
          inAmount: "100000000",
          outAmount: "2500000",
          priceImpactPct: 0.1,
          slippageBps: 500,
          routePlan: [],
          inputDecimals: 9,
          outputDecimals: 6,
          inputAmountUi: 0.1,
          outputAmountUi: 2.5,
        }),
        buildSwapTransaction: async (_quote: unknown, options: NonNullable<typeof buildOptions>) => {
          buildOptions = options;
          return null;
        },
      } as never,
      {
        getPriorityFeeEstimate: async () => 11_000,
        getLatestBlockhash: async () => ({ blockhash: "blockhash", lastValidBlockHeight: 1 }),
        nextTipAccount: () => {
          tipCalls++;
          return "rotatingTipAccount";
        },
      } as never,
      { mode: "LIVE", configProfile: "default" },
      defaultStrategyConfigs,
    );

    const result = await executor.executeBuy({
      strategy: "S1_COPY",
      tokenAddress: "Token1111111111111111111111111111111111111",
      tokenSymbol: "TEST",
      amountSol: 0.1,
      maxSlippageBps: 500,
      regime: "NORMAL",
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "failed to build swap tx");
    assert.equal(tipCalls, 1);
    assert.deepEqual(buildOptions, {
      priorityFee: 11_000,
      blockhash: "blockhash",
      tipLamports: config.helius.senderTipLamports,
      tipAccount: "rotatingTipAccount",
    });
  } finally {
    mutableHeliusConfig.senderUrls = originalSenderUrls;
  }
});
