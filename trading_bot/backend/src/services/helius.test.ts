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

const { HeliusService } = await import("./helius.js");

function createBudgetManager() {
  return {
    reserve: async () => ({
      commit: () => undefined,
    }),
  };
}

test("HeliusService.getTransactionsForAddress reads rows from result.data envelopes", async () => {
  const service = new HeliusService(createBudgetManager() as never);
  (service as any).rateLimiter = { waitForSlot: async () => undefined };
  (service as any).circuitBreaker = { execute: async (fn: () => Promise<unknown>) => fn() };
  (service as any).dedupedFetch = (_key: string, fn: () => Promise<unknown[]>) => fn();
  (service as any).helius = {
    getTransactionsForAddress: async () => ({
      data: [{ signature: "sig_1" }, { signature: "sig_2" }],
      paginationToken: "token_1",
    }),
  };

  const result = await service.getTransactionsForAddress("wallet_1", { limit: 2 });

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { signature: "sig_1" });
});
