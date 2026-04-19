---

## type: runbook
status: active
area: providers/research
date: 2026-04-13
source_files:
  - .agents/skills/birdeye-discovery-lab/SKILL.md
  - trading_bot/backend/scripts/discovery-lab.ts
  - trading_bot/backend/scripts/discovery-lab-telegram-alert.ts
  - trading_bot/backend/scripts/discovery-lab/runner.ts
  - trading_bot/backend/src/services/discovery-lab-created-packs.ts
graph_checked: 2026-04-15
next_action: Keep the Telegram alert runner aligned with the saved workspace pack and the backend discovery-lab API if the pack defaults, poll timings, or alert policy change again.

# Runbook - Birdeye Discovery Lab

The procedure now lives in the repo skill:
`[.agents/skills/birdeye-discovery-lab/SKILL.md](../../.agents/skills/birdeye-discovery-lab/SKILL.md)`

Use the skill when you need repeatable Birdeye `meme/list` experiments instead of one-off curls.

## Main Command

```bash
cd trading_bot/backend
npm run lab:discovery -- --pack created-early-grad-scalp-tape-surge --profile scalp --sources pump_dot_fun --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-scalp-tape-surge.json
```

Early-graduated scalp commands:

```bash
cd trading_bot/backend
npm run lab:discovery -- --pack created-early-grad-scalp-buyer-stack --profile scalp --sources pump_dot_fun --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-scalp-buyer-stack.json
```

```bash
cd trading_bot/backend
npm run lab:discovery -- --pack created-early-grad-scalp-liquidity-ramp --profile scalp --sources pump_dot_fun --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-scalp-liquidity-ramp.json
```

```bash
cd trading_bot/backend
npm run lab:discovery -- --pack created-early-grad-scalp-momentum-retest --profile scalp --sources pump_dot_fun --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-scalp-momentum-retest.json
```

```bash
cd trading_bot/backend
npm run lab:discovery -- --pack created-early-grad-scalp-quality-guard --profile scalp --sources pump_dot_fun --cache-ttl-seconds 0 --out ../../.codex/tmp/discovery-lab-scalp-quality-guard.json
```

## Recurring Telegram Alert Command

```bash
cd trading_bot/backend
npm run lab:telegram-alert
```

Required env in `backend/.env`:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Runner behavior:

- fixed pack: `scalp-tape-structure` (`Scalp tape + structure`)
- uses the backend discovery-lab API, not ad hoc curls
- quiet-skips outside `7:00 PM IST` to `1:30 AM IST`
- quiet-skips if another discovery-lab run is already active
- sends Telegram only when the completed run has at least one winner
- optional local test overrides:
`DISCOVERY_LAB_ALERT_API_URL`
`DISCOVERY_LAB_ALERT_FORCE_WINDOW`
`DISCOVERY_LAB_ALERT_POLL_INTERVAL_MS`
`DISCOVERY_LAB_ALERT_MAX_WAIT_MS`
`TELEGRAM_API_BASE_URL`

## Durable Rules

- keep Birdeye API-side filters at five or fewer
- keep default lab runs on `pump_dot_fun`; do not spend default passes on `moonshot`, `raydium_launchlab`, or `meteora_dynamic_bonding_curve`
- use `--cache-ttl-seconds 0` when the tape moved or the cache is suspect
- `--out` now writes both the JSON report and a sibling winners CSV; use `--out-csv` only when you need a custom CSV path
- the winners CSV now uses the explicit holder column name `top10_holder_percent`
- Helius mint authorities and Helius holder concentration are batch-fetched once per unique uncached mint in the run, then reused across recipes
- repo-owned created packs now replace the old starter JSON pack files
- the current repo-created packs are:
`created-early-grad-scalp-tape-surge`
`created-early-grad-scalp-buyer-stack`
`created-early-grad-scalp-liquidity-ramp`
`created-early-grad-scalp-momentum-retest`
`created-early-grad-scalp-quality-guard`
- non-winning created packs from recent runs were retired from the default set so the desk can stay focused on early graduated scalp lanes.
- the workspace control pack is still:
`scalp-tape-structure` (`Scalp tape + structure`)
- keep the pack ladder and threshold ownership in:
`notes/investigations/2026-04-11-birdeye-discovery-lab-quality-pack-sweep.md`
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
- the Telegram alert runner now depends on the local backend API being reachable at `DISCOVERY_LAB_ALERT_API_URL` or `http://127.0.0.1:${BOT_PORT}` by default
- inspect reject reasons before touching thresholds
- keep the durable takeaway in trading memory, not in the runbook

