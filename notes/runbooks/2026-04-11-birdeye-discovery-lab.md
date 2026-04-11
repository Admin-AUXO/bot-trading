---
type: runbook
status: active
area: providers/research
date: 2026-04-11
source_files:
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab.recipes.json
  - trading_bot/backend/scripts/discovery-lab.recipes.quality.json
  - trading_bot/backend/scripts/discovery-lab.recipes.fast-turn.json
  - trading_bot/backend/package.json
graph_checked: 2026-04-11
next_action: Re-check the fast-turn pump pack in another live window before treating the current winner as a runtime default.
---

# Runbook - Birdeye Discovery Lab

Use this when you want to compare Birdeye `meme/list` query shapes quickly and grade the returned tokens with Helius-backed structure checks.

## Why This Exists

- app-session MCP tool registries do not always hot-reload cleanly
- repeated one-off curls are slow and easy to overfilter
- Birdeye `meme/list` still has the practical `5`-filter ceiling
- the desk wants source-by-source evidence for graduation-play discovery, not vague hunches

The lab script uses direct Birdeye HTTP plus direct Helius RPC on purpose. That is faster and less brittle than driving the same work through MCP session plumbing for repeat experiments.

The cache stores raw provider research only:

- Birdeye trade-data
- Helius mint authority state
- Helius holder concentration

It does **not** store pass/fail grading decisions anymore. That matters because threshold overrides are part of the point of this lab, and cached rejects from one threshold set should not poison the next run.

## Preconditions

- run from `trading_bot/backend`
- `.env` must have a valid `BIRDEYE_API_KEY` and `HELIUS_RPC_URL`
- `npm install` already done in `trading_bot/backend`

## Main Command

```bash
cd /Users/rukaiyahyusuf/Downloads/bot-trading/trading_bot/backend
npm run lab:discovery -- --profile high-value --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve
```

## Useful Variants

Run only a couple of recipes while tuning:

```bash
npm run lab:discovery -- \
  --profile high-value \
  --sources pump_dot_fun,moonshot \
  --recipe-names grad_60m_last_trade,pregrad_95_progress
```

Write a machine-readable report:

```bash
npm run lab:discovery -- \
  --profile high-value \
  --out /tmp/discovery-lab.json
```

Run the quality-biased second pack:

```bash
npm run lab:discovery -- \
  --recipes discovery-lab.recipes.quality.json \
  --profile high-value \
  --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve
```

Run the bankroll-sized fast-turn pack:

```bash
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
  --cache-ttl-seconds 0
```

Force a fresh deep-eval pass instead of using the short cache:

```bash
npm run lab:discovery -- --cache-ttl-seconds 0
```

Widen the grading lens for large-cap graduation plays without touching app config:

```bash
npm run lab:discovery -- \
  --profile high-value \
  --max-market-cap-usd 10000000 \
  --min-holders 75 \
  --sources pump_dot_fun,meteora_dynamic_bonding_curve
```

Widen both size and tape thresholds for research-only sweeps:

```bash
npm run lab:discovery -- \
  --recipes discovery-lab.recipes.quality.json \
  --profile high-value \
  --min-liquidity-usd 10000 \
  --max-market-cap-usd 10000000 \
  --min-holders 50 \
  --min-volume-5m-usd 2500 \
  --min-unique-buyers-5m 20 \
  --min-buy-sell-ratio 1.15 \
  --max-top10-holder-percent 40 \
  --max-single-holder-percent 20 \
  --cache-ttl-seconds 0
```

## What The Script Does

1. loads the default recipe pack from `scripts/discovery-lab.recipes.json` unless you override it
2. expands each recipe across the requested sources
3. skips recipes with more than `5` active API-side filters unless you explicitly allow them
4. calls Birdeye `meme/list` for each recipe-source pair
5. pre-ranks the returned names using freshness, liquidity, volume, holders, and tape recency
6. deep-evaluates the top names with:
   - Birdeye trade-data
   - Helius mint authority status
   - Helius largest-holder concentration
7. prints source winners and the best query outcomes

## Current Default Focus

The default recipe file targets two play families:

- just graduated:
  `graduated=true` with fresh graduation windows and active tape
- about to graduate:
  `graduated=false` with high `progress_percent` and recent trade activity

The second recipe pack in `scripts/discovery-lab.recipes.quality.json` shifts the provider request toward tape quality:

- graduates ranked by `volume_5m_usd`, `trade_5m_count`, `volume_1h_usd`, or `liquidity`
- pregrad names ranked by `volume_5m_usd`, `trade_5m_count`, or `volume_1h_usd`
- holder and flow filters moved into the provider request where they fit inside the five-filter ceiling

The third pack in `scripts/discovery-lab.recipes.fast-turn.json` is bankroll-specific:

- pump-focused first, Meteora only as a secondary check
- fast-turn graduate recipes aimed at a `5` to `10` minute hold
- two pregrad scout recipes kept for research, not because they are automatically safe live trades
- the current best actionable recipe in the sampled window was:
  `grad_4h_holder_liquidity`

## Failure Modes

- `filter ceiling exceeded`
  The recipe crossed the practical `5`-filter limit. Drop one API-side filter and post-filter locally instead.
- Birdeye `400`
  Usually still a bad filter combination, not auth.
- Birdeye `429`
  The script retries bursts automatically. If it still repeats, lower `--query-concurrency` or run fewer recipes at once.
- weak results from `source=all`
  That often just manufactures paper-only noise; use source-specific runs first.
- stale cache
  Use `--cache-ttl-seconds 0` when the tape moved and the earlier deep eval is no longer trustworthy.
- old cached grading logic
  If you ran an older version of the lab before the raw-research cache fix, use `--cache-ttl-seconds 0` once to flush those earlier values from your path.

## Reuse Rule

Do not widen the default recipe pack casually. First look at which source and recipe pairs are repeatedly producing good tokens per `100` CU, then add only the next most useful variant.

For a small-bankroll fast-turn cycle, do not assume looser is better. In the sampled window, a slightly looser profile did **not** add new pass-grade names; it only increased the scores of already-rejected names.
