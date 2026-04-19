---
type: reference
status: active
area: db
date: 2026-04-18
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
`create_views.sql` also owns repo-managed database objects Prisma cannot express cleanly, such as the partial unique index that enforces one open position per mint.

## Table Roles

Operational state:

- `Candidate`: current filter state, lifecycle status, rejection reason, direct entry attribution, score fields, and discovery-lab or live-strategy linkage
- `Position`: open and closed positions plus exit thresholds, requested vs planned size, confidence and exit profile, remaining size, and discovery-lab or live-strategy linkage
- `Fill`: buy and sell executions attached to positions, including live `txSignature`, execution reason or mode, latency breakdown, slippage, and quoted vs actual out amounts when trades land onchain

Discovery-lab state:

- `StrategyPack`: first-class pack contract mirrored from the current discovery-lab pack catalog so backend and dashboard work can stop depending on free-form pack ids alone
- `StrategyPackVersion`: append-only pack snapshot history generated during discovery-lab pack sync or save flows
- `ExitPlan`: normalized managed-exit contract for one open position. This now dual-writes alongside `Position.metadata.exitPlan` so exit logic can move off metadata without a big-bang cutover.
- `TradingSession`: backend-owned record of the currently deployed live-strategy pack or a past deployed pack window, including source run, previous-pack linkage, config-version attribution, stop reason, and rolled-up trade outcomes
- `DiscoveryLabPack`: retained discovery-lab pack source-of-editing while the pack service rewrite is still pending
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
- `AdaptiveThresholdLog`: append-only adaptive-threshold mutation log backing operator telemetry and the adaptive Grafana surfaces
- `BundleStats`: cache of bundle and sniper telemetry per mint, currently fed by Trench and reused by enrichment/UI reads
- `EnrichmentFact`: per-mint, per-provider, per-fact cache row with payload JSON, fetch time, and expiry. `TokenEnrichmentService` owns writes.
- `CreatorLineage`: cached creator launch-rate, rug-rate, and funding-source facts for market/detail views and future entry gating
- `ProviderCreditLog`: append-only provider-call telemetry with provider, endpoint, purpose, credits used, latency, status, and optional session/pack/mint attribution
- `FillAttempt`: execution-attempt audit row for quote/build/submit outcomes, retry count, lane, fee settings, and terminal failure code
- `MutatorOutcome`: adaptive exit mutator verdict trail with before/after values and realized vs counterfactual PnL
- `SmartWalletFunding`: cached wallet funding-source classification for smart-money curation
- Execution-side Helius ownership now writes `ProviderCreditLog` rows from the live trade path too: wallet funding checks (`getBalance`, `getParsedTokenAccountsByOwner`), Sender submit (`sendTransaction` with zero credits but visible call count), confirmation (`confirmTransaction`), settlement reads (`getParsedTransaction`), and priority-fee estimation (`getPriorityFeeEstimate`). Priority-fee logging is slot-owned now, so one estimate should emit one row, not a duplicate pair.

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
- `v_api_provider_hourly`: Hourly provider burn/latency/error rollup from `ProviderCreditLog`
- `v_api_purpose_daily`: Daily provider-purpose burn rollup from `ProviderCreditLog`
- `v_api_endpoint_efficiency`: Compatibility endpoint rollup with latest call timestamp
- `v_api_session_cost`: Session-level provider burn rollup from `ProviderCreditLog`
- `v_position_pnl_daily`: Compatibility closed-position daily PnL rollup derived from `Position` and `Fill`

**Discovery Lab:**
- `v_discovery_lab_run_summary`: Run performance summary with computed duration
- `v_discovery_lab_pack_performance`: Pack-level aggregated stats
- `v_strategy_pack_performance_daily`: Daily rollup by `StrategyPack` id with run counts, winner counts, evaluation totals, winner-rate percentage, and latest applied config version when present
- `v_mutator_outcome_daily`: Daily adaptive mutator verdict and PnL rollup
- `v_enrichment_freshness`: Per-provider cache freshness and staleness summary from `EnrichmentFact`
- `v_enrichment_quality_daily`: Daily enrichment success/latency/coverage rollup
- `v_adaptive_threshold_activity`: Adaptive threshold mutation activity grouped for operator/Grafana telemetry
- `v_smart_wallet_mint_activity`: Mint-level smart-wallet activity summary for market operator surfaces

**Shared:**
- `v_shared_token_fact_cache`: Token fact cache with freshness metrics

## Change Rules

