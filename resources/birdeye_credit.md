# Birdeye Compute Unit Cost

Reference table for Birdeye compute-unit pricing. Costs can change without notice, so treat this as a working snapshot, not a billing contract.

## REST API Costs

| API Name | Endpoint | Cost (CUs) |
| --- | --- | --- |
| [Supported networks](https://docs.birdeye.so/reference/get-defi-networks#/) | `/defi/networks` | 1 |
| [Token Price](https://docs.birdeye.so/reference/get-defi-price#/) | `/defi/price` | 10 |
| [Price - Multiple](https://docs.birdeye.so/reference/get-defi-multi_price#/) | `/defi/multi_price` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Price - Historical](https://docs.birdeye.so/reference/get-defi-history_price#/) | `/defi/history_price` | 60 |
| [Price - Historical Unix](https://docs.birdeye.so/reference/get-defi-historical_price_unix#/) | `/defi/historical_price_unix` | 10 |
| [Price - Volume (Single)](https://docs.birdeye.so/reference/get-defi-price_volume-single#/) | `/defi/price_volume/single` | 15 |
| [Price - Volume (Multiple)](https://docs.birdeye.so/reference/post-defi-price_volume-multi#/) | `/defi/price_volume/multi` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Trades - Token](https://docs.birdeye.so/reference/get-defi-txs-token#/) | `/defi/txs/token` | 10 |
| [Trades - Token - Seek by time](https://docs.birdeye.so/reference/get-defi-txs-token-seek_by_time#/) | `/defi/txs/token/seek_by_time` | 15 |
| [Trades - Pair](https://docs.birdeye.so/reference/get-defi-txs-pair#/) | `/defi/txs/pair` | 10 |
| [Trades - Pair - Seek by time](https://docs.birdeye.so/reference/get-defi-txs-pair-seek_by_time#/) | `/defi/txs/pair/seek_by_time` | 15 |
| [Trades - Recent (V3)](https://docs.birdeye.so/reference/get-defi-v3-txs-recent#/) | `/defi/v3/txs/recent` | [See dynamic CU model](https://docs.birdeye.so/docs/dynamic-cu-cost#/recent-txs) |
| [OHLCV](https://docs.birdeye.so/reference/get-defi-ohlcv#/) | `/defi/ohlcv` | 40 |
| [OHLCV - Pair](https://docs.birdeye.so/reference/get-defi-ohlcv-pair#/) | `/defi/ohlcv/pair` | 40 |
| [OHLCV - Base/Quote](https://docs.birdeye.so/reference/get-defi-ohlcv-base_quote#/) | `/defi/ohlcv/base_quote` | 40 |
| [OHLCV V3](https://docs.birdeye.so/reference/get-defi-v3-ohlcv#/) | `/defi/v3/ohlcv` | [See dynamic CU model](https://docs.birdeye.so/docs/dynamic-cu-cost#/) |
| [OHLCV V3 - Pair](https://docs.birdeye.so/reference/get-defi-v3-ohlcv-pair#/) | `/defi/v3/ohlcv/pair` | [See dynamic CU model](https://docs.birdeye.so/docs/dynamic-cu-cost#/) |
| [Token - List](https://docs.birdeye.so/reference/get-defi-tokenlist#/) | `/defi/tokenlist` | 30 |
| [Token - List V3](https://docs.birdeye.so/reference/get-defi-v3-token-list#/) | `/defi/v3/token/list` | 100 |
| [Token - List V3 (scroll)](https://docs.birdeye.so/reference/get-defi-v3-token-list-scroll#/) | `/defi/v3/token/list/scroll` | 500 |
| [Token - New Listing](https://docs.birdeye.so/reference/get-defi-v2-tokens-new_listing#/) | `/defi/v2/tokens/new_listing` | 80 |
| [Token - Security](https://docs.birdeye.so/reference/get-defi-token_security#/) | `/defi/token_security` | 50 |
| [Token - Exit Liquidity (Single)](https://docs.birdeye.so/reference/get-defi-v3-token-exit-liquidity#/) | `/defi/v3/token/exit-liquidity` | 30 |
| [Token - Exit Liquidity (Multiple)](https://docs.birdeye.so/reference/get-defi-v3-token-exit-liquidity-multiple#/) | `/defi/v3/token/exit-liquidity/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Defi - Trending tokens](https://docs.birdeye.so/reference/get-defi-token_trending#/) | `/defi/token_trending` | 50 |
| [Token - Overview](https://docs.birdeye.so/reference/get-defi-token_overview#/) | `/defi/token_overview` | 30 |
| [Defi - Market List](https://docs.birdeye.so/reference/get-defi-v2-markets#/) | `/defi/v2/markets` | 50 |
| [Token - Creation Info](https://docs.birdeye.so/reference/get-defi-token_creation_info#/) | `/defi/token_creation_info` | 80 |
| [Token - Top traders](https://docs.birdeye.so/reference/get-defi-v2-tokens-top_traders#/) | `/defi/v2/tokens/top_traders` | 30 |
| [Token - Meta Data (Single)](https://docs.birdeye.so/reference/get-defi-v3-token-meta-data-single#/) | `/defi/v3/token/meta-data/single` | 5 |
| [Token - Meta Data (Multiple)](https://docs.birdeye.so/reference/get-defi-v3-token-meta-data-multiple#/) | `/defi/v3/token/meta-data/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Token - Market Data (Single)](https://docs.birdeye.so/reference/get-defi-v3-token-market-data#/) | `/defi/v3/token/market-data` | 15 |
| [Token - Market Data (Multiple)](https://docs.birdeye.so/reference/get-defi-v3-token-market-data-multiple#/) | `/defi/v3/token/market-data/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Token - Trade Data (Single)](https://docs.birdeye.so/reference/get-defi-v3-token-trade-data-single#/) | `/defi/v3/token/trade-data/single` | 15 |
| [Token - Trade Data (Multiple)](https://docs.birdeye.so/reference/get-defi-v3-token-trade-data-multiple#/) | `/defi/v3/token/trade-data/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Token - Holder List](https://docs.birdeye.so/reference/get-defi-v3-token-holder#/) | `/defi/v3/token/holder` | 50 |
| [Token - Holder List (Batch)](https://docs.birdeye.so/reference/post-token-v1-holder-batch#/) | `/token/v1/holder/batch` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Meme Token - List](https://docs.birdeye.so/reference/get-defi-v3-token-meme-list#/) | `/defi/v3/token/meme/list` | 100 |
| [Meme Token Detail - Single](https://docs.birdeye.so/reference/get-defi-v3-token-meme-detail-single#/) | `/defi/v3/token/meme/detail/single` | 30 |
| [Trader - Top Gainer Losers](https://docs.birdeye.so/reference/get-trader-gainers-losers#/) | `/trader/gainers-losers` | 30 |
| [Trader - Seek by Time](https://docs.birdeye.so/reference/get-trader-txs-seek_by_time#/) | `/trader/txs/seek_by_time` | 15 |
| [Search](https://docs.birdeye.so/reference/get-defi-v3-search#/) | `/defi/v3/search` | 50 |
| [Pair - Overview - Single](https://docs.birdeye.so/reference/get-defi-v3-pair-overview-single#/) | `/defi/v3/pair/overview/single` | 20 |
| [Pair - Overview - Multiple](https://docs.birdeye.so/reference/get-defi-v3-pair-overview-multiple#/) | `/defi/v3/pair/overview/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Price stats - Single](https://docs.birdeye.so/reference/get-defi-v3-price-stats-single#/) | `/defi/v3/price/stats/single` | 20 |
| [Price stats - Multiple](https://docs.birdeye.so/reference/post-defi-v3-price-stats-multiple#/) | `/defi/v3/price/stats/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Wallet - Supported Networks](https://docs.birdeye.so/reference/get-v1-wallet-list_supported_chain#/) | `/v1/wallet/list_supported_chain` | 1 |
| [Wallet Portfolio](https://docs.birdeye.so/reference/get-v1-wallet-token_list#/) | `/v1/wallet/token_list` | 100 |
| [Wallet - Token Balance](https://docs.birdeye.so/reference/get-v1-wallet-token_balance#/) | `/v1/wallet/token_balance` | 5 |
| [Wallet Transaction History](https://docs.birdeye.so/reference/get-v1-wallet-tx_list#/) | `/v1/wallet/tx_list` | 150 |
| [Wallet Balance Change](https://docs.birdeye.so/reference/get-wallet-v2-balance-change#/) | `/wallet/v2/balance-change` | 20 |
| [Wallet - Current Net Worth](https://docs.birdeye.so/reference/get-wallet-v2-current-net-worth#/) | `/wallet/v2/current-net-worth` | 100 |
| [Wallet - Net Worth](https://docs.birdeye.so/reference/get-wallet-v2-net-worth) | `/wallet/v2/net-worth` | 60 |
| [Wallet - Net Worth Details](https://docs.birdeye.so/reference/get-wallet-v2-net-worth-details) | `/wallet/v2/net-worth-details` | 60 |
| [Wallet - PnL](https://docs.birdeye.so/reference/get-wallet-v2-pnl#/) | `/wallet/v2/pnl` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Trades - All (V3)](https://docs.birdeye.so/reference/get-defi-v3-txs#/) | `/defi/v3/txs` | 25 |
| [Trades - Token (V3)](https://docs.birdeye.so/reference/get-defi-v3-token-txs#/) | `/defi/v3/token/txs` | 20 |
| [Token - Mint/Burn](https://docs.birdeye.so/reference/get-defi-v3-token-mint-burn-txs#/) | `/defi/v3/token/mint-burn-txs` | 50 |
| [All Time Trades (Single)](https://docs.birdeye.so/reference/get-defi-v3-all-time-trades-single#/) | `/defi/v3/all-time/trades/single` | 25 |
| [All Time Trades (Multiple)](https://docs.birdeye.so/reference/post-defi-v3-all-time-trades-multiple#/) | `/defi/v3/all-time/trades/multiple` | [See batch CU cost](https://docs.birdeye.so/docs/batch-token-cu-cost#/) |
| [Trades - Latest Block Number](https://docs.birdeye.so/reference/get-defi-v3-txs-latest-block#/) | `/defi/v3/txs/latest-block` | 5 |

## Note

Compute costs are subject to change at any time without prior notice.
