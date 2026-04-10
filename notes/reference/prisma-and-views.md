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
graph_checked:
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

- `Candidate`: current filter state, lifecycle status, rejection reason, and entry linkage for each discovered mint
- `Position`: open and closed positions plus exit thresholds, score-derived exit metadata, and remaining size
- `Fill`: buy and sell executions attached to positions, including live `txSignature` when trades land onchain

Bounded research state:

- `ResearchRun`: one isolated dry-run research session, including config snapshot, provider burn, aggregate outcomes, and previous-run comparison
- `ResearchToken`: run-scoped discovery and evaluation evidence for each discovered mint, including cheap score, deep-eval result, `liveTradable`, and `researchTradable`
- `ResearchPosition`: mock positions for a research run, with the same exit-plan state the live lane uses
- `ResearchFill`: mock buy and sell events attached to research positions

Runtime singletons:

- `BotState`: current capital, realized PnL, pause reason, and lane heartbeat timestamps
- `RuntimeConfig`: persisted validated settings JSON

Evidence and telemetry:

- `ApiEvent`: provider usage, units, latency, and success or failure
- `RawApiPayload`: request and response bodies and provider errors
- `TokenSnapshot`: normalized point-in-time evidence from discovery, evaluation, buy, and sell events

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
- Research tables currently have no SQL view layer; the dashboard reads run summaries from `/api/status` and the dedicated `/api/research-runs/*` routes instead of mixing research rows into the operational reporting views

## Change Rules

- Do not create Prisma migration files in this repo.
- If the Prisma model shape changes, run `npm run db:generate` before trusting TypeScript output.
- If schema or view behavior changes, run `npm run db:setup`.
- If a view is added or renamed, update both `create_views.sql` and the API allowlist in [`../../trading_bot/backend/src/api/server.ts`](../../trading_bot/backend/src/api/server.ts).
- Keep reporting grounded in candidates, positions, fills, snapshots, or provider telemetry. `BotState` and `RuntimeConfig` are operational singletons, not historical fact tables.
- Prefer adding missing evidence to `TokenSnapshot` or provider telemetry instead of inventing dashboard-only derived fields that cannot be audited later.
