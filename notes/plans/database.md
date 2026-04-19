# Database Plan — Schema + Views Remaining

Companion to [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

This plan only covers deltas. The current schema is [trading_bot/backend/prisma/schema.prisma](trading_bot/backend/prisma/schema.prisma) (~970 lines, 47 models + enums). The current views are [trading_bot/backend/prisma/views/create_views.sql](trading_bot/backend/prisma/views/create_views.sql) (~696 lines, 23 views).

## Audit adjustments

- `ExitPlanMutation` is the only schema addition in this plan that directly unblocks active runtime/adaptive work.
- `ConfigReplay` and `ThresholdSearch*` are still reasonable ideas, but they are not on the shortest path to a safer trading/runtime stack and should not block the current rollout.
- `ProviderCreditDaily` is referenced later in the credit/maintenance plans but is not yet designed here; keep rollup work deferred until that contract is explicit.

---

## 1. Migration policy

- **No Prisma migrations.** The project uses `db push` only. Never add a file under `prisma/migrations/`.
- Schema edits are done in `schema.prisma` + `prisma generate` only. Operators sync their dev DB with `prisma db push`.
- Views are managed separately — edits go into `create_views.sql` and are run manually against Postgres. A view drop + replace is safe; never CASCADE a table.
- Dual-write any metadata → column promotion for ≥ 7 days before removing the metadata side. This policy has caught misreads twice in prior phases.
- When adding enums, keep them in `schema.prisma` only; Postgres auto-creates the native enum on `db push`.

---

## 2. Tables already landed (reference)

Confirm with `grep '^model' schema.prisma` before planning. Already present:

- **Core trade path**: `TokenMetrics`, `Candidate`, `Position`, `Fill`, `BotState`, `RuntimeConfig`, `RuntimeConfigVersion`.
- **Pack + session**: `StrategyPack`, `StrategyPackVersion`, `ExitPlan`, `TradingSession`.
- **Discovery lab (legacy, slated for deletion)**: `DiscoveryLabPack`, `DiscoveryLabRun`, `DiscoveryLabRunQuery`, `DiscoveryLabRunToken`.
- **Enrichment**: `BundleStats`, `EnrichmentFact`, `CreatorLineage`.
- **Provider telemetry**: `ProviderCreditLog`, `ApiEvent`, `RawApiPayload`.
- **Execution + adaptive**: `FillAttempt`, `MutatorOutcome`, `AdaptiveThresholdLog`.
- **Smart money**: `SmartWallet`, `SmartWalletEvent`, `SmartWalletFunding`.
- **Shared facts**: `SharedTokenFact`, `SharedTokenFactMigrationSignal`.
- **Events**: `OperatorEvent`, `ExitEvent`.

Enums landed: `CandidateStatus`, `PositionStatus`, `FillSide`, `DiscoveryLabRunStatus`, `DiscoveryLabPackKind`, `StrategyPackStatus`, `StrategyPackGrade`, `ExitPlanProfile`, `TradingSessionMode`, `SmartWalletEventSide`, `ProviderName`, `ProviderSource`, `ProviderPurpose`, `SubmitLane`, `MutatorVerdict`, `WalletFundingSource`.

---

## 3. Tables to add

### 3.1 `ExitPlanMutation`

Tracks each adaptive change applied to a live `ExitPlan`. Powers `v_exit_plan_mutation_daily` and the Adaptive Telemetry dashboard.

```prisma
model ExitPlanMutation {
  id          BigInt   @id @default(autoincrement())
  positionId  BigInt
  exitPlanId  BigInt
  axis        String   // "stopLossPercent", "trailingStopPercent", etc.
  beforeValue Float?
  afterValue  Float?
  reason      String   // operator | adaptive | pack-version-bump
  mutatorCode String?
  appliedAt   DateTime @default(now())
  position    Position @relation(fields: [positionId], references: [id])
  exitPlan    ExitPlan @relation(fields: [exitPlanId], references: [id])

  @@index([positionId, appliedAt])
  @@index([mutatorCode, appliedAt])
}
```

Writers: adaptive engine (mutator apply), exit engine (operator manual override), pack route (version bump propagation).

### 3.2 `ConfigReplay`

Records a replay of a prior config-version against current telemetry — used by the Config Impact dashboard and the "what-if" tool in the session page.

Status: defer until the current session/operator flows stabilize.

```prisma
model ConfigReplay {
  id                 BigInt   @id @default(autoincrement())
  fromConfigVersion  Int
  toConfigVersion    Int
  replayedAt         DateTime @default(now())
  candidatesCovered  Int
  summaryJson        Json     // counts, deltas, rejection-reason diff
  operatorId         String?

  @@index([replayedAt])
  @@index([fromConfigVersion, toConfigVersion])
}
```

No live-capital impact. Writer: a new `ConfigReplayService` invoked from the settings page.

### 3.3 `ThresholdSearchRun` + `ThresholdSearchTrial`

Offline threshold-search harness. Blocks only pack-tuning UI — not urgent.

Status: defer. Do not mix this with the immediate runtime/Grafana/credit path.

```prisma
model ThresholdSearchRun {
  id          BigInt   @id @default(autoincrement())
  packId      BigInt
  startedAt   DateTime @default(now())
  completedAt DateTime?
  objective   String   // "maxEV" | "maxSharpe" | "minDrawdown"
  status      String   // "running" | "complete" | "failed"
  trials      ThresholdSearchTrial[]
  pack        StrategyPack @relation(fields: [packId], references: [id])
}

model ThresholdSearchTrial {
  id         BigInt   @id @default(autoincrement())
  runId      BigInt
  params     Json     // axis → value
  ev         Float
  winRate    Float
  avgWinner  Float
  avgLoser   Float
  sampleSize Int
  run        ThresholdSearchRun @relation(fields: [runId], references: [id])

  @@index([runId, ev])
}
```

Writer: a background worker in the workbench service.

---

## 4. Views to backfill

Each dashboard panel cites its view in the panel description. Dashboards fail loudly when the view is missing — ship view before panel.

| View | Consumer | Columns (minimum) |
|---|---|---|
| `v_runtime_live_status` | Session Overview | `sessionId, packId, packVersion, mode, status, pauseReason, capitalFreeUsd, openCount, lastFillAt` |
| `v_runtime_lane_health` | Session Overview, Exit RCA | `bucket, lane, attempts, successes, failures, p95LatencyMs, webhookUsage` |
| `v_open_position_monitor` | Session Overview | `positionId, mint, entryAt, ageSec, unrealizedPnlUsd, exitProfile, nextTrigger` |
| `v_candidate_funnel_daily_source` | Candidate Funnel | `bucket, source, discovered, queued, evaluated, accepted, filled, exited` |
| `v_candidate_latest_filter_state` | Candidate Funnel | `candidateId, filterName, passed, value, threshold, evaluatedAt` |
| `v_position_exit_reason_daily` | Exit RCA | `bucket, exitReason, count, avgHoldSec, avgPnlUsd, exitLatencyP95Ms` |
| `v_recent_fill_activity` | Exit RCA, Session Overview | `fillId, positionId, side, lane, submittedAt, landedAt, latencyMs, retries` |
| `v_submit_lane_daily` | Exit RCA | `bucket, lane, attempts, landed, landRate, avgRetries, topFailureCode` |
| `v_exit_plan_mutation_daily` | Adaptive Telemetry | `bucket, axis, mutatorCode, applies, helped, hurt, neutral, avgDelta` |
| `v_mutator_outcome_daily` | Adaptive Telemetry | `bucket, mutatorCode, axis, verdictCounts, avgPnlDelta, counterfactualDelta` |
| `v_enrichment_freshness` | Enrichment Quality | `source, staleRatio, medianAgeSec, maxAgeSec` |
| `v_enrichment_quality_daily` | Enrichment Quality | `bucket, source, successes, failures, cacheHits, p95LatencyMs` |
| `v_strategy_pack_exit_profile_mix` | Pack Leaderboard | `packId, profile, positions, avgPnlUsd` |
| `v_kpi_by_config_window` | Pack Leaderboard | `configVersion, packId, windowStart, windowEnd, wr, ev, avgWinner, avgLoser` |

All views filter on `$__timeFilter(bucket)` and expose `strategyPackId` + `configVersion` columns so the grafana variables work uniformly.

---

## 5. Index adds (on existing tables)

As the views above come in, check `EXPLAIN ANALYZE` and add:

- `ProviderCreditLog(createdAt, providerName, purpose)` — scans in forecast queries.
- `FillAttempt(positionId, createdAt)` — scans in `v_recent_fill_activity`.
- `MutatorOutcome(mutatorCode, recordedAt)` — scans in `v_mutator_outcome_daily`.
- `SmartWalletEvent(mint, createdAt)` — scans on `/market/token/:mint`.

Only add the index after the view is live and a slow query is confirmed. Don't speculate.

---

## 6. Daily maintenance jobs

New `prisma-maintenance` cron (runs daily at 04:00 UTC):

- Prune `EnrichmentFact` rows where `updatedAt < now() - 7d`.
- Rollup `ProviderCreditLog` rows older than 30 d into a daily summary table only after `ProviderCreditDaily` is explicitly designed and landed.
- Refresh any `MATERIALIZED VIEW` we add (none today; flagged for the day one is needed).

Ship as a single script at `trading_bot/backend/scripts/prisma-maintenance.mjs`, invoked from `n8n`.

---

## 7. Parallel Work Packages

Cross-refs: [implementation-plan.md](implementation-plan.md) WPs are the source of truth — these blocks are the DB-surface slice of that plan, self-contained for a sub-agent.

### WP-DB-1 — Schema deltas (= rollout WP1)

**Owner:** `schema-migrator` (haiku).
**Scope:** [trading_bot/backend/prisma/schema.prisma](trading_bot/backend/prisma/schema.prisma) only.
**Acceptance:** `cd trading_bot/backend && npx prisma generate` exits 0; no files under `prisma/migrations/`; reciprocal relations compile on `Position`, `ExitPlan`, `StrategyPack`.

**Prompt:**
> Add three Prisma models to `trading_bot/backend/prisma/schema.prisma` per §3.1–3.3 of [database.md](database.md): `ExitPlanMutation`, `ConfigReplay`, `ThresholdSearchRun`, `ThresholdSearchTrial`. Add reciprocal relation fields on `Position.exitPlanMutations`, `ExitPlan.mutations`, `StrategyPack.thresholdSearchRuns`. Run `cd trading_bot/backend && npx prisma generate`. Never create files under `prisma/migrations/`. Do not touch views. Commit: `schema: add ExitPlanMutation, ConfigReplay, ThresholdSearch*`.

### WP-DB-2 — 14 views backfill (= rollout WP2)

**Owner:** `schema-migrator`.
**Scope:** [trading_bot/backend/prisma/views/create_views.sql](trading_bot/backend/prisma/views/create_views.sql) only (append to bottom).
**Acceptance:** file parses via `psql -f`; every view in §4 of this plan exists as a `CREATE OR REPLACE VIEW`; every view exposes `bucket`, `strategyPackId`, `configVersion` where noted.

**Prompt:**
> Append 14 views to `trading_bot/backend/prisma/views/create_views.sql`. List + required columns in §4 of [database.md](database.md). Match the `CREATE OR REPLACE VIEW` style of the 23 existing views (look at `v_api_provider_daily` as the canonical pattern). Each view filters on a `bucket` column and exposes `strategyPackId` + `configVersion` columns where relevant (so Grafana variables work uniformly). Validate with `psql -f create_views.sql` against a scratch DB if available, else parse sanity check via `node -e "console.log(require('fs').readFileSync('prisma/views/create_views.sql','utf8').length)"`.

### WP-DB-3 — Index adds (post-soak, conditional)

**Owner:** `schema-migrator`.
**Scope:** [schema.prisma](trading_bot/backend/prisma/schema.prisma) — add `@@index` directives only.
**Acceptance:** only shipped after a slow query is confirmed on the target view; `EXPLAIN ANALYZE` before/after captured in the session log.

**Prompt:**
> Add the four indexes listed in §5 of [database.md](database.md) to `schema.prisma` — but only after Phase B3 (24 h paper soak) has surfaced the slow query. For each index, run `EXPLAIN ANALYZE` on the binding view before and after; paste both into `notes/sessions/<date>-index-adds.md`. Do not add any index speculatively. If a query is under 100 ms warm, skip that index.

### WP-DB-4 — Maintenance cron (= rollout B5)

**Owner:** `credit-bookkeeper`.
**Scope:** new [trading_bot/backend/scripts/prisma-maintenance.mjs](trading_bot/backend/scripts/prisma-maintenance.mjs), new `trading_bot/n8n/workflows/prisma-maintenance.json`.
**Acceptance:** script is idempotent; one dry run logs intended deletions without executing when `--dry-run`.

**Prompt:**
> Write `trading_bot/backend/scripts/prisma-maintenance.mjs` that (a) deletes `EnrichmentFact` rows where `updatedAt < now() - interval '7 days'`, (b) rolls up `ProviderCreditLog` rows older than 30 d into a `ProviderCreditDaily` table then deletes the source rows, (c) refreshes any `MATERIALIZED VIEW` (none today; log a no-op). Accept `--dry-run` to print counts without mutating. Register the workflow at `trading_bot/n8n/workflows/prisma-maintenance.json` to run 04:00 UTC daily. Depends on WP-DB-1 landing the `ProviderCreditDaily` model — if absent, add it in this PR matching the same shape as `ProviderCreditLog` grouped by day+provider+purpose.

---

## 8. Acceptance

- `prisma generate` is clean after each schema edit.
- `psql \df` lists every view named above.
- No dashboard panel references a view missing from `create_views.sql` (enforced by the lint in [grafana.md §3.8](grafana.md)).
- Every new table has at least one writer in the backend code — no schema-only additions that stay empty.
