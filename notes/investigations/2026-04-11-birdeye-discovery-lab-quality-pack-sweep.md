---
type: investigation
status: open
area: providers/research
date: 2026-04-13
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.json
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/services/discovery-lab-workspace-packs.ts
  - trading_bot/backend/src/services/discovery-lab-created-packs.ts
graph_checked: 2026-04-12
next_action: Treat the reladdered discovery-lab packs and their refreshed per-pack strategy ladders as the current baseline, and only retune the bands if a later live window collapses the spread or the source mix shifts materially.
---

# Investigation - Birdeye Discovery Lab Quality Pack Sweep

## Trigger

The desk wanted a faster way to test Birdeye `meme/list` filter combinations and find which source-plus-filter shapes produce the best quality graduation-play candidates, not just the biggest raw list.

## Current Pack Baseline

- The non-control discovery-lab packs are now owned as full ladders, not just threshold shells.
- The created-pack catalog is now scalp-only and early-graduated, with five focused strategies:
  `created-early-grad-scalp-tape-surge`
  `created-early-grad-scalp-buyer-stack`
  `created-early-grad-scalp-liquidity-ramp`
  `created-early-grad-scalp-momentum-retest`
  `created-early-grad-scalp-quality-guard`
- These five created scalp packs are now explicitly lower-cap biased in both places:
  pack-level `maxMarketCapUsd` ceilings tightened to `900k -> 1.8m`
  recipe-level `max_market_cap` ladders staged from `220k` through `1.2m`
- `scalp-tape-structure` remains the retained control pack and is intentionally unchanged.
- Recent-run evidence favored early scalp packs:
  `scalp-tape-structure` had winners
  the recent non-scalp inline tests (`Created - Grad <5k Cap Moonshot`, `Created - Grad 10k-25k Structured`, `Created - Grad 25k-50k Quality`) returned `0` winners
- All active created scalp recipes remain within the Birdeye 5-filter provider ceiling.

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

### Default-pack multi-source rerun on 2026-04-13

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --profile high-value \
  --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve \
  --cache-ttl-seconds 0 \
  --out ../../.codex/tmp/discovery-lab-2026-04-13.json
```

Result:

- `pump_dot_fun` was still the only source with real pass-grade quality:
  `8` passes across `4` unique names:
  `TT`
  `Reaper`
  `DJT`
  `IRT`
- `moonshot` returned `0` names
- `raydium_launchlab` returned `2` names and `0` passes
- `meteora_dynamic_bonding_curve` returned `19` names and `0` passes

Best default-pack recipes in this rerun:

- `pump_dot_fun / grad_4h_liquidity`
  best overall winner:
  `4` passes from `8` returned names
  average good play score about `0.835`
- `pump_dot_fun / grad_60m_last_trade`
  best average-score tie:
  `2` passes
  average good play score about `0.841`
- `pump_dot_fun / grad_60m_graduated_time`
  matched the `60m_last_trade` result exactly in this window:
  `2` passes
  average good play score about `0.841`

Dominant reject reasons in this rerun:

- `pump_dot_fun`
  weak `5m` flow and concentration failures still dominated the miss set
- `meteora_dynamic_bonding_curve`
  mostly failed on:
  `liquidity far below floor`
  `market cap far above high-value ceiling`
  `holder count far below floor`
- `raydium_launchlab`
  both names failed on weak `5m` flow

### Sub-10m default-pack refresh on 2026-04-13

What changed:

- the default lab pack now dropped the stale multi-hour and pregrad default shapes
- the default pack is now five pump-first graduated recipes only:
  `grad_5m_last_trade`
  `grad_5m_graduated_time`
  `grad_5_10m_last_trade`
  `grad_5_10m_trade5m`
  `grad_5_10m_liquidity`
- each recipe now uses an explicit `max_graduated_time` bound so the pack can target:
  `0-5m`
  `5-10m`
- the winners CSV header was clarified from a vague holder label to:
  `top10_holder_percent`
- Helius mint authority and holder concentration are now batch-fetched once per unique uncached mint and reused across recipes instead of repeating one Helius pass per recipe winner

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --profile high-value \
  --cache-ttl-seconds 0 \
  --out ../../.codex/tmp/discovery-lab-sub10m-2026-04-13.json
```