- Do not create Prisma migration files in this repo.
- If the Prisma model shape changes, run `npm run db:generate` before trusting TypeScript output.
- If schema or view behavior changes, run `npm run db:setup`.
- `SharedTokenFact` cache additions must land in both Prisma schema and the live table. `db:setup` can report synced while the runtime table still lacks new columns, so if token-insight or discovery code errors on missing fields, reconcile the live table before trusting the compose result.
- `db:push` may require a host-local `DATABASE_URL` override outside Docker because the checked-in `.env` defaults to the Compose hostname `postgres`.
- If a view is added or renamed, update both `create_views.sql` and the API allowlist in [`../../trading_bot/backend/src/api/routes/utils.ts`](../../trading_bot/backend/src/api/routes/utils.ts).
- `StrategyPack` is the new database-backed pack contract. During the transition, `DiscoveryLabService` dual-writes discovery-lab pack saves and catalog sync into both `DiscoveryLabPack` and `StrategyPack` plus `StrategyPackVersion`.
- `ExitPlan` is now the normalized database contract for managed exits. `ExecutionEngine` dual-writes it on position open, while `strategy-exit.ts` still preserves the metadata fallback until the later cutover slice removes `Position.metadata.exitPlan`.
- `TradingSession` is now the first session contract slice. `TradingSessionService` starts a row from the existing discovery-lab apply-live-strategy flow, closes any prior active session as `REPLACED`, lists bounded session history, and now also owns explicit stop semantics through the backend seam.
- `TradingSession` rollups are bounded by `startedAt` and `stoppedAt`. Re-applying the same discovery-lab run creates a new session window instead of smearing trade counts or realized PnL across every later reuse of that run id.
- `StrategyPack.status` deployment ownership now lives under the session seam. `DiscoveryLabService` still syncs pack snapshots and versions, but it no longer decides which pack is `LIVE` by reading runtime settings directly.
- `create_views.sql` now also owns the partial unique index that enforces at most one active `TradingSession` row with `stoppedAt IS NULL`, alongside the existing one-open-position-per-mint index.
- No new reporting view was needed for the `TradingSession` slice. The `/api/views/:name` allowlist is unchanged in this pass.
- The first dedicated operator pack/run routes in this phase still read from the existing transition tables. No new schema or view was required for that pass because `DiscoveryLabPack`, `DiscoveryLabRun`, `StrategyPack`, `StrategyPackVersion`, and `TradingSession` already carry the facts those routes need.
- `DiscoveryLabRun.appliedToLiveAt` and `appliedConfigVersionId` are now part of the operator run contract too, not just an internal session/apply detail, so pack/run operator surfaces can show deployment state without guessing from settings.
- No schema or view change was required for the follow-up ownership pass either. The next plausible database-only change is additive indexing to support `TradingSession` rollups on `Position.liveStrategyRunId`, but that index was not forced into this pass.
- The follow-up run-ownership pass still did not justify schema churn. `TradingSession` rollups still read through `Position.liveStrategyRunId` plus `openedAt`, but the pass stayed additive-free until a measured query problem appears.
- `DiscoveryLabRun` is now the authoritative persisted read surface for run detail polling too, not just finished run history. While a run is active, stdout and stderr are written back into the row so database-backed readers stop drifting behind the file copy.
- Inline `DiscoveryLabRun` records backed by the synthetic `__inline__` pack id are still allowed for transition-time execution, but the session seam now rejects deploying them live. Save the draft into a real pack first, then apply from that persisted pack/run contract.
- The phase-3 market/enrichment ownership pass also stayed additive-free. `MarketIntelService`, `MarketStrategyIdeasService`, and `TokenEnrichmentService` are service/API cuts over existing providers and cached facts; no Prisma table, SQL view, or allowlist change was required to ship that ownership move.
- The pack-grading/tuning ownership pass also stayed additive-free. `PackGradingService` grades persisted `DiscoveryLabRun` evidence and clones tuned drafts through `PackRepo`; no `StrategyRun`, `StrategyRunGrade`, schema, or SQL-view churn was justified for that slice.
- The database draft remains intentionally incomplete after the phase-6 pass:
  no `StrategyRun` or `StrategyRunGrade`,
  no broad promoted metadata-column sweep beyond `ExitPlan`,
  and no final strategy-pack/run grading tables yet.
- Discovery-lab compatibility reads for market stats, strategy ideas, and token insight no longer justify their own storage layer. They now sit over the dedicated market/enrichment service map, so any future schema churn should be driven by measured query or retention needs instead of preserving monolith-owned route behavior.
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
