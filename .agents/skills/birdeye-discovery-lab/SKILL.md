---
name: birdeye-discovery-lab
description: use when you need to compare Birdeye meme-list discovery shapes quickly with the repo lab script, source-specific runs, and Helius-backed grading instead of ad hoc curls
trigger: $birdeye-discovery-lab
---

# $birdeye-discovery-lab

Use this for repeatable Birdeye discovery experiments.

## Read First

- `notes/reference/strategy.md`
- `notes/trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md`
- `notes/trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md`

## Preconditions

- run from `trading_bot/backend`
- `.env` has valid `BIRDEYE_API_KEY` and `HELIUS_RPC_URL`
- `npm install` already done

## Main Command

```bash
cd trading_bot/backend
npm run lab:discovery -- --pack created-fresh-burst-ladder --profile high-value --sources pump_dot_fun
```

## Use Cases

- compare recipe packs by source
- run a fresh deep-eval pass with `--cache-ttl-seconds 0`
- write machine-readable output with `--out ../../.codex/tmp/discovery-lab.json`
  the script now also writes `../../.codex/tmp/discovery-lab-winners.csv` unless you override it with `--out-csv`
- tune one or two recipes with `--recipe-names ...`
- run the repo-created packs directly with `--pack <id>`
- start with these current created pack ids:
  `created-fresh-burst-ladder`
  `created-early-flow-balance`
  `created-holder-supported-continuation`
  `created-reclaim-strength-stack`
  `created-late-expansion-quality`
- use the early two packs for fresh continuation windows and the later three when you want stronger holder, liquidity, or 1h participation bias

## Rules

- Use the script, not one-off curl spam.
- Keep Birdeye API-side filters at five or fewer.
- Keep `pump_dot_fun` as the default and do not spend default lab passes on `moonshot`, `raydium_launchlab`, or `meteora_dynamic_bonding_curve`.
- The repo no longer uses starter JSON packs. Use repo-created packs or saved workspace packs instead.
- Deep eval now fetches Helius mint authorities and Helius largest-account concentration once per unique uncached mint across the whole run, then reuses those facts across recipe winners.
- Treat this as research. Do not mutate runtime defaults just because one run looked exciting.
- Inspect reject reasons before touching thresholds.
- Do not waste lab passes on dead shapes by default:
  pregrad scout recipes
  `grad_15m_trade5m`
  any `1m` impulse variant that has not earned recall in a fresh window

## Failure Modes

- `400`: usually too many or incompatible Birdeye filters
- `429`: too much query concurrency or too many recipes at once
- stale cache: rerun with `--cache-ttl-seconds 0`
- weak `source=all` results: likely paper-only noise, not useful recall
