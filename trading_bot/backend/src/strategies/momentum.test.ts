import assert from "node:assert/strict";
import test from "node:test";
import { MomentumStrategy } from "./momentum.js";

test("MomentumStrategy rejects tokens that violate the single-holder cap", async () => {
  const strategy = new MomentumStrategy(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
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
  });

  assert.equal(result.passed, false);
  assert.match(result.rejectReason ?? "", /top holder 30%/);
});
