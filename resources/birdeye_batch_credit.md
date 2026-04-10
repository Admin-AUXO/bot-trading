# Birdeye Batch CU Cost

Batch-cost notes for Birdeye, trimmed for Lite and Starter use.

## Core Formula

Batch CU cost is:

`ceil(N^0.8 × base_cu_cost)`

Where:

- `N` is the number of tokens in the batch request
- `base_cu_cost` is the batch endpoint's base CU cost
- the final result is rounded up to a whole number

## Example

For `/defi/multi_price` with base cost `5` and `N = 10`:

`ceil(10^0.8 × 5) = 32`

The upstream page shows the same idea, even if its worked example is written badly.

## What Matters For Lite And Starter

Lite and Starter can use:

- `/defi/multi_price`

Lite and Starter cannot use the other multi-token batch endpoints documented below. Those are effectively Business-only for planning purposes.

## Lite/Starter Batch Endpoint

| Endpoint | Base CU Cost | Max Tokens |
| --- | --- | --- |
| [`/defi/multi_price`](https://docs.birdeye.so/reference/get-defi-multi_price#/) | 5 | 100 |

## Business-Only Batch Endpoints

These exist, but they are not useful for Lite or Starter planning:

- `/defi/price_volume/multi`
- `/defi/v3/token/meta-data/multiple`
- `/defi/v3/token/trade-data/multiple`
- `/defi/v3/token/market-data/multiple`
- `/defi/v3/pair/overview/multiple`
- `/defi/v3/all-time/trades/multiple`
- `/defi/v3/token/exit-liquidity/multiple`
- `/defi/v3/price/stats/multiple`
- `/token/v1/holder/batch`
- `/wallet/v2/pnl/multiple`
- `/wallet/v2/net-worth-summary/multiple`

## Practical Rule

If you stay on Lite or Starter:

- use `/defi/multi_price` when you need batch price reads
- assume the rest of the batch story is unavailable
- check [birdeye_credit.md](./birdeye_credit.md) for per-endpoint CU costs
- check [birdeye_data_access.md](./birdeye_data_access.md) for plan access limits
