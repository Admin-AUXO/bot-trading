---
type: session
status: closed
area: providers/research
date: 2026-04-11
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.json
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
  - trading_bot/backend/src/services/runtime-config.ts
graph_checked: 2026-04-11
next_action: Re-run `discovery-lab.recipes.fast-turn.json` against a fresh pump-heavy window first; only consider a runtime preset if `pump_dot_fun / grad_4h_holder_liquidity` or a sibling recipe repeats pass-grade names across multiple windows.
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
- fixed recipe-path resolution so `--recipes` works with normal backend-relative paths instead of only script-relative guesses
- fixed a pre-existing Prisma JSON typing issue in:
  [`trading_bot/backend/src/services/runtime-config.ts`](../../../trading_bot/backend/src/services/runtime-config.ts)
- pushed the full discovery-lab and Obsidian-doc update to `origin/main`
  commit: `1ad844c`
  message: `Add Birdeye discovery lab recipe packs and research notes`

## Reports Produced

- baseline full sweep:
  `.codex/tmp/discovery-lab-full-retry.json`
- widened default-pack sweep:
  `.codex/tmp/discovery-lab-widened.json`
- quality-pack sweep:
  `.codex/tmp/discovery-lab-quality-pack.json`
- quality-pack sweep with `10k` liquidity floor:
  `.codex/tmp/discovery-lab-quality-pack-liq10k.json`
- fast-turn balanced sweep:
  `.codex/tmp/discovery-lab-fast-turn-balanced.json`
- fast-turn slightly looser sweep:
  `.codex/tmp/discovery-lab-fast-turn-lenient.json`

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

## 2026-04-11 Docs-Backed Pump Follow-Up

Birdeye's official changelog says `/defi/v3/token/meme/list` added `1m` and `30m` sort and filter intervals on `2026-02-10`, which made it worth testing whether pump discovery improves more from immediate impulse filters or from short persistence filters instead of rehashing pure `5m` and `1h` recipes.

Docs:

- <https://docs.birdeye.so/changelog/20260210-release-extra-intervals-for-token-meme-list>
- <https://docs.birdeye.so/reference/get-defi-v3-token-meme-list>

Temporary pack and report:

- recipe pack:
  `.codex/tmp/discovery-lab.recipes.pump-next.json`
- report:
  `.codex/tmp/discovery-lab-pump-next.json`

Pump-only command family:

```bash
cd trading_bot/backend
npm run lab:discovery -- \
  --recipes ../../.codex/tmp/discovery-lab.recipes.pump-next.json \
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
  --out ../../.codex/tmp/discovery-lab-pump-next.json
```

Trial recipes:

- `grad_4h_holder_liquidity_control`
  existing efficiency control
- `grad_4h_volume1h_control`
  existing quality control
- `grad_45m_volume30m_persistence`
  new persistence idea using `volume_30m_usd` and `trade_30m_count`
- `grad_75m_price30m_strength`
  new continuation idea using `price_change_30m_percent`
- `grad_20m_trade1m_impulse`
  new immediate-burst idea using `trade_1m_count` and `volume_1m_usd`

What happened:

- `grad_4h_volume1h_control`
  still won on total pass-grade count:
  `WLFI:A-`
  `emi:B+`
  `PND:B`
- `grad_4h_holder_liquidity_control`
  still won on efficiency:
  `2` returned
  `2` passes
- `grad_75m_price30m_strength`
  won on average pass quality, but only with one pass-grade name:
  `WLFI:B+`
- `grad_45m_volume30m_persistence`
  also surfaced `WLFI:B+`, but with a noisier tail
- `grad_20m_trade1m_impulse`
  returned `0` names in this window

Practical grading for `pump_dot_fun` right now:

- `A`
  `grad_4h_holder_liquidity`
  best efficiency and already repeated across multiple windows
- `A-`
  `grad_4h_volume1h`
  best broad quality recipe when the desk wants more than one real name
- `B+`
  `grad_75m_price30m_strength`
  best new docs-driven variant; worth another live-window retest before promotion
- `B`
  `grad_45m_volume30m_persistence`
  viable secondary recipe, but still noisier than the controls
- `C`
  `grad_20m_trade1m_impulse`
  too brittle so far; good theory, no evidence yet

Read:

- the two recipes worth carrying forward for `pump_dot_fun` are still:
  `grad_4h_holder_liquidity`
  `grad_4h_volume1h`
- the best next-generation variant to re-check is:
  `grad_75m_price30m_strength`
- the `1m` impulse path is not earned yet; it produced zero recall in this fresh window
- if the desk wants a second experimental recipe to pair with the controls, use the `30m` strength or persistence shapes, not looser concentration or liquidity thresholds

## Next Agent Rules

- do not waste discovery CU on `moonshot` or `raydium_launchlab` unless a fresh live window shows they are active again
- treat `meteora_dynamic_bonding_curve` as research-only until it produces an actual pass-grade candidate
- do not loosen concentration guards just because raw selected scores look better
- start from the fast-turn balanced profile before testing anything looser
- for pump-only follow-up, re-test:
  `grad_4h_holder_liquidity`
  `grad_4h_volume1h`
  `grad_75m_price30m_strength`
  before promoting any new recipe into a repo pack
- if a new window is tested, persist the JSON report path and update the same investigation and provider-memory notes instead of creating another duplicate note

## Linked Notes

- [`../../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md`](../../investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md)
- [`../../runbooks/2026-04-11-birdeye-discovery-lab.md`](../../runbooks/2026-04-11-birdeye-discovery-lab.md)
- [`../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md`](../trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md)
