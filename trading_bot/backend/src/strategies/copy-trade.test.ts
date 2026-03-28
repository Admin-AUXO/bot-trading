import assert from "node:assert/strict";
import test from "node:test";
import { CopyTradeStrategy } from "./copy-trade.js";

test("CopyTradeStrategy reconstructs wallet buys from opposing token and SOL deltas", () => {
  const strategy = new CopyTradeStrategy(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const trade = (strategy as any).extractWalletTrade(
    {
      tokenTransfers: [
        {
          mint: "mint_1",
          tokenAmount: 1250,
          fromUserAccount: "pool_1",
          toUserAccount: "wallet_1",
        },
      ],
      nativeTransfers: [
        {
          amount: 200_000_000,
          fromUserAccount: "wallet_1",
          toUserAccount: "pool_1",
        },
      ],
      blockTime: 1_700_000_000,
    },
    "wallet_1",
  );

  assert.deepEqual(trade, {
    mint: "mint_1",
    side: "BUY",
    amountToken: 1250,
    amountSol: 0.2,
    blockTime: 1_700_000_000,
  });
});
