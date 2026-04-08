import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../db/client.js";
import { config } from "../config/index.js";
import { captureCreateCalls, stubDateNow } from "../test/helpers.js";
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
    {
      getEntryCapacity: () => ({
        allowed: true,
        globalRemaining: 5,
        strategyRemaining: 3,
        remaining: 3,
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

test("MomentumStrategy.runScan drops obvious large-cap seeds before paid scoring", async () => {
  const evaluated: Array<Record<string, unknown>> = [];

  const strategy = new MomentumStrategy(
    {
      getEntryCapacity: () => ({
        allowed: true,
        globalRemaining: 5,
        strategyRemaining: 3,
        remaining: 3,
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
  );

  (strategy as any).marketRouter = {
    getMomentumSeeds: async () => ([
      {
        address: "mint_small",
        symbol: "SMALL",
        name: "Small",
        source: "JUPITER_TOP_TRENDING",
        priceUsd: 0.11,
        liquidityUsd: 30_000,
        marketCap: 300_000,
      },
      {
        address: "mint_large",
        symbol: "LARGE",
        name: "Large",
        source: "JUPITER_TOP_TRADED",
        priceUsd: 2.5,
        liquidityUsd: 4_000_000,
        marketCap: 5_000_000,
      },
    ]),
    prefilterCandidates: async () => new Map([
      ["mint_small", { address: "mint_small", passed: true, source: "DEX_SCREENER", priceUsd: 0.12, liquidityUsd: 31_000 }],
      ["mint_large", { address: "mint_large", passed: true, source: "DEX_SCREENER", priceUsd: 2.6, liquidityUsd: 4_100_000 }],
    ]),
  };

  (strategy as any).evaluateCandidate = async (candidate: Record<string, unknown>) => {
    evaluated.push(candidate);
  };

  await (strategy as any).runScan();

  assert.deepEqual(evaluated.map((candidate) => candidate.address), ["mint_small"]);
});

test("MomentumStrategy.runScan skips tokens still on reject cooldown", async () => {
  let prefilterCalls = 0;
  let evaluateCalls = 0;

  const strategy = new MomentumStrategy(
    {
      getEntryCapacity: () => ({
        allowed: true,
        globalRemaining: 5,
        strategyRemaining: 3,
        remaining: 3,
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
  );

  (strategy as any).recentRejectCooldownUntil.set("mint_cooldown", Date.now() + 60_000);
  (strategy as any).marketRouter = {
    getMomentumSeeds: async () => ([
      {
        address: "mint_cooldown",
        symbol: "COOL",
        name: "Cooling Off",
        source: "JUPITER_TOP_TRENDING",
        priceUsd: 0.11,
        liquidityUsd: 30_000,
        marketCap: 100_000,
      },
    ]),
    prefilterCandidates: async () => {
      prefilterCalls += 1;
      return new Map();
    },
  };

  (strategy as any).evaluateCandidate = async () => {
    evaluateCalls += 1;
  };

  await (strategy as any).runScan();

  assert.equal(prefilterCalls, 0);
  assert.equal(evaluateCalls, 0);
});

test("MomentumStrategy.evaluateCandidate records router seed source instead of Birdeye token-list source", async () => {
  const { calls: writes, restore: restoreCreate } = captureCreateCalls(db.signal);

  try {
    const strategy = new MomentumStrategy(
      {
        getEntryCapacity: () => ({
          allowed: true,
          globalRemaining: 5,
          strategyRemaining: 3,
          remaining: 3,
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
    restoreCreate();
  }
});

test("MomentumStrategy.evaluateCandidate records signal timing metadata", async () => {
  const { calls: writes, restore: restoreCreate } = captureCreateCalls(db.signal);
  const restoreDateNow = stubDateNow(1_700_000_020_000);

  try {
    const strategy = new MomentumStrategy(
      {
        getEntryCapacity: () => ({
          allowed: true,
          globalRemaining: 5,
          strategyRemaining: 3,
          remaining: 3,
        }),
        canOpenPosition: () => ({ allowed: true }),
        getPositionSize: () => 0.1,
      } as never,
      {
        holdsToken: () => false,
      } as never,
      {
        executeBuy: async () => ({ success: false }),
      } as never,
      {} as never,
      {
        getRegime: () => "NORMAL",
      } as never,
      {} as never,
      {} as never,
    );

    (strategy as any).runFilters = async () => ({
      passed: false,
      tokenAddress: "mint_timing",
      tokenSymbol: "TIME",
      rejectReason: "filtered",
      filterResults: {
        seedSource: "JUPITER_TOP_TRADED",
      },
      overview: null,
      tradeData: null,
    });

    await (strategy as any).evaluateCandidate({
      address: "mint_timing",
      symbol: "TIME",
      name: "Timing",
      source: "JUPITER_TOP_TRADED",
      seedPriceUsd: 0.01,
      seedLiquidityUsd: 40_000,
      seedMarketCap: 200_000,
      prefilterPriceUsd: 0.011,
      prefilterLiquidityUsd: 41_000,
    });

    assert.equal(writes.length, 1);
    const data = writes[0].data as Record<string, unknown>;
    assert.equal((data.detectedAt as Date).getTime(), 1_700_000_020_000);
    assert.equal((data.metadata as Record<string, unknown>).cadenceMs, config.strategies.s3.scanIntervalMs);
    assert.equal((data.metadata as Record<string, unknown>).detectionToSignalMs, 0);
  } finally {
    restoreCreate();
    restoreDateNow();
  }
});

test("MomentumStrategy.evaluateCandidate limits paid evaluations to remaining slots", async () => {
  const { calls: writes, restore: restoreCreate } = captureCreateCalls(db.signal);
  let runFiltersCalls = 0;
  let releaseRunFilters: (() => void) | undefined;
  const runFiltersBlock = new Promise<void>((resolve) => {
    releaseRunFilters = () => resolve();
  });
  try {
    const strategy = new MomentumStrategy(
      {
        getEntryCapacity: () => ({
          allowed: true,
          globalRemaining: 5,
          strategyRemaining: 1,
          remaining: 1,
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
    );

    (strategy as any).runFilters = async (candidate: { address: string; symbol: string }) => {
      runFiltersCalls += 1;
      await runFiltersBlock;
      return {
        passed: false,
        tokenAddress: candidate.address,
        tokenSymbol: candidate.symbol,
        rejectReason: "filtered",
        filterResults: {},
      };
    };

    const first = (strategy as any).evaluateCandidate({
      address: "mint_1",
      symbol: "ONE",
      name: "One",
      source: "JUPITER_TOP_TRENDING",
      seedPriceUsd: 0.1,
      seedLiquidityUsd: 50_000,
      seedMarketCap: 120_000,
    });
    const second = (strategy as any).evaluateCandidate({
      address: "mint_2",
      symbol: "TWO",
      name: "Two",
      source: "JUPITER_TOP_TRADED",
      seedPriceUsd: 0.2,
      seedLiquidityUsd: 55_000,
      seedMarketCap: 140_000,
    });

    if (releaseRunFilters) releaseRunFilters();
    await Promise.all([first, second]);

    assert.equal(runFiltersCalls, 1);
    assert.equal(writes.length, 1);
    assert.equal((writes[0].data as Record<string, unknown>).tokenAddress, "mint_1");
  } finally {
    restoreCreate();
  }
});

test("MomentumStrategy rejects incomplete trade data instead of mislabeling it as weak momentum", async () => {
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
        volumeHistory5m: 0,
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
        { address: "holder_1", percent: 20 },
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
  assert.equal(result.rejectReason, "incomplete trade data");
  assert.equal(result.filterResults.tradeDataComplete, false);
});

test("MomentumStrategy rejects low 5m volume before safety endpoint calls", async () => {
  let securityCalls = 0;
  let holderCalls = 0;

  const strategy = new MomentumStrategy(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getTokenOverview: async () => ({
        address: "mint_low_volume",
        symbol: "LOW",
        name: "Low Volume Token",
        price: 0.001,
        priceChange5m: 15,
        priceChange1h: 20,
        volume5m: 12_000,
        volume1h: 40_000,
        liquidity: 50_000,
        marketCap: 300_000,
        holder: 220,
        buyPercent: 65,
        sellPercent: 35,
      }),
      getTradeData: async () => ({
        volume5m: 12_000,
        volumeHistory5m: 4_000,
        volumeBuy5m: 8_000,
        trade5m: 180,
        buy5m: 110,
        uniqueWallet5m: 120,
      }),
      getTokenSecurity: async () => {
        securityCalls += 1;
        return {
          top10HolderPercent: 35,
          freezeable: false,
          mintAuthority: false,
          transferFeeEnable: false,
          mutableMetadata: false,
        };
      },
      getTokenHolders: async () => {
        holderCalls += 1;
        return [{ address: "holder_1", percent: 20 }];
      },
    } as never,
  );

  const result = await (strategy as any).runFilters({
    address: "mint_low_volume",
    symbol: "LOW",
    name: "Low Volume Token",
    source: "JUPITER_TOP_TRENDING",
    seedPriceUsd: 0.001,
    seedLiquidityUsd: 50_000,
    seedMarketCap: 300_000,
    prefilterPriceUsd: 0.0011,
    prefilterLiquidityUsd: 51_000,
  });

  assert.equal(result.passed, false);
  assert.equal(result.rejectReason, "volume 12000 < 30000");
  assert.equal(result.filterResults.tradeVolume5m, 12_000);
  assert.equal(securityCalls, 0);
  assert.equal(holderCalls, 0);
});

test("MomentumStrategy rejects low-liquidity DEX prefilter candidates before paid scoring", async () => {
  let birdeyeCalls = 0;

  const strategy = new MomentumStrategy(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getTokenOverview: async () => {
        birdeyeCalls += 1;
        return null;
      },
      getTradeData: async () => {
        birdeyeCalls += 1;
        return null;
      },
      getTokenSecurity: async () => {
        birdeyeCalls += 1;
        return null;
      },
      getTokenHolders: async () => {
        birdeyeCalls += 1;
        return [];
      },
    } as never,
  );

  const result = await (strategy as any).runFilters({
    address: "mint_thin",
    symbol: "THIN",
    name: "Thin Token",
    source: "JUPITER_TOP_TRENDING",
    seedPriceUsd: 0.001,
    seedLiquidityUsd: 10_000,
    seedMarketCap: 150_000,
    prefilterPriceUsd: 0.0011,
    prefilterLiquidityUsd: 10_000,
  });

  assert.equal(result.passed, false);
  assert.equal(result.rejectReason, "liquidity 10000 < 30000");
  assert.equal(result.filterResults.prefilterLiquidityUsd, 10_000);
  assert.equal(birdeyeCalls, 0);
});
