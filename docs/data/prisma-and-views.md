# Prisma And Views

This repo treats the Prisma schema and SQL views as hand-maintained source, not migration output.

## Source Of Truth

- schema: `trading_bot/backend/prisma/schema.prisma`
- Prisma datasource wiring: `trading_bot/backend/prisma.config.ts`
- view rollout: `trading_bot/backend/prisma/views/create_views.sql`
- bootstrap command: `npm run db:setup`

## Model Groups

### Immutable facts

- `Trade`: executed buys and sells, fees, P&L, mode, profile, source, execution metadata
- `Position`: open and closed position lifecycle, including persisted entry latency
- `Signal`: pass/reject decisions, filter evidence, first-seen timestamp, timing metadata
- `ApiCall`: provider usage telemetry with strategy, mode, profile, purpose, and cache metadata
- `WalletActivity`: observed wallet trades for copy-trade research
- `GraduationEvent`: observed graduation candidates and later outcomes
- `MarketTick`: periodic market and regime snapshots

### Runtime and control state

- `ConfigProfile`
- `BotState`
- `RegimeSnapshot`

### Derived metrics

- `DailyStats`
- `ApiUsageDaily`
- `ApiEndpointDaily`

## View Contract

`create_views.sql` maintains repo-owned views such as:

- `v_dashboard_overview`
- `v_active_positions`
- `v_strategy_performance`
- `v_api_budget`
- `v_api_endpoint_efficiency`
- `v_recent_trades`
- `v_daily_pnl`
- `v_capital_curve`
- `v_profile_comparison`
- `v_strategy_comparison`
- `v_regime_performance`
- `v_tranche_distribution`
- `v_signal_accuracy`

## Rules

- Do not create Prisma migration files for this repo workflow.
- If a view shape changes, drop and recreate it in `create_views.sql`.
- `DailyStats.seriesKey` is stabilized in SQL so aggregate rows do not duplicate when strategy is `NULL`.
- Historical analytics must derive from trades, positions, signals, or snapshots, not mutable singleton runtime state.
- `Signal.detectedAt` should mean first seen, not insert time.
- `Signal.metadata` and `Trade.metadata` are still the low-risk place for provider provenance and timing telemetry before adding new tables.
- App code mainly queries Prisma models directly; SQL views are reporting assets, not the primary read path in the audited code.

## Update This Doc When

- a model or enum is added
- a view shape or purpose changes
- an API route starts depending on a new derived table or view
- profile, mode, or trade-source scoping rules change
