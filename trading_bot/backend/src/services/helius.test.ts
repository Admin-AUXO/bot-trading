import assert from "node:assert/strict";
import test from "node:test";

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
