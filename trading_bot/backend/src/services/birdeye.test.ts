import assert from "node:assert/strict";
import test from "node:test";
import { stubFetch } from "../test/helpers.js";

const { BirdeyeService } = await import("./birdeye.js");

function createBudgetManager() {
  return {
    reserve: async () => ({
      commit: () => undefined,
    }),
    recordCacheHit: () => undefined,
  };
}

test("BirdeyeService.getMemeTokenList uses the /defi/v3 meme list endpoint", async () => {
  const requests: string[] = [];
  const restoreFetch = stubFetch(async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: {
        items: [
          {
            address: "mint_1",
            symbol: "TEST",
            name: "Test",
            source: "pump.fun",
            progressPercent: 90,
            graduated: false,
            realSolReserves: 123,
            creator: "creator_1",
          },
        ],
      },
    }), { status: 200 });
  });

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getMemeTokenList({ limit: 1, source: "pump.fun" });

    assert.equal(result.length, 1);
    assert.match(requests[0] ?? "", /^https:\/\/public-api\.birdeye\.so\/defi\/v3\/token\/meme\/list\?/);
  } finally {
    restoreFetch();
  }
});

test("BirdeyeService.getNewListings uses the /defi/v2 new listing endpoint", async () => {
  const requests: string[] = [];
  const restoreFetch = stubFetch(async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: [{ address: "mint_1" }],
    }), { status: 200 });
  });

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getNewListings();

    assert.equal(result.length, 1);
    assert.equal(requests[0], "https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20");
  } finally {
    restoreFetch();
  }
});

test("BirdeyeService.getTokenTrending uses the default endpoint and reads data.tokens", async () => {
  const requests: string[] = [];
  const restoreFetch = stubFetch(async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: {
        tokens: [{ address: "mint_1" }, { address: "mint_2" }],
      },
    }), { status: 200 });
  });

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getTokenTrending();

    assert.equal(result.length, 2);
    assert.equal(requests[0], "https://public-api.birdeye.so/defi/token_trending");
  } finally {
    restoreFetch();
  }
});

test("BirdeyeService.getTopTraders reads trader rows from data.items", async () => {
  const requests: string[] = [];
  const restoreFetch = stubFetch(async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: {
        items: [{ owner: "wallet_1" }],
      },
    }), { status: 200 });
  });

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getTopTraders("So11111111111111111111111111111111111111112");

    assert.equal(result.length, 1);
    assert.match(requests[0] ?? "", /^https:\/\/public-api\.birdeye\.so\/defi\/v2\/tokens\/top_traders\?/);
  } finally {
    restoreFetch();
  }
});

test("BirdeyeService normalizes current Birdeye overview and trade-data payloads", async () => {
  const requests: string[] = [];
  const restoreFetch = stubFetch(async (url: string | URL | Request) => {
    const requestUrl = String(url);
    requests.push(requestUrl);

    if (requestUrl.includes("/defi/token_overview")) {
      return new Response(JSON.stringify({
        data: {
          address: "mint_1",
          symbol: "TEST",
          name: "Test",
          price: 0.42,
          liquidity: 90_000,
          marketCap: 420_000,
          holder: 320,
          priceChange5mPercent: 12,
          priceChange1hPercent: 18,
          v5mUSD: 75_000,
          v1hUSD: 210_000,
          vBuy5mUSD: 48_000,
          vSell5mUSD: 27_000,
        },
      }), { status: 200 });
    }

    return new Response(JSON.stringify({
      data: {
        volume_5m_usd: 81_000,
        volume_history_5m_usd: 27_000,
        volume_buy_5m_usd: 49_000,
        trade_5m: 135,
        buy_5m: 82,
        unique_wallet_5m: 33,
      },
    }), { status: 200 });
  });

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const overview = await service.getTokenOverview("mint_1");
    const tradeData = await service.getTradeData("mint_1");

    assert.equal(overview?.marketCap, 420_000);
    assert.equal(overview?.volume5m, 75_000);
    assert.equal(overview?.buyPercent, 64);
    assert.equal(overview?.sellPercent, 36);

    assert.equal(tradeData?.volume5m, 81_000);
    assert.equal(tradeData?.volumeHistory5m, 27_000);
    assert.equal(tradeData?.volumeBuy5m, 49_000);
    assert.equal(tradeData?.trade5m, 135);
    assert.equal(tradeData?.buy5m, 82);
    assert.equal(tradeData?.uniqueWallet5m, 33);
  } finally {
    restoreFetch();
  }
});
