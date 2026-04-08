# Prisma And Views

This repo treats the Prisma schema and SQL views as hand-maintained source, not migration output.

## Source Of Truth

- Schema: `trading_bot/backend/prisma/schema.prisma`
- Prisma datasource wiring: `trading_bot/backend/prisma.config.ts`
- View rollout: `trading_bot/backend/prisma/views/create_views.sql`
- Bootstrap command: `npm run db:setup`

## Model Groups

### Immutable facts

- `Trade`: executed buys and sells, fees, P&L, mode, profile, source, plus execution timing metadata
- `Position`: open and closed position lifecycle, including persisted entry latency
- `Signal`: pass/reject decisions, filter evidence, true detection timestamp, and timing metadata
- `ApiCall`: provider usage telemetry with strategy, mode, profile, purpose, and cache metadata
- `WalletActivity`: observed wallet trades for copy-trade research
- `GraduationEvent`: observed graduation candidates and later outcomes
- `MarketTick`: periodic market/regime snapshots

### Runtime and control state

- `ConfigProfile`: named configs per mode
- `BotState`: singleton capital/loss/pause snapshot
- `RegimeSnapshot`: stored regime history

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

## Important Rules

- Do not create Prisma migration files for this repo workflow.
- If a view shape changes, drop and recreate it in `create_views.sql`. Do not rely on `CREATE OR REPLACE VIEW` to safely rename columns on existing Docker volumes.
- `DailyStats.seriesKey` is stabilized in SQL so aggregate rows do not duplicate when strategy is `NULL`.
- Historical analytics must derive from trades, positions, signals, or snapshots. Do not backfill dashboard analytics from mutable singleton runtime state.
- `Signal.detectedAt` should represent when the opportunity was first seen, not when the row happened to be inserted.
- `Signal.metadata` and `Trade.metadata` are the current low-risk place for provider-usage provenance and timing telemetry. Prefer extending those JSON blobs before reaching for new tables.
- App code mainly queries Prisma models directly; the SQL views are convenience/reporting assets, not the primary read path in the audited code.

## When To Update This Doc

- New model or enum added
- Existing view shape or purpose changed
- API route starts depending on a new derived table or view
- Profile, mode, or trade-source scoping rules change
