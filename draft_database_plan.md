# Database Plan — Schema, Views, Deletions

Companion to [draft_index.md](draft_index.md), [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md), [draft_backend_plan.md](draft_backend_plan.md).

**Scope:** Prisma 7 schema + PostgreSQL 16 views. Schema-only edits (per project rules — no hand-authored migrations). All new tables carry `createdAt` / `updatedAt` and FK indexes.

**Principle:** promote hot fields out of `metadata` JSON; make strategy packs first-class; back every Grafana panel with a committed view.

---

## 1. New tables

| Table | Purpose | Key columns |
|---|---|---|
| `StrategyPack` | First-class versioned pack (replaces hardcoded presets + dangling FKs) | `id`, `name`, `version`, `status (DRAFT\|TESTING\|GRADED\|LIVE\|RETIRED)`, `grade (A\|B\|C\|D\|F)`, `recipe` JSON, `baseFilters` JSON, `baseExits` JSON, `adaptiveAxes` JSON, `capitalModifier`, `sortColumn`, `sortOrder`, `publishedAt`, `createdBy` |
| `StrategyPackVersion` | Append-only history, enables rollback | `packId`, `version`, `configSnapshot` JSON, `parentVersion`, `notes` |
| `StrategyRun` | One test/live run of a pack vs. tape | `packId`, `packVersion`, `mode (SANDBOX\|LIVE\|DRY)`, `status`, `startedAt`, `completedAt`, `candidateCount`, `acceptedCount`, `winnerCount`, `realizedPnlUsd`, `gradeNotes` |
| `StrategyRunGrade` | Per-token grader verdict | `runId`, `mint`, `operatorVerdict (TRUE_POS\|FALSE_POS\|MISSED_EXIT\|GOOD_EXIT\|UNGRADED)`, `notes` |
| `ExitPlan` | Normalized exit config, replaces `Position.metadata.exitPlan` | `positionId UNIQUE`, `exitProfile`, 11 TP/SL/time fields, `derivedFromScore`, `strategyPackId` |
| `AdaptiveThresholdLog` | Every runtime mutation (telemetry) | `positionId?`, `candidateId?`, `axis`, `originalValue`, `mutatedValue`, `reasonCode`, `ctxJson`, `appliedAt` |
| `BundleStats` | Trench.bot / self-built bundle cache | `mint PK`, `bundleCount`, `bundleSupplyPct`, `devBundle`, `sniperCount`, `source`, `checkedAt`, `expiresAt` |
| `EnrichmentFact` | Polymorphic cache (Bubblemaps / Solsniffer / Jupiter / GeckoTerminal / Cielo / Pump.fun) | `mint`, `source` enum, `factType`, `payload` JSON, `fetchedAt`, `expiresAt`, composite index `(mint, source)` |
| `CreatorLineage` | Helius `searchAssets(creator)` cache | `creatorAddress PK`, `tokenCount24h`, `rugRate`, `fundingSource`, `lastSampledAt` |
| `SmartWallet` | Registry of tracked wallets for pack 2 | `address PK`, `label`, `pnlUsd`, `winRate`, `source`, `active`, `refreshedAt` |
| `SmartWalletEvent` | Webhook-ingested buys/sells | `walletAddress`, `mint`, `side`, `amountUsd`, `slot`, `txSig`, `receivedAt`, index `(mint, receivedAt)` |
| `TradingSession` | A live period where one pack is deployed | `packId`, `packVersion`, `previousPackVersion`, `mode`, `startedAt`, `stoppedAt`, `stoppedReason`, `realizedPnlUsd`, `tradeCount` |

## 2. Column promotions (kill metadata sprawl)

| Currently blob field | Promote to column on |
|---|---|
| `Candidate.metadata.entryScore`, `.exitProfile`, `.confidenceScore` | `Candidate.entryScore`, `.exitProfile`, `.confidenceScore` |
| `Position.metadata.exitPlan.*`, `.exitProfile` | **delete** — superseded by `ExitPlan` row |
| `Position.metadata.discoveryLabReportAgeMsAtEntry` (3 fields) | `Position.discoveryLabReportAgeMsAtEntry`, `...RunAgeMsAtEntry`, `...CompletionLagMsAtEntry` |
| `Fill.metadata.live.timing.*` (5 latency fields) | `Fill.quoteLatencyMs`, `...swapBuildLatencyMs`, etc. (partial column set exists — finish) |

Dual-write for ≥7 days before removing the metadata read path (see [draft_rollout_plan.md](draft_rollout_plan.md) guardrails).

## 3. Fix dangling FKs

- `Candidate.liveStrategyPackId` ([schema.prisma:161](trading_bot/backend/prisma/schema.prisma)) → real relation to `StrategyPack`.
- `DiscoveryLabRun.liveStrategyPackId` ([schema.prisma:241](trading_bot/backend/prisma/schema.prisma)) → real relation to `StrategyPack`.

## 4. Views — backfill the 20 missing

Grafana dashboards reference views that don't exist yet. Add in [create_views.sql](trading_bot/backend/prisma/views/create_views.sql):

**Daily aggregates:** `v_source_outcome_daily`, `v_candidate_cohort_daily`, `v_position_cohort_daily`, `v_position_exit_reason_daily`, `v_fill_pnl_daily`, `v_snapshot_trigger_daily`, `v_candidate_funnel_daily_source`.

**Hourly telemetry:** `v_api_provider_hourly`, `v_api_endpoint_hourly`, `v_payload_failure_hourly`.

**Live state:** `v_runtime_live_status`, `v_open_position_monitor`, `v_runtime_lane_health`, `v_recent_fill_activity`.

**Recent / detail:** `v_raw_api_payload_recent`, `v_token_snapshot_enriched`, `v_candidate_latest_filter_state`.

**Config impact:** `v_config_change_log`, `v_config_field_change`, `v_kpi_by_config_window`.

## 5. New views for pack workflow

- `v_strategy_pack_performance_daily` — `packId × day` → candidates, accepts, wins, avg winner %, avg loser %, realized PnL, EV.
- `v_strategy_pack_exit_profile_mix` — `packId × exit reason × profile` → counts.
- `v_adaptive_threshold_activity` — `axis × reasonCode × hour` → mutation counts; drives Adaptive Telemetry dashboard.
- `v_smart_wallet_mint_activity` — `mint × hour` rollup from `SmartWalletEvent` for the Smart-Money pack.
- `v_enrichment_freshness` — source × age buckets to diagnose stale caches.

Every view must include `config_version` (join on `ConfigSnapshot`) and `strategyPackId` for Grafana pack filter.

## 6. Deletions / consolidations

- `DiscoveryLabRun.metadata` — unused; drop.
- `DiscoveryLabRunToken.tradeSetup` — redundant once pack is first-class; drop after phase 2.
- `/api/candidates`, `/api/positions`, `/api/fills` — superseded by `/api/operator/*`; delete routes (keep tables).
- `/api/views/:name` — restrict to an allowlist of ≤6 views that dashboards actually query.

## 7. Acceptance criteria

- `npm run db:generate` succeeds.
- Existing tests green; no prod migration needed (schema-only).
- Every new table queried from Grafana is covered by a committed view.
- No new JSON blob reads from `Position.metadata.exitPlan` after phase 2 cutover.
- All new tables are indexed on the FK used by Grafana filters.
