# Birdeye Data Access For Lite And Starter

Effective from the upstream table dated `2025-11-26`.

This file ignores Premium and Business detail unless it changes a Lite/Starter decision.

## Simple Rule Set

Lite and Starter can access most single-resource REST APIs.

Lite and Starter cannot access:

- most `multiple` or batch endpoints
- WebSockets
- Business-only bulk wallet and token endpoints

The one important exception:

- Lite and Starter can use `/defi/multi_price`

## Accessible On Lite And Starter

### Price And OHLCV

- `/defi/price`
- `/defi/multi_price`
- `/defi/history_price`
- `/defi/historical_price_unix`
- `/defi/price_volume/single`
- `/defi/price_volume/multi`
- `/defi/ohlcv`
- `/defi/ohlcv/pair`
- `/defi/ohlcv/base_quote`
- `/defi/v3/ohlcv`
- `/defi/v3/ohlcv/pair`

### Token And Market Reads

- `/defi/token_overview`
- `/defi/v3/token/market-data`
- `/defi/v3/token/meta-data/single`
- `/defi/v3/token/trade-data/single`
- `/defi/v3/price/stats/single`
- `/defi/v3/token/exit-liquidity`
- `/defi/v3/token/list`
- `/defi/v2/markets`
- `/defi/v2/tokens/new_listing`
- `/defi/tokenlist`
- `/defi/token_creation_info`
- `/defi/token_trending`
- `/defi/token_security`
- `/defi/v3/search`

### Trades And Transaction Feeds

- `/defi/txs/token`
- `/defi/txs/token/seek_by_time`
- `/defi/txs/pair`
- `/defi/txs/pair/seek_by_time`
- `/defi/v3/txs`
- `/defi/v3/txs/recent`
- `/defi/v3/token/txs`
- `/defi/v3/token/txs-by-volume`
- `/defi/v3/token/mint-burn-txs`
- `/trader/txs/seek_by_time`
- `/trader/gainers-losers`
- `/defi/v3/all-time/trades/single`
- `/defi/v3/txs/latest-block`

### Wallet And Holder Reads

- `/wallet/v2/net-worth`
- `/wallet/v2/current-net-worth`
- `/wallet/v2/net-worth-details`
- `/wallet/v2/pnl`
- `/wallet/v2/pnl/details`
- `/wallet/v2/pnl/summary`
- `/v1/wallet/simulate`
- `/wallet/tx_list`
- `/v1/wallet/tx_list`
- `/v1/wallet/token_list`
- `/v1/wallet/token_balance`
- `/wallet/v2/token-balance`
- `/wallet/v2/balance-change`
- `/wallet/v2/tx/first-funded`
- `/v1/wallet/list_supported_chain`
- `/holder/v1/distribution`
- `/defi/v3/token/holder`
- `/defi/v2/tokens/top_traders`

### Transfers And Utility

- `/token/v1/transfer`
- `/token/v1/transfer/total`
- `/wallet/v2/transfer`
- `/wallet/v2/transfer/total`
- `/defi/networks`
- `/utils/v1/credits`
- `/defi/v3/token/meme/detail/single`
- `/defi/v3/token/meme/list`

## Not Available On Lite And Starter

Batch and multi-resource endpoints you should treat as unavailable:

- `/defi/v3/pair/overview/multiple`
- `/defi/v3/token/market-data/multiple`
- `/defi/v3/token/meta-data/multiple`
- `/defi/v3/token/trade-data/multiple`
- `/defi/v3/price/stats/multiple`
- `/defi/v3/token/exit-liquidity/multiple`
- `/defi/v3/token/list/scroll`
- `/defi/v2/tokens/all`
- `/wallet/v2/net-worth-summary/multiple`
- `/wallet/v2/pnl/multiple`
- `/token/v1/holder/batch`
- `/defi/v3/all-time/trades/multiple`

WebSockets are also out of scope for Lite and Starter.

## Important Caveats

- wallet APIs are in beta
- wallet APIs have a low shared limit: `5 rps` and `75 rpm`
- Lite and Starter only get one meaningful multi-token exception: `/defi/multi_price`
- max monthly usage can reach 5x included CU if renewal settings allow it; after that, account suspension becomes the problem

## Practical Planning Notes

If you are building around Lite or Starter:

- prefer single-resource endpoints unless `/defi/multi_price` clearly fits
- budget carefully for wallet and history reads
- do not architect around WebSockets
- if your design needs many multi-token or multi-wallet endpoints, you are already in Business territory
