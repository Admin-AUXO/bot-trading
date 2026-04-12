---
type: investigation
status: open
area: providers/research
date: 2026-04-12
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.json
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
  - trading_bot/backend/src/services/runtime-config.ts
graph_checked: 2026-04-12
next_action: Re-test the refreshed pump-only packs in another live window and see whether `grad_75m_price30m_strength` keeps pace with `grad_4h_volume1h`, `grad_4h_holder_liquidity`, and `grad_60m_trade5m` once the window is less forgiving.
---

# Investigation - Birdeye Discovery Lab Quality Pack Sweep

## Trigger

The desk wanted a faster way to test Birdeye `meme/list` filter combinations and find which source-plus-filter shapes produce the best quality graduation-play candidates, not just the biggest raw list.

## What Changed

- added a reusable lab runner:
  [`trading_bot/backend/scripts/discovery-lab.ts`](../../../trading_bot/backend/scripts/discovery-lab.ts)
- added a default recipe pack:
  [`trading_bot/backend/scripts/discovery-lab.recipes.json`](../../../trading_bot/backend/scripts/discovery-lab.recipes.json)
- added a second quality-biased recipe pack:
  [`trading_bot/backend/scripts/discovery-lab.recipes.quality.json`](../../../trading_bot/backend/scripts/discovery-lab.recipes.quality.json)
- added threshold overrides for research-only sweeps
- fixed the lab cache so it stores raw provider research, not old grading decisions
- added Birdeye retry/backoff for `429` bursts
- added quality summaries for near-miss queries when `goodCount=0`
- fixed source-level `uniqueGoodTokens` so it counts the full set of passing mints instead of only the printed top-five winners

## Recipe Packs Tested

### Baseline pack

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --profile high-value \
  --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve \
  --out ../../.codex/tmp/discovery-lab-full-retry.json
```

Result:

- `0` pass-grade tokens across all four sources
- `pump_dot_fun` had the most recall, but not enough quality
- `moonshot` and `raydium_launchlab` were effectively empty
- `meteora_dynamic_bonding_curve` returned names, but they were mostly too weak to trade under the high-value grading bar

Dominant reject reasons:

- `market cap far above high-value ceiling`
- `5m volume/flow too weak`
- concentration failures
- liquidity misses

### Quality-biased second pack

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes discovery-lab.recipes.quality.json \
  --profile high-value \
  --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve \
  --max-market-cap-usd 10000000 \
  --min-holders 50 \
  --min-volume-5m-usd 2500 \
  --min-unique-buyers-5m 20 \
  --min-buy-sell-ratio 1.15 \
  --max-top10-holder-percent 40 \
  --max-single-holder-percent 20 \
  --cache-ttl-seconds 0 \
  --out ../../.codex/tmp/discovery-lab-quality-pack.json
```

Result:

- `pump_dot_fun` produced `2` pass-grade hits, both for `PND`
- `moonshot` returned `0`
- `raydium_launchlab` returned `0`
- `meteora_dynamic_bonding_curve` returned candidates but `0` pass-grade names

Best query shapes from that run:

- `pump_dot_fun / grad_4h_holder_liquidity`
  best efficiency
- `pump_dot_fun / grad_4h_volume1h`
  best quality mix among the first widened pass
- `pump_dot_fun / grad_60m_trade5m`
  strongest short-window quality

### Targeted liquidity-floor test

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes discovery-lab.recipes.quality.json \
  --profile high-value \
  --sources pump_dot_fun,meteora_dynamic_bonding_curve \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 10000000 \
  --min-holders 50 \
  --min-volume-5m-usd 2500 \
  --min-unique-buyers-5m 20 \
  --min-buy-sell-ratio 1.15 \
  --max-top10-holder-percent 40 \
  --max-single-holder-percent 20 \
  --cache-ttl-seconds 0 \
  --out ../../.codex/tmp/discovery-lab-quality-pack-liq10k.json
```

Result:

- `pump_dot_fun` improved to `4` pass-grade hits across `2` unique names:
  `bunbun`
  `PND`
- `meteora_dynamic_bonding_curve` still produced `0` pass-grade names

Best query shapes from that run:

- `pump_dot_fun / grad_4h_volume1h`
  best overall quality
  surfaced `bunbun:A-` and `PND:B+`
- `pump_dot_fun / grad_4h_holder_liquidity`
  best efficiency per CU
- `pump_dot_fun / grad_60m_trade5m`
  best short-window quality for fresher churn

### Bankroll-sized fast-turn pack

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes discovery-lab.recipes.fast-turn.json \
  --profile high-value \
  --sources pump_dot_fun,meteora_dynamic_bonding_curve \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 5000000 \
  --min-holders 40 \
  --min-volume-5m-usd 2000 \
  --min-unique-buyers-5m 18 \
  --min-buy-sell-ratio 1.08 \
  --max-top10-holder-percent 42 \
  --max-single-holder-percent 22 \
  --max-negative-price-change-5m-percent 18 \
  --cache-ttl-seconds 0 \
  --out ../../.codex/tmp/discovery-lab-fast-turn-balanced.json
```

