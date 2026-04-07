import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.HELIUS_API_KEY ??= "test-helius";
process.env.HELIUS_RPC_URL ??= "https://rpc.test";
process.env.HELIUS_WS_URL ??= "wss://ws.test";
process.env.BIRDEYE_API_KEY ??= "test-birdeye";
process.env.SOLANA_PRIVATE_KEY ??= JSON.stringify(Array.from({ length: 64 }, (_, index) => index + 1));
process.env.SOLANA_PUBLIC_KEY ??= "11111111111111111111111111111111";
process.env.CONTROL_API_SECRET ??= "test-control-secret-123";

const [{ db }, { CopyTradeStrategy }] = await Promise.all([
  import("../db/client.js"),
  import("./copy-trade.js"),
]);

test("CopyTradeStrategy reconstructs wallet buys from opposing token and SOL deltas", () => {
  const strategy = new CopyTradeStrategy(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const trade = (strategy as any).extractWalletTrade(
    {
      tokenTransfers: [
        {
          mint: "mint_1",
          tokenAmount: 1250,
          fromUserAccount: "pool_1",
          toUserAccount: "wallet_1",
        },
      ],
      nativeTransfers: [
        {
          amount: 200_000_000,
          fromUserAccount: "wallet_1",
          toUserAccount: "pool_1",
        },
      ],
      blockTime: 1_700_000_000,
    },
    "wallet_1",
  );

  assert.deepEqual(trade, {
    mint: "mint_1",
    side: "BUY",
    amountToken: 1250,
    amountSol: 0.2,
    blockTime: 1_700_000_000,
  });
});

test("CopyTradeStrategy.runFilters rejects DEX prefilter failures before paid Birdeye scoring", async () => {
  let birdeyeOverviewCalls = 0;

  const strategy = new (CopyTradeStrategy as any)(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      prefilterCandidates: async () => new Map([
        ["mint_bad", {
          address: "mint_bad",
          passed: false,
          source: "DEX_SCREENER",
          reason: "no DEX Screener market data",
        }],
      ]),
    } as never,
    {
      getTokenOverview: async () => {
        birdeyeOverviewCalls += 1;
        return null;
      },
      getTokenSecurity: async () => null,
      getTokenHolders: async () => [],
      getTradeData: async () => null,
    } as never,
  );

  const result = await (strategy as any).runFilters("mint_bad");

  assert.equal(result.passed, false);
  assert.match(result.rejectReason ?? "", /dex screener/i);
  assert.equal(birdeyeOverviewCalls, 0);
});

test("CopyTradeStrategy.runFilters rejects stale source transactions in LIVE before paid scoring", async () => {
  let prefilterCalls = 0;
  let birdeyeOverviewCalls = 0;

  const strategy = new (CopyTradeStrategy as any)(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      prefilterCandidates: async () => {
        prefilterCalls += 1;
        return new Map();
      },
    } as never,
    {
      getTokenOverview: async () => {
        birdeyeOverviewCalls += 1;
        return null;
      },
      getTokenSecurity: async () => null,
      getTokenHolders: async () => [],
      getTradeData: async () => null,
    } as never,
    {
      scope: { mode: "LIVE", configProfile: "default" },
    },
  );

  const originalDateNow = Date.now;
  Date.now = () => 1_700_000_050_000;

  try {
    const result = await (strategy as any).runFilters("mint_old", Date.now(), 1_700_000_000);

    assert.equal(result.passed, false);
    assert.match(result.rejectReason ?? "", /source transaction age 50s > 30s/i);
    assert.equal(prefilterCalls, 0);
    assert.equal(birdeyeOverviewCalls, 0);
    assert.equal(result.filterResults.sourceTxAgeSec, 50);
  } finally {
    Date.now = originalDateNow;
  }
});

