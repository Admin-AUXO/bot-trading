import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../config/index.js";
import { GraduationStrategy } from "./graduation.js";

test("GraduationStrategy.start uses plan-aware catch-up cadence and skips new-listing fallback when disabled", async () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const intervals: number[] = [];

  global.setInterval = (((
    _fn: (...args: any[]) => void,
    delay?: number,
    ..._args: any[]
  ) => {
    intervals.push(Number(delay ?? 0));
    return { delay } as never;
  }) as unknown as typeof setInterval);
  global.clearInterval = (((_handle?: ReturnType<typeof setInterval>) => undefined) as typeof clearInterval);

  try {
    const strategy = new (GraduationStrategy as any)(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        strategyConfig: {
          ...config.strategies.s2,
          enableNewListingFallback: false,
        },
      },
    );

    (strategy as any).runSeedScan = async () => undefined;
    (strategy as any).runCatchupScan = async () => undefined;
    (strategy as any).runFallbackScan = async () => undefined;

    await strategy.start();
    strategy.stop();

    assert.ok(intervals.includes(config.strategies.s2.scanIntervalMs));
    assert.ok(intervals.includes(config.birdeye.s2CatchupIntervalMs));
    assert.ok(!intervals.includes(config.strategies.s2.fallbackScanIntervalMs));
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test("GraduationStrategy.runSeedScan uses recent seeds and DEX prefilter before paid meme detail", async () => {
  let recentSeedCalls = 0;
  let prefilterCalls = 0;
  let memeDetailCalls = 0;
  let memeListCalls = 0;
  const processed: string[] = [];

  const strategy = new (GraduationStrategy as any)(
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
      getRecentSeeds: async () => {
        recentSeedCalls += 1;
        return [
          {
            address: "mint_1",
            symbol: "ONE",
            name: "One",
            source: "JUPITER_RECENT",
            priceUsd: 0.11,
            liquidityUsd: 25_000,
            marketCap: 90_000,
          },
          {
            address: "mint_2",
            symbol: "TWO",
            name: "Two",
            source: "JUPITER_RECENT",
            priceUsd: 0.22,
            liquidityUsd: 15_000,
            marketCap: 120_000,
          },
          {
            address: "mint_3",
            symbol: "THREE",
            name: "Three",
            source: "JUPITER_RECENT",
            priceUsd: 0.33,
            liquidityUsd: 35_000,
            marketCap: 140_000,
          },
        ];
      },
      prefilterCandidates: async (addresses: string[]) => {
        prefilterCalls += 1;
        assert.deepEqual(addresses, ["mint_1", "mint_2", "mint_3"]);
        return new Map([
          ["mint_1", { address: "mint_1", passed: true, source: "DEX_SCREENER", pairCreatedAt: 1_700_000_000_000 }],
          ["mint_2", { address: "mint_2", passed: false, source: "DEX_SCREENER", reason: "no DEX Screener market data" }],
          ["mint_3", { address: "mint_3", passed: true, source: "DEX_SCREENER", pairCreatedAt: 1_700_000_100_000 }],
        ]);
      },
    } as never,
    {
      getMemeTokenList: async () => {
        memeListCalls += 1;
        return [];
      },
      getMemeTokenDetail: async (address: string) => {
        memeDetailCalls += 1;
        if (address === "mint_1") {
          return {
            address,
            symbol: "ONE",
            name: "One",
            source: "pumpfun",
            progressPercent: 75,
            graduated: false,
            realSolReserves: 10,
            creator: "creator_1",
          };
        }
        return {
          address,
          symbol: "THREE",
          name: "Three",
          source: "pumpfun",
          progressPercent: 10,
          graduated: false,
          realSolReserves: 5,
          creator: "creator_3",
        };
      },
    } as never,
  );

  (strategy as any).processCandidate = async (token: { address: string }) => {
    processed.push(token.address);
  };

  await (strategy as any).runSeedScan();

  assert.equal(recentSeedCalls, 1);
  assert.equal(prefilterCalls, 1);
  assert.equal(memeListCalls, 0);
  assert.equal(memeDetailCalls, 2);
  assert.deepEqual(processed, ["mint_1"]);
});
