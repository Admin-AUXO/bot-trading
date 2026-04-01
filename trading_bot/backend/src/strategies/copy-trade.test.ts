import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../db/client.js";
import { CopyTradeStrategy } from "./copy-trade.js";

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