Result:

- all five recipes returned `0` names in this sampled window
- Birdeye direct probes confirmed that was real market silence, not a broken `max_graduated_time` filter:
  `pump_dot_fun` had `0` graduates in:
  `0-5m`
  `5-10m`
  and even the broader `last 10m` probe
- the pack is valid and cheap now, but it needs a hotter window before it can displace the wider quality or fast-turn packs as the default research surface

### Balanced small-ticket proxy calibration on 2026-04-13

Why this existed:

- the sub-10m pack had no raw pump graduates in the sampled window
- a wider proxy sweep was needed to tune a small-ticket fast-turn grading lens instead of blindly loosening the fresh-graduate pack

Command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes scripts/discovery-lab.recipes.fast-turn.json \
  --recipe-names grad_30m_volume5m,grad_45m_live_tape,grad_60m_trade5m \
  --profile high-value \
  --min-liquidity-usd 8000 \
  --max-market-cap-usd 2000000 \
  --min-holders 35 \
  --min-volume-5m-usd 1500 \
  --min-unique-buyers-5m 12 \
  --min-buy-sell-ratio 1.05 \
  --max-top10-holder-percent 45 \
  --max-single-holder-percent 25 \
  --max-negative-price-change-5m-percent 18 \
  --query-concurrency 1 \
  --deep-concurrency 2 \
  --out ../../.codex/tmp/discovery-lab-calib-balanced.json
```

Result:

- the proxy calibration produced `5` pass-grade names:
  `the great pardoning`
  `NO RACIST`
  `Bitcoin Bull`
  `All Aboard`
  `THE ANTICHRIST`
- best current proxy winner:
  `the great pardoning`
  about `0.893` play score
  passed all three proxy recipes
- proxy recipe quality stayed tight enough that the wider thresholds did not collapse into obvious junk:
  `grad_30m_volume5m`
  `2/2` good
  `grad_45m_live_tape`
  `3/3` good
  `grad_60m_trade5m`
  `5/5` good

Interpretation:

- for `$10-15` tickets and a very short hold target, the first useful threshold candidate is looser than the old high-value pack but still materially stricter than junk-chasing:
  `minLiquidityUsd=8000`
  `maxMarketCapUsd=2000000`
  `minHolders=35`
  `minVolume5mUsd=1500`
  `minUniqueBuyers5m=12`
  `minBuySellRatio=1.05`
  `maxTop10HolderPercent=45`
  `maxSingleHolderPercent=25`
- when the true fresh-graduate band is empty, use the nearest live proxy shapes to tune thresholds before rewriting the sub-10m pack again

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
- the new sub-10m default pack can legitimately return zero because the raw pump graduate band is sometimes empty, not because the recipe itself is broken
- the first viable small-ticket fast-turn threshold candidate is the balanced proxy lens above, not the much stricter legacy high-value grading floor

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
- if the `0-10m` graduate band is empty, do not blindly weaken structure controls; use the `30m/45m/60m` proxy trio to calibrate the next threshold move
- keep the non-control packs laddered across micro-scalp, fresh burst, structured trend, late quality, and late migration bands so they continue to probe varied PnL ranges instead of collapsing into one middle profile

## Current Pack Ladder

- `Scalp tape + structure` stays unchanged as the retained control.
- `Workspace - Micro Burst Probe` tracks the validated balanced proxy scalp lens and owns the micro-scalp band.
- `Created - Fresh Burst Ladder` and `Workspace - Structured Trend Ramp` cover the middle continuation bands with tighter spacing between their threshold overrides.
- `Created - Late Expansion Quality` and `Workspace - Late Migration Pressure` own the higher-band end of the ladder with stricter structure and concentration gates so they do not overlap as much.
- `created-late-expansion-quality` now defaults to `high-value`.

## Linked Notes

- [`../runbooks/2026-04-11-birdeye-discovery-lab.md`](../runbooks/2026-04-11-birdeye-discovery-lab.md)
- [`../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md`](../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md)
- [`../trading-memory/providers/index.md`](../trading-memory/providers/index.md)
