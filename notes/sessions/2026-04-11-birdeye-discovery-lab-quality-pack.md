---
type: session
status: open
area: providers/research
date: 2026-04-11
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.json
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
  - trading_bot/backend/src/services/runtime-config.ts
graph_checked: 2026-04-11
next_action: Re-run the fast-turn pack in another live market window before promoting its winner or loosening any live concentration guard.
---

# Session - Birdeye Discovery Lab Quality Pack

## Context

The desk wanted faster repeated Birdeye `meme/list` testing and a concrete answer to:

- which filter combinations surface the best graduation-play candidates
- which sources are worth discovery CU
- whether quality improves more from better query shape or from looser grading thresholds

## What Changed

- added the reusable lab runner:
  [`trading_bot/backend/scripts/discovery-lab.ts`](../../../trading_bot/backend/scripts/discovery-lab.ts)
- added the default recipe pack:
  [`trading_bot/backend/scripts/discovery-lab.recipes.json`](../../../trading_bot/backend/scripts/discovery-lab.recipes.json)
- added the second quality-biased recipe pack:
  [`trading_bot/backend/scripts/discovery-lab.recipes.quality.json`](../../../trading_bot/backend/scripts/discovery-lab.recipes.quality.json)
- added threshold overrides for research sweeps
- fixed the cache to store raw provider research instead of stale grading decisions
- added Birdeye retry/backoff for `429` bursts
- fixed a pre-existing Prisma JSON typing issue in:
  [`trading_bot/backend/src/services/runtime-config.ts`](../../../trading_bot/backend/src/services/runtime-config.ts)

## Reports Produced

- baseline full sweep:
  `/tmp/discovery-lab-full-retry.json`
- widened default-pack sweep:
  `/tmp/discovery-lab-widened.json`
- quality-pack sweep:
  `/tmp/discovery-lab-quality-pack.json`
- quality-pack sweep with `10k` liquidity floor:
  `/tmp/discovery-lab-quality-pack-liq10k.json`
- fast-turn balanced sweep:
  `/tmp/discovery-lab-fast-turn-balanced.json`
- fast-turn slightly looser sweep:
  `/tmp/discovery-lab-fast-turn-lenient.json`

## Current Best Answers

### Best source in this window

- `pump_dot_fun`

### Best quality recipe in this window

- `grad_4h_volume1h`
  best overall quality once research thresholds were widened enough to answer the high-value question instead of the live runtime question

### Best efficient recipe in this window

- `grad_4h_holder_liquidity`

### Best short-window recipe in this window

- `grad_60m_trade5m`

### Sources to deprioritize for now

- `moonshot`
- `raydium_launchlab`
- `meteora_dynamic_bonding_curve`

Meteora still produced candidates, but not pass-grade ones in this sampled window.

## Best Names Surfaced

- `bunbun`
  passed under `pump_dot_fun / grad_4h_volume1h`
  grade `A-`
- `PND`
  passed under:
  `pump_dot_fun / grad_4h_volume1h`
  `pump_dot_fun / grad_4h_holder_liquidity`
  grade `B+`

## Near-Miss Notes Worth Rechecking Later

- `Theitle`
  strongest raw quality score, but repeated concentration failure
- `(F)art`
  strong tape, failed largest-holder concentration
- `Luna`
  looked alive, failed post-grad dump protection

## Open Questions

- Was this just a pump-heavy market window, or is `pump_dot_fun` genuinely the only discovery lane worth default CU for the desk now?
- Does Meteora improve in a calmer tape if the desk samples another session rather than the same intraday churn?
- Should the runtime discovery path eventually get a quality-pack mode, or should this remain a research-only tool?

## 2026-04-11 Fast-Turn Follow-Up

The desk then reframed the question around the actual bankroll:

- max capital `100 USD`
- ticket size `10` to `20 USD`
- max `3` positions
- average hold under `5` to `10` minutes

That led to a third recipe pack:
[`trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json`](../../../trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json)

### Threshold Comparison

Balanced fast-turn grading:

- `minLiquidityUsd=10000`
- `maxMarketCapUsd=5000000`
- `minHolders=40`
- `minVolume5mUsd=2000`
- `minUniqueBuyers5m=18`
- `minBuySellRatio=1.08`
- `maxTop10HolderPercent=42`
- `maxSingleHolderPercent=22`

Slightly looser grading:

- `minLiquidityUsd=8000`
- `maxMarketCapUsd=7000000`
- `minHolders=35`
- `minVolume5mUsd=1500`
- `minUniqueBuyers5m=15`
- `minBuySellRatio=1.05`
- `maxTop10HolderPercent=45`
- `maxSingleHolderPercent=25`

### What Actually Happened

- both profiles produced the same single pass-grade name:
  `pump_dot_fun / grad_4h_holder_liquidity / emi`
- balanced score:
  `B+`
  about `0.777`
- slightly looser score:
  `B+`
  about `0.793`
- no second pass-grade candidate appeared under the looser profile

### Current Read

- the fast-turn pack confirmed `pump_dot_fun` again
- the best actionable fast-turn recipe in this sample was:
  `grad_4h_holder_liquidity`
- `grad_90m_volume1h_holder` surfaced interesting names, but too many were still structural rejects
- slightly looser thresholds did not improve the real candidate set; they mostly made rejected names look better on paper

## Linked Notes

- [`../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md`](../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md)
- [`../runbooks/2026-04-11-birdeye-discovery-lab.md`](../runbooks/2026-04-11-birdeye-discovery-lab.md)
- [`../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md`](../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md)
