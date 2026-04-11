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

- `Candidate`: current filter state, lifecycle status, rejection reason, entry linkage, and the strategy preset that discovered the mint
- `Position`: open and closed positions plus exit thresholds, score-derived exit metadata, remaining size, and the strategy preset that opened the trade
- `Fill`: buy and sell executions attached to positions, including live `txSignature` when trades land onchain

Bounded research state:

- `ResearchRun`: one isolated dry-run research session, including config snapshot, provider burn, aggregate outcomes, and previous-run comparison
- `ResearchToken`: run-scoped discovery and evaluation evidence for each discovered mint, including cheap score, deep-eval result, `liveTradable`, `researchTradable`, and the preset id used for the run
- `ResearchPosition`: mock positions for a research run, with the same exit-plan state the live lane uses plus the preset id used to open the mock trade
- `ResearchFill`: mock buy and sell events attached to research positions

Runtime singletons:

- `BotState`: current capital, realized PnL, pause reason, and lane heartbeat timestamps
- `RuntimeConfig`: persisted validated settings JSON
- `RuntimeConfigDraft`: persisted draft settings, the active-settings version the draft was based on, and the latest dry-run review summary
- `RuntimeConfigVersion`: append-only config history used for Grafana cohorting, before-or-after analysis, and config-impact reporting

Evidence and telemetry:

- `ApiEvent`: provider usage, units, latency, and success or failure
- `RawApiPayload`: request and response bodies and provider errors
- `TokenSnapshot`: normalized point-in-time evidence from discovery, evaluation, buy, and sell events
- `OperatorEvent`: desk-owned event feed for control actions, runtime failures, config reviews, and other operator-relevant transitions
- `SharedTokenFact`: reusable per-mint fact cache for Birdeye detail, trade data, token security, Helius mint authorities, and Helius holder concentration. Evaluation now reads the fresh bundle from one row fetch per mint instead of one DB query per cached fact.
- `SharedTokenFactMigrationSignal`: append-only Helius watcher signal log keyed by signature so duplicate websocket events do not multiply

## View Contract

These views are repo-owned and currently exposed through `GET /api/views/:name`.

- `v_runtime_overview`: singleton runtime state plus open-position and queued-candidate counts
- `v_candidate_funnel_daily`: daily candidate counts by status
- `v_position_performance`: per-position realized PnL, gross exit, hold time, and exit reason
- `v_api_provider_daily`: daily provider call, units, latency, and error summary
- `v_api_endpoint_efficiency`: endpoint-level provider efficiency and last call time
- `v_raw_api_payload_recent`: last 14 days of raw provider payloads
- `v_token_snapshot_enriched`: snapshot rows joined to candidate and position state
- `v_candidate_latest_filter_state`: current candidate filter spine with denormalized metrics
- `v_candidate_reject_reason_daily`: daily reject counts by reason
- `v_snapshot_trigger_daily`: daily snapshot volume and average liquidity, market cap, and buy-sell ratio by trigger
- `v_position_exit_reason_daily`: daily exit counts, hold time, and average price delta by exit reason
- `v_runtime_settings_current`: flattened persisted runtime settings
- `v_runtime_live_status`: live lane summary for the Grafana live monitor
- `v_open_position_monitor`: open-position risk and intervention facts for live monitoring
- `v_recent_fill_activity`: recent fills with position, symbol, and execution context
- `v_position_snapshot_latest`: latest snapshot facts joined to positions
- `v_fill_pnl_daily`: daily realized PnL with config-version context
- `v_fill_daily`: daily fill counts and notional by side and config version
- `v_position_pnl_daily`: daily position outcomes with win-rate and hold-time rollups
- `v_candidate_decision_facts`: candidate decision spine with source and config-version context
- `v_candidate_funnel_daily_source`: daily candidate funnel by source
- `v_candidate_reject_reason_daily_source`: daily reject reasons by source
- `v_source_outcome_daily`: daily source-level trading outcomes
- `v_candidate_cohort_daily`: daily candidate cohorts for source, daypart, and risk slicing
- `v_position_cohort_daily`: daily position cohorts for exit-profile and source slicing
- `v_api_provider_hourly`: hourly provider trend for Grafana
- `v_api_endpoint_hourly`: hourly provider-endpoint trend for Grafana
- `v_payload_failure_hourly`: hourly payload failure concentration
- `v_runtime_lane_health`: per-lane staleness and health contract for the live monitor
- `v_config_change_log`: config-version history for annotations and RCA
- `v_kpi_by_config_window`: KPI rollups by config version window
- `v_config_field_change`: field-level config diffs by version
- Research tables currently have no SQL view layer; the dashboard reads run summaries from `/api/status` and the dedicated `/api/research-runs/*` routes instead of mixing research rows into the operational reporting views

## Change Rules

- Do not create Prisma migration files in this repo.
- If the Prisma model shape changes, run `npm run db:generate` before trusting TypeScript output.
- If schema or view behavior changes, run `npm run db:setup`.
- `db:push` may require a host-local `DATABASE_URL` override outside Docker because the checked-in `.env` defaults to the Compose hostname `postgres`.
- If a view is added or renamed, update both `create_views.sql` and the API allowlist in [`../../trading_bot/backend/src/api/server.ts`](../../trading_bot/backend/src/api/server.ts).
- Keep reporting grounded in candidates, positions, fills, snapshots, or provider telemetry. `BotState` and `RuntimeConfig` are operational singletons, not historical fact tables.
- `RuntimeConfigDraft` and `OperatorEvent` are operational support tables. They exist for safe control flow and auditability, not for primary Grafana trend reporting.
- `RuntimeConfigVersion` is the historical exception on purpose. It exists specifically so Grafana can analyze config windows without pretending a singleton table has history.
- Prefer adding missing evidence to `TokenSnapshot`, `SharedTokenFact`, or provider telemetry instead of inventing dashboard-only derived fields that cannot be audited later.