Comparison command:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes discovery-lab.recipes.fast-turn.json \
  --profile high-value \
  --sources pump_dot_fun,meteora_dynamic_bonding_curve \
  --min-liquidity-usd 8000 \
  --max-market-cap-usd 7000000 \
  --min-holders 35 \
  --min-volume-5m-usd 1500 \
  --min-unique-buyers-5m 15 \
  --min-buy-sell-ratio 1.05 \
  --max-top10-holder-percent 45 \
  --max-single-holder-percent 25 \
  --max-negative-price-change-5m-percent 20 \
  --cache-ttl-seconds 0 \
  --out ../../.codex/tmp/discovery-lab-fast-turn-lenient.json
```

Results:

- both the balanced and slightly looser profiles produced the same single pass-grade name:
  `pump_dot_fun / grad_4h_holder_liquidity / emi`
- balanced profile:
  `emi:B+` with play score about `0.777`
- slightly looser profile:
  `emi:B+` with play score about `0.793`
- no additional pass-grade names were created by the looser profile
- Meteora still produced `0` pass-grade names despite very high raw selected scores

Key interpretation:

- loosening the thresholds did not improve the set of real candidates
- it mainly inflated the scores of names already failing on:
  `market cap far above high-value ceiling`
  `top10 concentration far too high`
  `liquidity far below floor`

Best fast-turn recipe in this sample:

- `pump_dot_fun / grad_4h_holder_liquidity`

Best fast-turn quality near-miss bucket:

- `grad_90m_volume1h_holder`
  good for surfacing interesting names, but still noisy without the later structural checks

### Fresh pump-only rerun on 2026-04-12

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes scripts/discovery-lab.recipes.quality.json \
  --profile high-value \
  --sources pump_dot_fun \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 10000000 \
  --min-holders 50 \
  --min-volume-5m-usd 2500 \
  --min-unique-buyers-5m 20 \
  --min-buy-sell-ratio 1.15 \
  --max-top10-holder-percent 40 \
  --max-single-holder-percent 20 \
  --cache-ttl-seconds 0 \
  --query-concurrency 1 \
  --deep-concurrency 3 \
  --out ../../.codex/tmp/discovery-lab-quality-pump-2026-04-12.json

npm run lab:discovery -- \
  --recipes scripts/discovery-lab.recipes.fast-turn.json \
  --profile high-value \
  --sources pump_dot_fun \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 5000000 \
  --min-holders 40 \
  --min-volume-5m-usd 2000 \
  --min-unique-buyers-5m 18 \
  --min-buy-sell-ratio 1.08 \
  --max-top10-holder-percent 42 \
  --max-single-holder-percent 22 \
  --max-negative-price-change-5m-percent 18 \
  --cache-ttl-seconds 0 \
  --query-concurrency 1 \
  --deep-concurrency 3 \
  --out ../../.codex/tmp/discovery-lab-fast-turn-pump-2026-04-12.json
```

Result:

- quality pack:
  `6` pass-grade hits across `2` unique names:
  `CHAIRTRUMP`
  `ALONSOFFICE`
- fast-turn pack:
  `8` pass-grade hits across the same `2` unique names
- no pregrad scout recipe passed in either pack
- the fresh window kept the ranking structure stable instead of overturning it

Best quality-pack recipes in this rerun:

- `pump_dot_fun / grad_4h_volume1h`
  best overall quality mix:
  `2` passes
  average good play score about `0.899`
- `pump_dot_fun / grad_60m_trade5m`
  best efficiency:
  `2` passes for about `168` estimated CU
- `pump_dot_fun / grad_4h_holder_liquidity`
  highest average selected quality, but only `1` pass in this tighter quality run

Best fast-turn recipes in this rerun:

- `pump_dot_fun / grad_4h_holder_liquidity`
  best overall fast-turn winner:
  `2` passes
  average good play score about `0.902`
- `pump_dot_fun / grad_90m_volume1h_holder`
  matched `2` passes, but lower average selected quality than the holder-liquidity shape
- `pump_dot_fun / grad_60m_trade5m`
  stayed the cheapest repeat winner with `2` passes at about `168` estimated CU

### Pack cleanup and refreshed rerun on 2026-04-12

What changed:

- built the local code graph with Graphify and confirmed the lab still lives as a self-contained script surface
- removed dead recipes from the repo packs:
  quality-pack pregrad recipes
  fast-turn pregrad scouts
  `grad_15m_trade5m`
- added two `30m` follow-up recipes to both packs:
  `grad_75m_price30m_strength`
  `grad_45m_volume30m_persistence`
