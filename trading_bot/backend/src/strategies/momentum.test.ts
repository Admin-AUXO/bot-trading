import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../db/client.js";
import { MomentumStrategy } from "./momentum.js";

test("MomentumStrategy rejects tokens that violate the single-holder cap", async () => {
  const strategy = new MomentumStrategy(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getTokenOverview: async () => ({
        address: "mint_1",
        symbol: "TEST",
        name: "Test Token",
        price: 0.001,
        priceChange5m: 15,
        priceChange1h: 20,
        volume5m: 90_000,
        volume1h: 200_000,
        liquidity: 50_000,
        marketCap: 300_000,
        holder: 200,
        buyPercent: 65,
        sellPercent: 35,
      }),
      getTradeData: async () => ({
        volume5m: 90_000,
        volumeHistory5m: 20_000,
        volumeBuy5m: 60_000,
        trade5m: 180,
        buy5m: 110,
        uniqueWallet5m: 120,
      }),
      getTokenSecurity: async () => ({
        top10HolderPercent: 35,
        freezeable: false,
        mintAuthority: false,
        transferFeeEnable: false,
        mutableMetadata: false,
      }),
      getTokenHolders: async () => ([
        { address: "holder_1", percent: 30 },
      ]),
    } as never,
  );

  const result = await (strategy as any).runFilters({
    address: "mint_1",
    symbol: "TEST",
    name: "Test Token",
    source: "JUPITER_TOP_TRENDING",
    seedPriceUsd: 0.001,
    seedLiquidityUsd: 50_000,
    seedMarketCap: 300_000,
    prefilterPriceUsd: 0.0011,
    prefilterLiquidityUsd: 51_000,
  });

  assert.equal(result.passed, false);
  assert.match(result.rejectReason ?? "", /top holder 30%/);
});

test("MomentumStrategy.runScan uses MarketRouter seeds plus DEX prefilter before paid scoring", async () => {
  let getMomentumSeedsCalls = 0;
  let prefilterCalls = 0;
  let tokenListCalls = 0;
  const evaluated: Array<Record<string, unknown>> = [];

  const strategy = new MomentumStrategy(
    {} as never,
    {
      holdsToken: () => false,
    } as never,
    {} as never,
    {} as never,
    {
      getRegime: () => "NORMAL",
    } as never,
    {} as never,
    {
      getTokenList: async () => {
        tokenListCalls += 1;
        return [];
      },
    } as never,
  );

  (strategy as any).marketRouter = {
    getMomentumSeeds: async () => {
      getMomentumSeedsCalls += 1;
      return [
        {
          address: "mint_1",
          symbol: "ONE",
          name: "One",
          source: "JUPITER_TOP_TRENDING",
          priceUsd: 0.11,
          liquidityUsd: 30_000,
          marketCap: 100_000,
        },
        {
          address: "mint_2",
          symbol: "TWO",
          name: "Two",
          source: "JUPITER_TOP_TRADED",
          priceUsd: 0.22,
          liquidityUsd: 5_000,
          marketCap: 200_000,
        },
        {
          address: "mint_3",
          symbol: "THREE",
          name: "Three",
          source: "JUPITER_TOP_TRADED",
          priceUsd: 0.33,
          liquidityUsd: 40_000,
          marketCap: 300_000,
        },
      ];
    },
    prefilterCandidates: async (addresses: string[]) => {
      prefilterCalls += 1;
      assert.deepEqual(addresses, ["mint_1", "mint_2", "mint_3"]);
      return new Map([
        ["mint_1", { address: "mint_1", passed: true, source: "DEX_SCREENER", priceUsd: 0.12, liquidityUsd: 31_000 }],
        ["mint_2", { address: "mint_2", passed: false, source: "DEX_SCREENER", reason: "no DEX Screener market data" }],
        ["mint_3", { address: "mint_3", passed: true, source: "DEX_SCREENER", priceUsd: 0.35, liquidityUsd: 41_000 }],
      ]);
    },
  };

  (strategy as any).evaluateCandidate = async (candidate: Record<string, unknown>) => {
    evaluated.push(candidate);
  };

  await (strategy as any).runScan();

  assert.equal(tokenListCalls, 0);
  assert.equal(getMomentumSeedsCalls, 1);
  assert.equal(prefilterCalls, 1);
  assert.deepEqual(evaluated.map((candidate) => candidate.address), ["mint_1", "mint_3"]);
  assert.equal(evaluated[0].source, "JUPITER_TOP_TRENDING");
  assert.equal(evaluated[0].prefilterLiquidityUsd, 31_000);
});

test("MomentumStrategy.evaluateCandidate records router seed source instead of Birdeye token-list source", async () => {
  const originalCreate = db.signal.create;
  const writes: Array<Record<string, unknown>> = [];

  db.signal.create = (async (args: Record<string, unknown>) => {
    writes.push(args);
    return {} as never;
  }) as typeof db.signal.create;

  try {
    const strategy = new MomentumStrategy(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        getRegime: () => "NORMAL",
      } as never,
      {} as never,
      {} as never,
    );

    (strategy as any).runFilters = async () => ({
      passed: false,
      tokenAddress: "mint_signal",
      tokenSymbol: "SIG",
      rejectReason: "filtered",
      filterResults: {
        seedSource: "JUPITER_TOP_TRADED",
      },
    });

    await (strategy as any).evaluateCandidate({
      address: "mint_signal",
      symbol: "SIG",
      name: "Signal Token",
      source: "JUPITER_TOP_TRADED",
      seedPriceUsd: 0.4,
      seedLiquidityUsd: 50_000,
      seedMarketCap: 250_000,
      prefilterPriceUsd: 0.41,
      prefilterLiquidityUsd: 52_000,
    });

    assert.equal(writes.length, 1);
    assert.equal((writes[0].data as Record<string, unknown>).source, "JUPITER_TOP_TRADED");
  } finally {
    db.signal.create = originalCreate;
  }
});
