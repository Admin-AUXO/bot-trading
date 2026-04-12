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
npm run lab:discovery -- --profile high-value --sources pump_dot_fun,moonshot,raydium_launchlab,meteora_dynamic_bonding_curve
```

## Use Cases

- compare recipe packs by source
- run a fresh deep-eval pass with `--cache-ttl-seconds 0`
- write machine-readable output with `--out ../../.codex/tmp/discovery-lab.json`
- tune one or two recipes with `--recipe-names ...`
- test the quality or fast-turn packs from `scripts/discovery-lab.recipes.quality.json` or `scripts/discovery-lab.recipes.fast-turn.json`
- re-check the current pump controls first:
  `grad_4h_volume1h`
  `grad_4h_holder_liquidity`
  `grad_60m_trade5m`
- if you need new variants, test the `30m` follow-ups before reviving brittle pregrad or `1m` impulse shapes:
  `grad_75m_price30m_strength`
  `grad_45m_volume30m_persistence`

## Rules

- Use the script, not one-off curl spam.
- Keep Birdeye API-side filters at five or fewer.
- Prefer source-specific runs before `source=all`.
- Keep `pump_dot_fun` as the default test source unless another venue proves it can produce pass-grade names again.
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
