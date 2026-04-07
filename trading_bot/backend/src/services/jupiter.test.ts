import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@solana/web3.js";

const wallet = Keypair.generate();
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
process.env.HELIUS_API_KEY = "test-helius";
process.env.JUPITER_API_KEY = "test-key";
process.env.HELIUS_RPC_URL = "https://rpc.test";
process.env.HELIUS_WS_URL = "wss://ws.test";
process.env.JUPITER_BASE_URL = "https://api.jup.ag";
process.env.JUPITER_PRICE_PATH = "/price/v3";
process.env.JUPITER_SWAP_PATH = "/swap/v1";
process.env.BIRDEYE_API_KEY = "test-birdeye";
process.env.SOLANA_PRIVATE_KEY = JSON.stringify(Array.from(wallet.secretKey));
process.env.SOLANA_PUBLIC_KEY = wallet.publicKey.toBase58();
process.env.CONTROL_API_SECRET = "test-control-secret-123";

const { JupiterService } = await import("./jupiter.js");

function getHeader(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

test("JupiterService.getQuote uses the swap v1 quote endpoint and x-api-key header", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "mint_1",
      inAmount: "1000000000",
      outAmount: "42000000",
      priceImpactPct: 0.1,
      slippageBps: 50,
      routePlan: [],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new JupiterService();
    (service as any).normalizeQuote = async (quote: Record<string, unknown>) => ({
      ...quote,
      inputAmountUi: 1,
      outputAmountUi: 42,
      inputDecimals: 9,
      outputDecimals: 6,
    });

    const quote = await service.getQuote({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "mint_1",
      amount: 1_000_000_000,
      slippageBps: 50,
    });

    assert.ok(quote);
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/api\.jup\.ag\/swap\/v1\/quote\?/);
    assert.equal(getHeader(requests[0].init, "x-api-key"), "test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JupiterService.buildSwapTransaction uses the swap-instructions endpoint and x-api-key header", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const originalGetConnection = (JupiterService.prototype as unknown as { getConnection: unknown }).getConnection;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      computeBudgetInstructions: [],
      otherInstructions: [],
      setupInstructions: [],
      swapInstruction: {
        programId: "11111111111111111111111111111111",
        accounts: [],
        data: "",
      },
      cleanupInstruction: null,
      addressLookupTableAddresses: [],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    (JupiterService.prototype as unknown as { getConnection: () => unknown }).getConnection = () => ({
      getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111" }),
      getAddressLookupTable: async () => ({ value: null }),
    });
    const service = new JupiterService();
    const swapTx = await service.buildSwapTransaction({
      inputMint: "So11111111111111111111111111111111111111112",
      outputMint: "mint_1",
      inAmount: "1000000000",
      outAmount: "42000000",
      inputAmountUi: 1,
      outputAmountUi: 42,
      inputDecimals: 9,
      outputDecimals: 6,
      priceImpactPct: 0.1,
      slippageBps: 50,
      routePlan: [],
    }, { priorityFee: 1234, blockhash: "11111111111111111111111111111111" });

    assert.ok(swapTx);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.jup.ag/swap/v1/swap-instructions");
    assert.equal(getHeader(requests[0].init, "x-api-key"), "test-key");
  } finally {
    (JupiterService.prototype as unknown as { getConnection: unknown }).getConnection = originalGetConnection;
    globalThis.fetch = originalFetch;
  }
});

test("JupiterService.getPricesUsd batches ids through price v3", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      mint_1: { usdPrice: 0.25, liquidity: 10_000, priceChange24h: 12, blockId: 1 },
      mint_2: { usdPrice: 1.5, liquidity: 20_000, priceChange24h: -3, blockId: 2 },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new JupiterService();
    const prices = await (service as any).getPricesUsd(["mint_1", "mint_2", "mint_1"]);

    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /^https:\/\/api\.jup\.ag\/price\/v3\?ids=mint_1%2Cmint_2$/);
    assert.equal(getHeader(requests[0].init, "x-api-key"), "test-key");
    assert.equal(prices.get("mint_1")?.value, 0.25);
    assert.equal(prices.get("mint_2")?.liquidity, 20_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JupiterService.getTopTrendingTokens uses the Tokens V2 category endpoint", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify([{ id: "mint_1", symbol: "TEST" }]), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new JupiterService();
    const tokens = await (service as any).getTopTrendingTokens({ interval: "1h", limit: 25 });

    assert.equal(tokens.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.jup.ag/tokens/v2/toptrending/1h?limit=25");
    assert.equal(getHeader(requests[0].init, "x-api-key"), "test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JupiterService.getTopTrendingTokens defaults to the 1h category interval", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify([{ id: "mint_1", symbol: "TEST" }]), { status: 200 });
  }) as typeof fetch;

  try {
    const service = new JupiterService();
    const tokens = await (service as any).getTopTrendingTokens({ limit: 10 });

    assert.equal(tokens.length, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.jup.ag/tokens/v2/toptrending/1h?limit=10");
    assert.equal(getHeader(requests[0].init, "x-api-key"), "test-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
