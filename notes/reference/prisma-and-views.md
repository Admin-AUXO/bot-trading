---
type: reference
status: active
area: db
date: 2026-04-10
source_files:
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/prisma/views/create_views.sql
  - trading_bot/backend/src/db/client.ts
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/services/operator-events.ts
  - trading_bot/backend/src/services/shared-token-facts.ts
  - trading_bot/backend/.env.example
graph_checked: 2026-04-11
next_action:
---

# Prisma And Views

Purpose: define the database ownership model and the reporting surfaces agents are allowed to build on.

## Source Of Truth

- Schema: [`../../trading_bot/backend/prisma/schema.prisma`](../../trading_bot/backend/prisma/schema.prisma)
- Prisma config: [`../../trading_bot/backend/prisma.config.ts`](../../trading_bot/backend/prisma.config.ts)
- SQL views: [`../../trading_bot/backend/prisma/views/create_views.sql`](../../trading_bot/backend/prisma/views/create_views.sql)
- Prisma 7 runtime adapter: `@prisma/adapter-pg` in [`../../trading_bot/backend/src/db/client.ts`](../../trading_bot/backend/src/db/client.ts), which reads `DATABASE_URL` from app code
- Canonical rollout: `cd trading_bot/backend && npm run db:setup`

This workflow treats Prisma schema and SQL views as hand-maintained source, not migration output.

## Table Roles

Operational state:

- `Candidate`: current filter state, lifecycle status, rejection reason, direct entry attribution, score fields, and discovery-lab or live-strategy linkage
- `Position`: open and closed positions plus exit thresholds, requested vs planned size, confidence and exit profile, remaining size, and discovery-lab or live-strategy linkage
- `Fill`: buy and sell executions attached to positions, including live `txSignature`, execution reason or mode, latency breakdown, slippage, and quoted vs actual out amounts when trades land onchain

Discovery-lab state:

- `DiscoveryLabPack`: saved pack definition, pack kind, threshold overrides, recipe payload, and source path
- `DiscoveryLabRun`: persisted run summary, pack snapshot, report blob, strategy calibration, market-regime snapshot, stats snapshot, and apply-to-live linkage
- `DiscoveryLabRunQuery`: normalized per-query summary facts for recipe-source combinations
- `DiscoveryLabRunToken`: normalized per-token result facts for winners, passes, rejects, and score analysis

Runtime singletons:

- `BotState`: current capital, realized PnL, pause reason, and lane heartbeat timestamps
- `RuntimeConfig`: persisted validated settings JSON
- `RuntimeConfigVersion`: append-only config history used for Grafana cohorting, before-or-after analysis, and config-impact reporting

Evidence and telemetry:

- `ApiEvent`: provider usage, units, latency, and success or failure
- `RawApiPayload`: request and response bodies and provider errors
- `TokenMetrics`: unified time-series facts from discovery, evaluation, buy, and sell events (replaces TokenSnapshot). `trigger` field distinguishes capture context.
- `OperatorEvent`: desk-owned event feed for control actions, runtime failures, config reviews, and other operator-relevant transitions
- `SharedTokenFact`: reusable per-mint fact cache for Birdeye detail, trade data, token security, Helius mint authorities, Helius holder concentration, token overview, token metadata, and market stats. Live evaluation and discovery-lab token insight should reuse this row before calling providers again.
- `SharedTokenFactMigrationSignal`: append-only Helius watcher signal log keyed by signature so duplicate websocket events do not multiply
- `ResearchFill`: research-mode fill records with mint, side, price, amount, slippage, mint source, and score. Used for backtesting and research analysis.
- `ExitEvent`: audit trail for position exits with positionId, reason (TP1_HIT, TP2_HIT, STOP_LOSS, TRAILING_STOP, TIME_STOP, MANUAL), optional profile, price, and PnL.

## View Contract

These views are repo-owned and currently exposed through `GET /api/views/:name`.