test("CopyTradeStrategy.evaluateAndTrade skips paid scoring when S1 is already at capacity", async () => {
  let runFiltersCalls = 0;
  const tokenAddress = "So11111111111111111111111111111111111111112";

  const strategy = new (CopyTradeStrategy as any)(
    {
      getEntryCapacity: () => ({
        allowed: false,
        reason: "max 2 S1_COPY positions reached",
        globalRemaining: 3,
        strategyRemaining: 0,
        remaining: 0,
      }),
    } as never,
    {
      holdsToken: () => false,
    } as never,
    {} as never,
    {} as never,
    {
      getRegime: () => "NORMAL",
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );

  (strategy as any).runFilters = async () => {
    runFiltersCalls += 1;
    return { passed: true, tokenAddress, tokenSymbol: "FULL", filterResults: {} };
  };

  await (strategy as any).evaluateAndTrade(tokenAddress, "wallet_1", Date.now(), null);

  assert.equal(runFiltersCalls, 0);
});

test("CopyTradeStrategy.processWalletActivity records router price instead of direct Birdeye multi-price", async () => {
  const originalWalletScoreFindFirst = db.walletScore.findFirst;
  const originalWalletActivityFindUnique = db.walletActivity.findUnique;
  const originalWalletActivityCreate = db.walletActivity.create;
  const created: Array<Record<string, unknown>> = [];
  let refreshCalls = 0;
  let multiPriceCalls = 0;

  db.walletScore.findFirst = (async () => null) as typeof db.walletScore.findFirst;
  db.walletActivity.findUnique = (async () => null) as typeof db.walletActivity.findUnique;
  db.walletActivity.create = (async (args: Record<string, unknown>) => {
    created.push(args);
    return {} as never;
  }) as typeof db.walletActivity.create;

  try {
    const strategy = new (CopyTradeStrategy as any)(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        getSignaturesForAddressIncremental: async () => ([{ signature: "sig_router" }]),
        getWalletTradeFromSignature: async () => ({
          tokenAddress: "mint_router",
          amountSol: 0.2,
          amountToken: 100,
          signature: "sig_router",
          side: "BUY",
          blockTime: 1_700_000_000,
        }),
      } as never,
      {
        refreshExitContext: async () => {
          refreshCalls += 1;
          return new Map([
            ["mint_router", {
              tokenAddress: "mint_router",
              priceUsd: 0.55,
              liquidityUsd: 25_000,
              priceSource: "JUPITER_PRICE",
              updatedAt: 123456,
            }],
          ]);
        },
      } as never,
      {
        getMultiPrice: async () => {
          multiPriceCalls += 1;
          return new Map();
        },
      } as never,
    );

    (strategy as any).evaluateAndTrade = async () => undefined;

    await (strategy as any).processWalletActivity("wallet_1", Date.now());

    assert.equal(refreshCalls, 1);
    assert.equal(multiPriceCalls, 0);
    assert.equal(created.length, 1);
    assert.equal((created[0].data as Record<string, unknown>).priceAtTrade, 0.55);
  } finally {
    db.walletScore.findFirst = originalWalletScoreFindFirst;
    db.walletActivity.findUnique = originalWalletActivityFindUnique;
    db.walletActivity.create = originalWalletActivityCreate;
  }
});

test("CopyTradeStrategy.start does not block startup on wallet scoring bootstrap", async () => {
  const strategy = new (CopyTradeStrategy as any)(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      connectWebSocket: () => undefined,
    } as never,
    {} as never,
    {} as never,
  );

  let scoringStarted = false;
  let scoringResolved = false;
  let subscribeCalls = 0;

  strategy.loadEliteWallets = async () => {
    strategy.eliteWallets = [];
  };
  strategy.runWalletScoring = async () => {
    scoringStarted = true;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    scoringResolved = true;
  };
  strategy.primeWalletActivityWaterlines = async () => undefined;
  strategy.subscribeToEliteWallets = async () => {
    subscribeCalls += 1;
  };

  await strategy.start();

  assert.equal(scoringStarted, true);
  assert.equal(scoringResolved, false);
  assert.equal(subscribeCalls, 1);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(scoringResolved, true);
});

test("CopyTradeStrategy.runFilters rejects weak continuation when unique buyers and buy/sell ratio are thin", async () => {
  const strategy = new (CopyTradeStrategy as any)(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      prefilterCandidates: async () => new Map([
        ["mint_weak", {
          address: "mint_weak",
          passed: true,
          source: "DEX_SCREENER",
          liquidityUsd: 80_000,
          priceUsd: 0.12,
        }],
      ]),
    } as never,
    {
      getTokenOverview: async () => ({
        address: "mint_weak",
        symbol: "WEAK",
        name: "Weak Token",
        price: 0.12,
        priceChange5m: 5,
        priceChange1h: 10,
        volume5m: 40_000,
        volume1h: 120_000,
        liquidity: 80_000,
        marketCap: 400_000,
        holder: 300,
        buyPercent: 65,
        sellPercent: 35,
      }),
      getTokenSecurity: async () => ({
        top10HolderPercent: 25,
        freezeable: false,
        mintAuthority: false,
        transferFeeEnable: false,
        mutableMetadata: false,
      }),
      getTokenHolders: async () => [{ address: "holder_1", percent: 8 }],
      getTradeData: async () => ({
        volume5m: 40_000,
        volumeHistory5m: 15_000,
        volumeBuy5m: 22_000,
        trade5m: 20,
        buy5m: 10,
        uniqueWallet5m: 12,
      }),
    } as never,
  );

  const result = await (strategy as any).runFilters("mint_weak");

  assert.equal(result.passed, false);
  assert.match(result.rejectReason ?? "", /unique wallets|buy\/sell ratio/i);
});
