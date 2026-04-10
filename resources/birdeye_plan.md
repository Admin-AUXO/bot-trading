# Birdeye Lite vs Starter

Pricing summary trimmed for the only plans that matter here.

## Plan Snapshot

| Plan | Monthly Price | Included CUs | Rate Limit | Overage per 1M CUs |
| --- | --- | --- | --- | --- |
| Lite | $39 | 1,500,000 | 15 rps | $23 |
| Starter | $99 | 5,000,000 | 15 rps | $19.9 |

## Recommendation Frame

Choose Lite if:

- you are validating a workflow
- you mainly need price, OHLCV, token discovery, and a modest amount of wallet or tx reads
- you can stay disciplined about CU-heavy endpoints

Choose Starter if:

- you expect sustained polling or broader token scans
- you want more headroom for historical and wallet-heavy work
- you want lower overage pain if usage spikes

## Cost Formula

Monthly cost is:

`base_price + ((total_cus - included_cus) / 1_000_000) × overage_price`

That means:

- Lite gets cheaper entry but more expensive overages
- Starter costs more upfront but gives more CU headroom and cheaper overages

## What You Do Not Get On Lite Or Starter

Do not plan around these on Lite or Starter:

- most batch and multi endpoints beyond `/defi/multi_price`
- WebSockets
- Business-only multi-wallet and multi-token endpoints

Use [birdeye_data_access.md](./birdeye_data_access.md) for the exact access boundary.

## Practical Take

For a Solana trading bot workflow:

- Lite is enough for initial discovery and evaluation
- Starter is safer if you expect real iteration speed, frequent refreshes, or wider candidate scans
- if you need WebSockets or heavy batch workflows, you are already outside the Lite/Starter envelope
