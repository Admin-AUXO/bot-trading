import assert from "node:assert/strict";
import test from "node:test";
import { DexScreenerService } from "./dexscreener.js";
import { MarketRouter } from "./market-router.js";

test("DexScreenerService batches token lookups in groups of 30", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    requests.push(href);
    const addresses = href.split("/").pop()?.split(",") ?? [];
    return new Response(JSON.stringify(
      addresses.map((address, index) => ({
        chainId: "solana",
        tokenAddress: address,
        pairAddress: `pair_${address}`,
        priceUsd: `${index + 1}`,
        liquidity: { usd: 10_000 + index },
        pairCreatedAt: 1_700_000_000_000 + index,
      })),
    ), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new DexScreenerService();
    const addresses = Array.from({ length: 31 }, (_, index) => `mint_${index + 1}`);
    const rows = await service.getTokens(addresses);

    assert.equal(requests.length, 2);
    assert.match(requests[0], /\/tokens\/v1\/solana\/mint_1,/);
    assert.match(requests[1], /\/tokens\/v1\/solana\/mint_31$/);
    assert.equal(rows.length, 31);
    assert.equal(rows[0].tokenAddress, "mint_1");
    assert.equal(rows[30].pairAddress, "pair_mint_31");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MarketRouter dedupes Jupiter seeds and maps DEX prefilter results", async () => {
  const router = new MarketRouter({
    jupiter: {
      getTopTrendingTokens: async () => ([
        { id: "mint_1", symbol: "ONE", name: "One", priceUsd: 0.1, liquidity: 11_000, marketCap: 50_000 },
        { id: "mint_2", symbol: "TWO", name: "Two", priceUsd: 0.2, liquidity: 12_000, marketCap: 60_000 },
      ]),
      getTopTradedTokens: async () => ([
        { id: "mint_2", symbol: "TWO", name: "Two", priceUsd: 0.2, liquidity: 12_000, marketCap: 60_000 },
        { id: "mint_3", symbol: "THREE", name: "Three", priceUsd: 0.3, liquidity: 13_000, marketCap: 70_000 },
      ]),
      getRecentTokens: async () => ([
        { id: "mint_4", symbol: "FOUR", name: "Four", priceUsd: 0.4, liquidity: 14_000, marketCap: 80_000 },
      ]),
      getPricesUsd: async () => new Map(),
    } as never,
    dexscreener: {
      getTokens: async () => ([
        {
          chainId: "solana",
          tokenAddress: "mint_1",
          pairAddress: "pair_1",
          priceUsd: 0.11,
          liquidityUsd: 20_000,
          pairCreatedAt: 1_700_000_000_000,
        },
        {
          chainId: "solana",
          tokenAddress: "mint_3",
          pairAddress: "pair_3",
          priceUsd: 0.31,
          liquidityUsd: 30_000,
          pairCreatedAt: 1_700_000_001_000,
        },
      ]),
      getTokenPairs: async () => [],
    } as never,
    birdeye: {} as never,
  });

  const momentumSeeds = await router.getMomentumSeeds({ interval: "1h", limit: 2 });
  assert.deepEqual(momentumSeeds.map((seed) => seed.address), ["mint_1", "mint_2", "mint_3"]);
  assert.equal(momentumSeeds[0].source, "JUPITER_TOP_TRENDING");
  assert.equal(momentumSeeds[2].source, "JUPITER_TOP_TRADED");

  const recentSeeds = await router.getRecentSeeds({ limit: 10 });
  assert.deepEqual(recentSeeds.map((seed) => seed.address), ["mint_4"]);
  assert.equal(recentSeeds[0].source, "JUPITER_RECENT");

  const prefilter = await router.prefilterCandidates(["mint_1", "mint_2", "mint_3"]);
  assert.equal(prefilter.get("mint_1")?.passed, true);
  assert.equal(prefilter.get("mint_1")?.liquidityUsd, 20_000);
  assert.equal(prefilter.get("mint_2")?.passed, false);
  assert.match(prefilter.get("mint_2")?.reason ?? "", /no dex/i);
});