**Token Metrics:**
- `v_token_metrics_latest`: Latest metrics snapshot per mint+trigger (uses ROW_NUMBER)
- `v_token_metrics_aggregation`: Hourly rollups for time-series analysis

**Candidate:**
- `v_candidate_lifecycle`: Pipeline timing and staleness metrics
- `v_candidate_with_metrics`: Candidate joined with latest discovery metrics
- `v_candidate_funnel_daily`: Daily candidate counts by status and source
- `v_candidate_decision_facts`: Candidate decision spine with source, scores, and downstream outcome

**Position:**
- `v_position_entry_analysis`: Entry quality and context (computed at query time)
- `v_position_monitor`: Real-time position monitoring with intervention priority

**Fill:**
- `v_fill_performance`: Fill-level P&L analysis with price vs entry comparison

**Runtime:**
- `v_runtime_overview`: Bot state at a glance (capital, positions, config version)
- `v_api_telemetry_daily`: Daily API usage and error rates by provider/endpoint
- `v_api_provider_daily`: Compatibility provider rollup derived from `v_api_telemetry_daily`
- `v_api_endpoint_efficiency`: Compatibility endpoint rollup with latest call timestamp
- `v_position_pnl_daily`: Compatibility closed-position daily PnL rollup derived from `Position` and `Fill`

**Discovery Lab:**
- `v_discovery_lab_run_summary`: Run performance summary with computed duration
- `v_discovery_lab_pack_performance`: Pack-level aggregated stats

**Shared:**
- `v_shared_token_fact_cache`: Token fact cache with freshness metrics

## Change Rules

- Do not create Prisma migration files in this repo.
- If the Prisma model shape changes, run `npm run db:generate` before trusting TypeScript output.
- If schema or view behavior changes, run `npm run db:setup`.
- `SharedTokenFact` cache additions must land in both Prisma schema and the live table. `db:setup` can report synced while the runtime table still lacks new columns, so if token-insight or discovery code errors on missing fields, reconcile the live table before trusting the compose result.
- `db:push` may require a host-local `DATABASE_URL` override outside Docker because the checked-in `.env` defaults to the Compose hostname `postgres`.
- If a view is added or renamed, update both `create_views.sql` and the API allowlist in [`../../trading_bot/backend/src/api/server.ts`](../../trading_bot/backend/src/api/server.ts).
- Keep reporting grounded in candidates, positions, fills, snapshots, or provider telemetry. `BotState` and `RuntimeConfig` are operational singletons, not historical fact tables.
- `OperatorEvent` is an operational support table. It exists for desk auditability and control flow, not for primary Grafana trend reporting.

## Data Retention

The following tables have automated or manual cleanup policies to prevent unbounded growth:

### OperatorEvent

A weekly cleanup job removes events older than 30 days:

```sql
DELETE FROM "OperatorEvent" WHERE "createdAt" < NOW() - INTERVAL '30 days';
```

This can be wired into a scheduled job (e.g., a cron entry on the host, a pg_cron scheduled task, or a one-off script run via `npm run db:cleanup`). The interval is intentionally conservative to preserve recent audit context while pruning stale noise.

Other telemetry tables use time-bounded Grafana queries rather than hard deletes: `ApiEvent`, `RawApiPayload`, and `TokenMetrics` are partitioned or queried with `capturedAt > now() - interval 'N days'` to keep dashboard load fast without data loss.
- `RuntimeConfigVersion` is the historical exception on purpose. It exists specifically so Grafana can analyze config windows without pretending a singleton table has history.
- Prefer adding missing evidence to `TokenMetrics`, `SharedTokenFact`, or provider telemetry instead of inventing dashboard-only derived fields that cannot be audited later.
- The old research tables and views are intentionally removed. Discovery analysis now belongs in `DiscoveryLabRun*`, attributed trade rows, and shared token facts instead of a second dry-run table family.
