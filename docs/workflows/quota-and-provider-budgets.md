# Quota And Provider Budgets

Quota pressure is part of the runtime, not an optional dashboard garnish.

## Core Files

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

## Runtime Rules

- essential work should keep running as long as possible
- discovery, scoring, analytics enrichment, and backfills degrade first
- wallet scoring can be skipped under Helius quota pressure
- would-have-won backfill can be skipped under Birdeye quota pressure
- quota blockers come from provider quota state, not relabeled generic pause reasons
- some strategy filters soft-fail when non-essential provider data is missing; others suppress the candidate entirely
- buy execution is treated as non-essential budget traffic; exit monitoring and sell execution stay essential
- monthly reserve comes from the configured `20%` budget reserve
- non-essential traffic is blocked before it consumes the protected daily reserve
- `shouldRunNonEssential()` only returns true in `HEALTHY`, so soft-limit state already degrades work

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
