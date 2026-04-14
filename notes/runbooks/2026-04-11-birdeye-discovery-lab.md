---
type: runbook
status: active
area: providers/research
date: 2026-04-13
source_files:
  - .agents/skills/birdeye-discovery-lab/SKILL.md
  - trading_bot/backend/scripts/discovery-lab.ts
graph_checked: 2026-04-11
next_action: Re-check the exact scalp pack in another live window before treating the looser holder thresholds as durable default research controls.
---

# Runbook - Birdeye Discovery Lab

The procedure now lives in the repo skill:
[`.agents/skills/birdeye-discovery-lab/SKILL.md`](../../.agents/skills/birdeye-discovery-lab/SKILL.md)

Use the skill when you need repeatable Birdeye `meme/list` experiments instead of one-off curls.

## Main Command

```bash
cd trading_bot/backend
npm run lab:discovery -- --profile scalp --sources pump_dot_fun --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab.json
```

## Durable Rules

- keep Birdeye API-side filters at five or fewer
- keep default lab runs on `pump_dot_fun`; do not spend default passes on `moonshot`, `raydium_launchlab`, or `meteora_dynamic_bonding_curve`
- use `--cache-ttl-seconds 0` when the tape moved or the cache is suspect
- `--out` now writes both the JSON report and a sibling winners CSV; use `--out-csv` only when you need a custom CSV path
- the winners CSV now uses the explicit holder column name `top10_holder_percent`
- Helius mint authorities and Helius holder concentration are batch-fetched once per unique uncached mint in the run, then reused across recipes
- the default pack now blends two fresh `10m` probes with the `30m`, `45m`, and `60m` continuation windows that produced usable pass-grade names in the latest scalp-profile rerun
- pass-grade results in the dashboard can now open a live manual trade directly from the token board; that path reuses the real execution engine, creates a linked candidate row for traceability, and drops the position into the normal managed-exit and open-position surfaces
- the new `scalp` profile is the current small-ticket grading lens for recipe experiments; it matches the calibrated proxy lens:
  `minLiquidityUsd=8000`
  `maxMarketCapUsd=2000000`
  `minHolders=35`
  `minVolume5mUsd=1500`
  `minUniqueBuyers5m=12`
  `minBuySellRatio=1.05`
  `maxTop10HolderPercent=45`
  `maxSingleHolderPercent=25`
  `maxNegativePriceChange5mPercent=18`
- that exact scalp rerun produced `18` pass-grade hits across `5` unique tokens in the sampled window, with `grad_60m_trade5m` leading by total good names
- if discovery lab is launched from the running bot container through the dashboard API, the container image must include both `tsx` and the backend `src/` tree because `npm run lab:discovery` executes the TypeScript script directly
- inspect reject reasons before touching thresholds
- keep the durable takeaway in trading memory, not in the runbook