test("MarketRouter.refreshExitContext maps Jupiter prices without forcing Birdeye", async () => {
  const router = new MarketRouter({
    jupiter: {
      getTopTrendingTokens: async () => [],
      getTopTradedTokens: async () => [],
      getRecentTokens: async () => [],
      getPricesUsd: async () => new Map([
        ["mint_1", { value: 0.42, priceChange24h: 12, liquidity: 18_000, updateUnixTime: 123456 }],
      ]),
      getQuoteForPriceCheck: async () => null,
    } as never,
    dexscreener: {
      getTokens: async () => [],
      getTokenPairs: async () => [],
    } as never,
    birdeye: {
      getMultiPrice: async () => new Map(),
      getTradeData: async () => null,
    } as never,
  });

  const refresh = await router.refreshExitContext(["mint_1", "mint_2"]);
  assert.equal(refresh.get("mint_1")?.priceUsd, 0.42);
  assert.equal(refresh.get("mint_1")?.liquidityUsd, 18_000);
  assert.equal(refresh.get("mint_2")?.priceUsd, null);
  assert.equal(refresh.get("mint_2")?.priceSource, "JUPITER_PRICE");
});

test("MarketRouter.refreshExitContext falls back to Jupiter quote-derived pricing before Birdeye", async () => {
  let quoteFallbackCalls = 0;
  let birdeyePriceCalls = 0;

  const router = new MarketRouter({
    jupiter: {
      getTopTrendingTokens: async () => [],
      getTopTradedTokens: async () => [],
      getRecentTokens: async () => [],
      getPricesUsd: async () => new Map(),
      getQuoteForPriceCheck: async () => {
        quoteFallbackCalls += 1;
        return 0.77;
      },
    } as never,
    dexscreener: {
      getTokens: async () => [],
      getTokenPairs: async () => [],
    } as never,
    birdeye: {
      getMultiPrice: async () => {
        birdeyePriceCalls += 1;
        return new Map();
      },
      getTradeData: async () => null,
    } as never,
  });

  const refresh = await router.refreshExitContext(["mint_quote"]);
  assert.equal(refresh.get("mint_quote")?.priceUsd, 0.77);
  assert.equal(refresh.get("mint_quote")?.priceSource, "JUPITER_QUOTE");
  assert.equal(quoteFallbackCalls, 1);
  assert.equal(birdeyePriceCalls, 0);
});

test("MarketRouter.refreshExitContext rate-caps repeated quote fallbacks for the same token", async () => {
  let quoteFallbackCalls = 0;

  const router = new MarketRouter({
    jupiter: {
      getTopTrendingTokens: async () => [],
      getTopTradedTokens: async () => [],
      getRecentTokens: async () => [],
      getPricesUsd: async () => new Map(),
      getQuoteForPriceCheck: async () => {
        quoteFallbackCalls += 1;
        return 0.77;
      },
    } as never,
    dexscreener: {
      getTokens: async () => [],
      getTokenPairs: async () => [],
    } as never,
    birdeye: {
      getMultiPrice: async () => new Map(),
      getTradeData: async () => null,
    } as never,
  });

  const first = await router.refreshExitContext(["mint_quote"]);
  const second = await router.refreshExitContext(["mint_quote"]);

  assert.equal(first.get("mint_quote")?.priceUsd, 0.77);
  assert.equal(second.get("mint_quote")?.priceUsd, 0.77);
  assert.equal(second.get("mint_quote")?.priceSource, "JUPITER_QUOTE");
  assert.equal(quoteFallbackCalls, 1);
});

test("MarketRouter.refreshExitContext falls back to Birdeye when Jupiter price paths are empty", async () => {
  let quoteFallbackCalls = 0;
  let birdeyePriceCalls = 0;

  const router = new MarketRouter({
    jupiter: {
      getTopTrendingTokens: async () => [],
      getTopTradedTokens: async () => [],
      getRecentTokens: async () => [],
      getPricesUsd: async () => new Map(),
      getQuoteForPriceCheck: async () => {
        quoteFallbackCalls += 1;
        return null;
      },
    } as never,
    dexscreener: {
      getTokens: async () => [],
      getTokenPairs: async () => [],
    } as never,
    birdeye: {
      getMultiPrice: async () => {
        birdeyePriceCalls += 1;
        return new Map([
          ["mint_birdeye", {
            value: 0.66,
            priceChange24h: 0,
            liquidity: 22_000,
            updateUnixTime: 654321,
          }],
        ]);
      },
      getTradeData: async () => null,
    } as never,
  });

  const refresh = await router.refreshExitContext(["mint_birdeye"]);
  assert.equal(refresh.get("mint_birdeye")?.priceUsd, 0.66);
  assert.equal(refresh.get("mint_birdeye")?.liquidityUsd, 22_000);
  assert.equal(refresh.get("mint_birdeye")?.priceSource, "BIRDEYE_SLOW_PATH");
  assert.equal(quoteFallbackCalls, 1);
  assert.equal(birdeyePriceCalls, 1);
});