- trimmed `grad_75m_price30m_strength` back under Birdeye's five-filter ceiling after the first attempt skipped with `filter ceiling exceeded (6 > 5)`

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes scripts/discovery-lab.recipes.quality.json \
  --profile high-value \
  --sources pump_dot_fun \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 10000000 \
  --min-holders 50 \
  --min-volume-5m-usd 2500 \
  --min-unique-buyers-5m 20 \
  --min-buy-sell-ratio 1.15 \
  --max-top10-holder-percent 40 \
  --max-single-holder-percent 20 \
  --cache-ttl-seconds 0 \
  --query-concurrency 1 \
  --deep-concurrency 3 \
  --out ../../.codex/tmp/discovery-lab-quality-pump-refreshed2-2026-04-12.json

npm run lab:discovery -- \
  --recipes scripts/discovery-lab.recipes.fast-turn.json \
  --profile high-value \
  --sources pump_dot_fun \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 5000000 \
  --min-holders 40 \
  --min-volume-5m-usd 2000 \
  --min-unique-buyers-5m 18 \
  --min-buy-sell-ratio 1.08 \
  --max-top10-holder-percent 42 \
  --max-single-holder-percent 22 \
  --max-negative-price-change-5m-percent 18 \
  --cache-ttl-seconds 0 \
  --query-concurrency 1 \
  --deep-concurrency 3 \
  --out ../../.codex/tmp/discovery-lab-fast-turn-pump-refreshed2-2026-04-12.json
```

Refreshed quality-pack result:

- `16` pass-grade hits across `4` unique names:
  `AF`
  `CHAIRTRUMP`
  `CohenCoin`
  `ALONSOFFICE`
- best broad-quality recipe:
  `grad_4h_volume1h`
  `4` passes
- best average-quality and efficiency recipe:
  `grad_4h_holder_liquidity`
  `3` passes from `3` returned names
- best new experimental recipe:
  `grad_75m_price30m_strength`
  matched `grad_60m_trade5m` on pass count with better average selected quality

Refreshed fast-turn result:

- `18` pass-grade hits across the same `4` unique names
- `grad_4h_holder_liquidity` stayed the best overall fast-turn shape
- `grad_75m_price30m_strength` graduated from "missing follow-up" to a real contender:
  `3` passes
  about `168` estimated CU
- `grad_45m_volume30m_persistence` stayed viable, but still noisier than the controls and the `75m` strength variant

## Findings

- sorting by tape quality beat sorting by pure recency in this sampled window
- `pump_dot_fun` is the only source that produced pass-grade quality names under the second pack
- `meteora_dynamic_bonding_curve` can surface attention, but the candidates still failed on executable liquidity or holder breadth
- lowering the research liquidity floor from `20k` to `10k` mattered for pump, but did not rescue Meteora
- `moonshot` and `raydium_launchlab` were not worth default discovery CU in this sampled window
- the fast-turn pack did not change the source ranking; it only confirmed the same pump-first conclusion
- slightly looser thresholds were not the answer in this window
- the 2026-04-12 rerun kept the recipe hierarchy mostly intact:
  `grad_4h_volume1h`, `grad_4h_holder_liquidity`, and `grad_60m_trade5m` are still the only shapes that keep showing repeat pass-grade names
- `grad_90m_volume1h_holder` earned a place as a real fast-turn contender, but not a replacement for `grad_4h_holder_liquidity`
- after pack cleanup, `grad_75m_price30m_strength` joined the repeatable winner set and now deserves to sit beside the controls in future pump-only checks
- `grad_45m_volume30m_persistence` is a legitimate secondary experiment, but not strong enough to displace the control recipes
- pregrad and ultra-short `1m`/`15m` style recipes still look like noise, not signal

## Best Near-Miss Warnings

- `Theitle`
  very strong raw quality score, but repeated concentration failure:
  `top10 concentration far too high`
- `(F)art`
  strong tape, but failed:
  `largest holder concentration far too high`
- `Luna`
  flowed well enough to rank, but failed:
  `price already dumping hard`

## Decision

- keep the baseline recipe pack for broad sanity checks
- use the second quality pack when the desk wants best-quality graduation plays instead of maximum raw recall
- use the fast-turn pack when the desk wants small-ticket sprint trades, but keep it pump-first
- prefer pump-focused quality sweeps first
- do not promote any Meteora, Moonshot, or LaunchLab discovery preference into runtime defaults based on this single window
- do not loosen concentration controls just because a looser profile makes the query summary look stronger
- for fresh pump-only checks, start with:
  `grad_4h_volume1h` for quality
  `grad_4h_holder_liquidity` for fast-turn
  `grad_60m_trade5m` for the cheapest repeatable short-window confirmation
- keep `grad_75m_price30m_strength` in the repo packs as the first experimental follow-up
- leave pregrad scouts and brittle ultra-short shapes out of the default repo packs until they earn a real pass-grade window

## Linked Notes

- [`../runbooks/2026-04-11-birdeye-discovery-lab.md`](../runbooks/2026-04-11-birdeye-discovery-lab.md)
- [`../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md`](../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md)
- [`../sessions/2026-04-11-provider-runtime-workstream-summary.md`](../sessions/2026-04-11-provider-runtime-workstream-summary.md)
