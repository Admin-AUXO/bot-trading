---
type: trading-memory
status: active
area: trading/providers
date: 2026-04-11
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
graph_checked: 2026-04-11
next_action: Re-run the fast-turn pack in another live window before promoting its winner into any runtime discovery preset.
---

# Trading Memory - Birdeye Quality Pack Source Ranking

## What Was Tested

The repo ran a quality-biased Birdeye `meme/list` recipe pack across:

- `pump_dot_fun`
- `moonshot`
- `raydium_launchlab`
- `meteora_dynamic_bonding_curve`

The pack used source-specific queries and stayed inside Birdeye's five-filter ceiling by preferring tape-strength filters over extra recency gates.

## Durable Findings

- `pump_dot_fun` is the only source that consistently produced pass-grade quality candidates in this research window
- `moonshot` returned `0` names across the full quality pack in this window
- `raydium_launchlab` returned `0` names across the full quality pack in this window
- `meteora_dynamic_bonding_curve` returned names, but they remained structurally weak for the desk's graduation-play standard

## Best Recipe Shapes In This Window

For `pump_dot_fun` graduates:

- `grad_4h_volume1h`
  best quality mix
  surfaced `bunbun` and `PND` as pass-grade names once the research liquidity floor was relaxed to `10k`
- `grad_4h_holder_liquidity`
  best efficiency per CU
  narrower recall, but high signal
- `grad_60m_trade5m`
  best short-window quality for active tape
  good when the desk wants fresher churn instead of a wider four-hour catch

## Source-Specific Read

### `pump_dot_fun`

- quality improves when the query stops sorting only by time and starts sorting by:
  `volume_1h_usd`
  `liquidity`
  `trade_5m_count`
- pure recency is not enough; the best near-misses still failed on concentration or post-grad fade
- the research sweep produced pass-grade names only after lowering the grading floor to:
  `minLiquidityUsd=10000`
  `minHolders=50`
  `minVolume5mUsd=2500`
  `minUniqueBuyers5m=20`
  `minBuySellRatio=1.15`
  `maxTop10HolderPercent=40`
  `maxSingleHolderPercent=20`

### `meteora_dynamic_bonding_curve`

- the source can return high-attention names, but the dominant failure mode in this window was still weak executable liquidity
- lowering the research liquidity floor from `20k` to `10k` did not produce any pass-grade Meteora names
- the most common blockers were:
  `liquidity far below floor`
  `holder count far below floor`

### `moonshot` and `raydium_launchlab`

- both were effectively dead zones in this sampled window
- do not spend discovery CU on them by default unless the desk sees a regime shift or launch activity increase

## Watchouts

- The strongest raw-quality near-miss was `Theitle`, but it repeatedly failed on concentration:
  `top10 concentration far too high`
- `(F)art` also screened well on tape, but failed on largest-holder concentration
- If a name looks good in the query summary but fails the deep grade, read the reject reason before blaming the recipe

## 2026-04-11 Fast-Turn Follow-Up

The desk then tested a bankroll-sized fast-turn pack for:

- max capital `100 USD`
- ticket size `10` to `20 USD`
- max `3` positions
- average hold under `5` to `10` minutes

Two research threshold sets were compared:

- balanced:
  `minLiquidityUsd=10000`
  `maxMarketCapUsd=5000000`
  `minHolders=40`
  `minVolume5mUsd=2000`
  `minUniqueBuyers5m=18`
  `minBuySellRatio=1.08`
  `maxTop10HolderPercent=42`
  `maxSingleHolderPercent=22`
- slightly looser:
  `minLiquidityUsd=8000`
  `maxMarketCapUsd=7000000`
  `minHolders=35`
  `minVolume5mUsd=1500`
  `minUniqueBuyers5m=15`
  `minBuySellRatio=1.05`
  `maxTop10HolderPercent=45`
  `maxSingleHolderPercent=25`

Durable result:

- both profiles produced the **same** single pass-grade name:
  `pump_dot_fun / grad_4h_holder_liquidity / emi`
- the looser profile did not add a second real pass
- it only pushed already-rejected names like `Theitle`, `Google AI`, and `BTCO` to even higher raw scores

Reuse rule for the fast-turn pack:

- keep `pump_dot_fun` as the only serious live source for now
- use `grad_4h_holder_liquidity` as the first fast-turn research shape to re-check
- do not loosen concentration controls just because the raw score looks attractive
- treat Meteora fast-turn scores as suspicious until a later window produces an actual pass-grade candidate

## Reuse Rule

- for pump-biased graduation scans, prefer the quality pack over the default pack when the desk cares more about quality than raw throughput
- keep Meteora as a secondary research lane, not a primary execution lane, until a later window shows actual pass-grade names
- treat `moonshot` and `raydium_launchlab` as opt-in sources, not default sources, unless later sweeps prove otherwise

## Linked Notes

- [`2026-04-11-birdeye-discovery-endpoint-selection.md`](2026-04-11-birdeye-discovery-endpoint-selection.md)
- [`../../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md`](../../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md)
- [`../../runbooks/2026-04-11-birdeye-discovery-lab.md`](../../runbooks/2026-04-11-birdeye-discovery-lab.md)
