import assert from "node:assert/strict";
import test from "node:test";
import { runTradeDataChecks } from "./token-filters.js";

test("runTradeDataChecks enforces unique-wallet threshold instead of raw buy count", () => {
  const result = runTradeDataChecks(
    {
      volume5m: 25_000,
      volumeHistory5m: 10_000,
      volumeBuy5m: 16_000,
      trade5m: 140,
      buy5m: 120,
      uniqueWallet5m: 18,
    },
    {
      minUniqueBuyers5m: 20,
      minBuySellRatio: 1.5,
    },
  );

  assert.equal(result.pass, false);
  assert.equal(result.reason, "unique wallets 18 < 20");
  assert.equal(result.filterResults.buyCount5m, 120);
  assert.equal(result.filterResults.uniqueWallet5m, 18);
});
