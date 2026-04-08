# Quota And Provider Budgets

Quota pressure is runtime behavior, not dashboard decoration.

## Core Files

- `trading_bot/backend/src/config/provider-plan.ts`
- `trading_bot/backend/src/core/api-budget-manager.ts`
- `trading_bot/backend/src/bootstrap/intervals.ts`
- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/api/routes/overview.ts`
- `trading_bot/dashboard/features/quota/quota-page-client.tsx`

## Services Tracked

- `HELIUS`
- `BIRDEYE`

Jupiter and Jito are execution dependencies, but the current budget manager only enforces Helius and Birdeye quotas.

## Plan Facts

- `BIRDEYE_PLAN` currently supports `LITE` and `STARTER`
- both assume `15 RPS` and no websocket access
- defaults come from `backend/src/config/provider-plan.ts`
- current profiles:
  - `LITE`: `1,500,000 CU/month`, `20%` reserve, S2 catch-up every `30m`
  - `STARTER`: `5,000,000 CU/month`, `20%` reserve, S2 catch-up every `10m`
- `/defi/multi_price` cost still follows `ceil(N^0.8 * baseCost)` with base cost `5`

Jupiter config currently exposes:

- `JUPITER_API_KEY`
- `JUPITER_BASE_URL`
- `JUPITER_PRICE_PATH`
- `JUPITER_SWAP_PATH`

The repo does not pause runtime off Jupiter quota state in this phase.

## Runtime Rules

- Essential work stays alive as long as possible.
- Discovery, scoring, analytics enrichment, and backfills degrade first.
- Wallet scoring can be skipped under Helius pressure.
- Quota blockers come from provider quota state, not relabeled generic pause reasons.
- `LIVE` S1 and S2 entries fail closed when required Birdeye trade data is missing; `DRY_RUN` keeps the softer analytics path.
- Buy execution is non-essential budget traffic. Exit monitoring and sell execution stay essential.
- Monthly and daily reserve enforcement both use the configured `reservePct`.
- `shouldRunNonEssential()` only returns true in `HEALTHY`.
- Paid entry evaluation short-circuits when no global or per-strategy slots remain.
- `getSignaturesForAddress` and `getTransaction` must be accounted at `10` Helius credits each.

## Current Routing Notes

- Regime breadth and market-tick breadth now come from `MarketRouter`, not Birdeye trending endpoints.
- Outcome backfills, exit fast-path prices, and S1 wallet-activity pricing now use `MarketRouter.refreshExitContext()` first.
- S1 entry uses DEX Screener sanity before paid Birdeye scoring.
- S2 continuous discovery uses Jupiter `recent` plus DEX Screener prefilter; Birdeye `meme/list` is catch-up only.
- S2 catch-up and fallback Birdeye loops pause completely when `S2` has no remaining entry slots.
- S3 discovery seeds from Jupiter category feeds plus DEX Screener prefilter before paid Birdeye scoring.
- `wouldHaveWon` recompute is DB-only; do not tie it to Birdeye quota state.

## Audit Commands

From `trading_bot/backend/`:

- `npm run audit:providers`
- `npm run audit:providers -- --provider HELIUS`
- `npm run audit:providers -- --provider BIRDEYE --token <mint> --graduation-token <mint>`
- `npm run audit:providers -- --full`
- `npm run audit:timing`

Rules:

- provider audit defaults to active paid endpoints only
- the script uses non-essential quota classification and skips probes when reserve protection is already active
- if Prisma history is unavailable, the script can still run live probes with enough CLI context and otherwise falls back to config-only timing windows

## Fixed Birdeye Baseline

| Plan | S2 catch-up cadence | S2 catch-up CU/day | S1 daily wallet seed | Fixed subtotal |
| --- | --- | ---: | ---: | ---: |
| `LITE` | every `30m` | 9,600 | 230 | 9,830 |
| `STARTER` | every `10m` | 28,800 | 230 | 29,030 |

Optional fallback:

- `S2_ENABLE_NEW_LISTING_FALLBACK=true` adds the old `new_listing` sweep at about `23,040 CU/day`

## Dashboard Semantics

- shell quota snapshot comes from runtime overview data
- `/api/overview/api-usage` returns current snapshot, daily rows, monthly grouped totals, history, and top endpoint rows
- service totals stay global for the selected window
- endpoint rows can narrow by `mode` and `profile`
- the quota page labels that split on purpose

## Change Rules

- Keep service wrappers, quota accounting, and API-usage reporting aligned when provider call paths change.
- Update runtime intervals and dashboard copy together when degradation rules change.
- Wire new provider metadata through API response types and quota UI together.

## Common Mistakes

- adding raw provider fetches outside shared services
- forgetting to tag calls with strategy, mode, profile, or purpose
- averaging already-aggregated percentage fields instead of weighting by counts
- auditing every dormant endpoint by default and then blaming quota for the audit bill
