# Quota And Provider Budgets

Quota pressure is part of the runtime, not an optional dashboard garnish.

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

Jupiter and Jito are used by execution paths, but the current `ApiBudgetManager` only manages Helius and Birdeye budgets.

## Jupiter Notes

- Jupiter execution and price reads now use the env-backed `api.jup.ag` host.
- Current repo config exposes:
  - `JUPITER_API_KEY`
  - `JUPITER_BASE_URL`
  - `JUPITER_PRICE_PATH`
  - `JUPITER_SWAP_PATH`
- Jupiter docs now describe separate free-tier buckets for:
  - `Price API`
  - `Default` API traffic
- The repo still does not pause runtime off Jupiter quota state in this phase. Keep Jupiter routing rate-aware in service code instead of inventing new quota blockers.

## Birdeye Plan Facts

- `BIRDEYE_PLAN` is env-driven and currently supports `LITE` and `STARTER`
- Lite and Starter both assume:
  - `15 RPS`
  - `WebSocket Access: No`
- plan-specific runtime defaults come from `backend/src/config/provider-plan.ts`
- current plan profiles are:
  - `LITE`: `1,500,000 CU/month`, `20%` reserve, `30m` S2 catch-up cadence
  - `STARTER`: `5,000,000 CU/month`, `20%` reserve, `10m` S2 catch-up cadence
- Birdeye batch-cost math for `/defi/multi_price` follows the published formula:
  - `ceil(N^0.8 * baseCost)`
  - current base cost for `/defi/multi_price` is `5`

## Runtime Rules

- essential work should keep running as long as possible
- discovery, scoring, analytics enrichment, and backfills degrade first
- wallet scoring can be skipped under Helius quota pressure
- quota blockers come from provider quota state, not relabeled generic pause reasons
- some strategy filters soft-fail when non-essential provider data is missing; others suppress the candidate entirely
- `LIVE` S1 and S2 entries now fail closed when required Birdeye trade data is missing; only `DRY_RUN` keeps the old soft-fail analytics behavior
- buy execution is treated as non-essential budget traffic; exit monitoring and sell execution stay essential
- monthly reserve comes from the configured `20%` budget reserve
- non-essential traffic is blocked before it consumes the protected daily reserve
- `shouldRunNonEssential()` only returns true in `HEALTHY`, so soft-limit state already degrades work
- Helius historical RPC methods are not cheap: `getSignaturesForAddress` and `getTransaction` must be accounted at `10` credits each

## Current Routing Notes

- Regime breadth and market-tick breadth now come from `MarketRouter` instead of Birdeye trending endpoints.
- Outcome price backfills now use Jupiter-backed `MarketRouter.refreshExitContext()` instead of Birdeye `multi_price`.
- Exit fast-path prices now use `MarketRouter.refreshExitContext()` instead of Birdeye `multi_price`; Birdeye only appears on throttled slow-path refreshes when Jupiter cannot price the token.
- S1 wallet-activity price capture now uses `MarketRouter.refreshExitContext()` instead of single-token Birdeye `multi_price`.
- S1 entry now uses DEX Screener sanity before paid Birdeye scoring.
- S2 continuous discovery now uses Jupiter `recent` plus DEX Screener prefilter; Birdeye `meme/list` is catch-up only.
- S3 discovery now seeds from Jupiter category feeds plus DEX Screener prefilter before any paid Birdeye final-score calls.
- `wouldHaveWon` recompute is now a DB-only pass; do not tie it to Birdeye quota state.
- Birdeye quota sync still matters for paid discovery and final scoring paths that remain on Birdeye.

## Current Birdeye Fixed-Cadence Baseline

Current code now matches the planned fixed-cadence shape instead of the old Birdeye-heavy loops:

| Plan | S2 catch-up cadence | S2 catch-up CU/day | S1 daily wallet seed | Fixed subtotal |
| --- | --- | ---: | ---: | ---: |
| `LITE` | every `30m` | 9,600 | 230 | 9,830 |
| `STARTER` | every `10m` | 28,800 | 230 | 29,030 |

Optional fallback:

- `S2_ENABLE_NEW_LISTING_FALLBACK=true` adds the old `new_listing` sweep back at about `23,040 CU/day`
- it defaults off because cheap-side routing plus catch-up is now the base path

The S2 `20s` Birdeye meme-list loops, the S3 discovery loop, regime sample, market-tick sample, backfills, and exit fast path are no longer scheduled Birdeye spend in the default configuration.

## Dashboard Semantics

- shell quota snapshot comes from runtime overview data
- `/api/overview/api-usage` returns:
  current snapshot, daily rows, monthly grouped totals, history, and top endpoint rows
- service totals are global for the selected time window
- endpoint rows can be narrowed by `mode` and `profile`
- the quota page labels that split on purpose

## Change Rules

- if a provider call path changes, keep service wrappers, quota accounting, and API-usage reporting aligned
- if quota degradation rules change, update both runtime intervals and dashboard copy
- if new provider metadata is exposed, wire it through API response types and quota UI together

## Common Mistakes

- adding raw provider fetches outside shared services
- forgetting to tag calls with strategy, mode, profile, or purpose
- averaging already-aggregated percentage fields instead of weighting by underlying counts
