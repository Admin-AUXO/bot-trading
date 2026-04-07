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
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request) => {
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
  }) as typeof fetch;

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getMemeTokenList({ limit: 1, source: "pump.fun" });

    assert.equal(result.length, 1);
    assert.match(requests[0] ?? "", /^https:\/\/public-api\.birdeye\.so\/defi\/v3\/token\/meme\/list\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BirdeyeService.getNewListings uses the /defi/v2 new listing endpoint", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: [{ address: "mint_1" }],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getNewListings();

    assert.equal(result.length, 1);
    assert.equal(requests[0], "https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BirdeyeService.getTokenTrending uses the default endpoint and reads data.tokens", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: {
        tokens: [{ address: "mint_1" }, { address: "mint_2" }],
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getTokenTrending();

    assert.equal(result.length, 2);
    assert.equal(requests[0], "https://public-api.birdeye.so/defi/token_trending");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BirdeyeService.getTopTraders reads trader rows from data.items", async () => {
  const requests: string[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(JSON.stringify({
      data: {
        items: [{ owner: "wallet_1" }],
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new BirdeyeService(createBudgetManager() as never);
    const result = await service.getTopTraders("So11111111111111111111111111111111111111112");

    assert.equal(result.length, 1);
    assert.match(requests[0] ?? "", /^https:\/\/public-api\.birdeye\.so\/defi\/v2\/tokens\/top_traders\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
