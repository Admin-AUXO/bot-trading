import assert from "node:assert/strict";
import test from "node:test";
import { runFreshnessCheck, runHolderCountCheck, runTradeDataChecks } from "./token-filters.js";

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

test("runTradeDataChecks fails closed when trade data is required but missing", () => {
  const result = runTradeDataChecks(null, {
    requireTradeData: true,
  });

  assert.equal(result.pass, false);
  assert.equal(result.reason, "no trade data");
  assert.equal(result.filterResults.tradeDataAvailable, false);
});

test("runTradeDataChecks enforces wash-trading ratio when configured", () => {
  const result = runTradeDataChecks(
    {
      volume5m: 50_000,
      volumeHistory5m: 10_000,
      volumeBuy5m: 20_000,
      trade5m: 140,
      buy5m: 100,
      uniqueWallet5m: 3,
    },
    {
      minWashTradingRatio: 0.1,
    },
  );

  assert.equal(result.pass, false);
  assert.equal(result.reason, "wash trading detected");
  assert.equal(result.filterResults.washTradingRatio, 0.06);
});

test("runHolderCountCheck enforces the configured holder floor", () => {
  const result = runHolderCountCheck(
    {
      address: "mint_1",
      symbol: "TEST",
      name: "Test Token",
      price: 0.1,
      priceChange5m: 5,
      priceChange1h: 10,
      volume5m: 5_000,
      volume1h: 20_000,
      liquidity: 50_000,
      marketCap: 100_000,
      holder: 150,
      buyPercent: 60,
      sellPercent: 40,
    },
    {
      minHolderCount: 200,
    },
  );

  assert.equal(result.pass, false);
  assert.equal(result.reason, "holders 150 < 200");
  assert.equal(result.filterResults.holderCount, 150);
});

test("runFreshnessCheck rejects timestamps older than the configured limit", () => {
  const result = runFreshnessCheck(1_700_000_000, {
    nowMs: 1_700_040_000 * 1000,
    maxAgeSeconds: 30,
    requireTimestamp: true,
    ageKey: "sourceTxAgeSec",
    label: "source transaction",
  });

  assert.equal(result.pass, false);
  assert.equal(result.reason, "source transaction age 40000s > 30s");
  assert.equal(result.filterResults.sourceTxAgeSec, 40000);
});
