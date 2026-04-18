# Bot-Trading Workflow Redesign — Audit Synthesis & Plan

Consolidates four parallel audits (db, backend, dashboard, grafana) into a single actionable plan. Companion to [draft_strategy_packs.md](draft_strategy_packs.md) (10 packs + adaptive engine) and [draft_market_stats_upgrade.md](draft_market_stats_upgrade.md) (free-API enrichment + bundle stats).

**Goal:** operator can test → edit → grade → launch a strategy pack end-to-end on one linear workflow; Helius + free APIs are used heavily; Grafana gives a single pane of glass; bloat is removed.

---

## 1. What's broken today (cross-cutting themes)

| Theme | Evidence | Impact |
|---|---|---|
| **Strategy packs aren't first-class DB objects** | Presets hardcoded in [strategy-presets.ts](trading_bot/backend/src/services/strategy-presets.ts); `Candidate.liveStrategyPackId` + `DiscoveryLabRun.liveStrategyPackId` are dangling string FKs to a table that doesn't exist | No versioning, no grading, no A/B test, no rollback |
| **Metadata blob sprawl** | `Position.metadata.exitPlan` (8 threshold fields), `Position.metadata.exitProfile`, `Candidate.metadata.entryScore`, `Fill.metadata.live.timing.*` all inside JSON blobs | Can't filter/group in Grafana; fragile to schema drift |
| **God objects** | graduation-engine 1281L, runtime 586L (13+ services, 4 timers), discovery-lab-service 1321L, operator-desk 1091L, results-board component 5722L | Hard to test, hard to extend with adaptive layer |
| **Workflow is scattered** | Strategy editing split across `/operational-desk/settings`, `/discovery-lab/config`, `/discovery-lab/studio`, `/discovery-lab/strategy-ideas` | Operator can't do test→grade→launch in one path |
| **Dead routes & redirect-only pages** | `/discovery-lab`, `/discovery-lab/overview`, `/discovery-lab/run-lab`, `/settings` all pure redirects | Cognitive clutter |
| **Helius underused** | Only 2 RPC methods wired (`getAccountInfo`, `getTokenLargestAccounts`); migration watcher is the only websocket | Missing: creator lineage, holder-dump detection, LP removal webhook, smart-money watcher, priority-fee estimator |
| **Free-API enrichment missing** | No Trench.bot, Bubblemaps, Solsniffer, Pump.fun public, Jupiter, GeckoTerminal, Cielo integrations | Bundle stats + cluster maps + creator history not available |
| **Duplicated singletons** | `ProviderBudgetService` and `SharedTokenFactsService` instantiated in both [runtime.ts:36](trading_bot/backend/src/engine/runtime.ts) and [graduation-engine.ts:54](trading_bot/backend/src/engine/graduation-engine.ts) | Cache doesn't converge; double book-keeping |
| **Grafana references 20 views that don't exist** | 9 dashboards provisioned via [dashboard-generator](trading_bot/grafana/src/dashboard-generator/index.mjs) but views like `v_source_outcome_daily`, `v_runtime_live_status`, `v_open_position_monitor` missing from [create_views.sql](trading_bot/backend/prisma/views/create_views.sql) | Several dashboards error on load |
| **No pack leaderboard / adaptive telemetry / live-session dashboard** | — | Can't compare packs; can't see adaptive mutators firing; no single-pane session health |

---

## 2. Target workflow (the user-visible promise)

One linear path in the dashboard:

```
[1] Pack Editor          →  [2] Sandbox Run        →  [3] Pack Grader        →  [4] Session Launcher
    edit filters/exits       run vs. live tape          review winners,           apply to LIVE or DRY,
    + adaptive axes          capture eval trace         mark good/false,          start/pause/revert,
    + enrichment toggles     no real capital            auto-suggest tuning       watch live health
```

Each step is one page, each page has one job. Data model, services, and routes below are designed for this.

---

## 3. Database plan

Single Prisma migration (schema-only, no migration files per project rules). All new tables have `createdAt/updatedAt` + FK indexes.

### 3.1 New tables

| Table | Purpose | Key columns |
|---|---|---|
| **`StrategyPack`** | First-class versioned packs (replaces hardcoded presets + dangling FKs) | `id`, `name`, `version`, `status (DRAFT\|TESTING\|GRADED\|LIVE\|RETIRED)`, `grade (A\|B\|C\|D\|F)`, `recipe` JSON, `baseFilters` JSON, `baseExits` JSON, `adaptiveAxes` JSON, `capitalModifier`, `publishedAt`, `createdBy` |
| **`StrategyPackVersion`** | Append-only history for rollback | `packId`, `version`, `configSnapshot` JSON, `parentVersion`, `notes` |
| **`StrategyRun`** | A single test run of a pack against live or historical tape | `packId`, `packVersion`, `mode (SANDBOX\|LIVE\|DRY)`, `status`, `startedAt`, `completedAt`, `candidateCount`, `acceptedCount`, `winnerCount`, `realizedPnlUsd`, `gradeNotes` |
| **`StrategyRunGrade`** | Per-token grading output from the grader | `runId`, `mint`, `operatorVerdict (TRUE_POS\|FALSE_POS\|MISSED_EXIT\|GOOD_EXIT\|UNGRADED)`, `notes` |
| **`ExitPlan`** | Normalized exit config (replaces `Position.metadata.exitPlan`) | `positionId UNIQUE`, `exitProfile`, all 11 TP/SL/time fields, `derivedFromScore`, `strategyPackId` |
| **`AdaptiveThresholdLog`** | Records each runtime mutation for telemetry | `positionId?`, `candidateId?`, `axis`, `originalValue`, `mutatedValue`, `reasonCode`, `ctxJson`, `appliedAt` |
| **`BundleStats`** | Trench.bot / self-built bundle cache | `mint PK`, `bundleCount`, `bundleSupplyPct`, `devBundle`, `sniperCount`, `source`, `checkedAt`, `expiresAt` |
| **`EnrichmentFact`** | Polymorphic cache for Bubblemaps / Solsniffer / Jupiter / GeckoTerminal / Cielo / Pump.fun | `mint`, `source` enum, `factType`, `payload` JSON, `fetchedAt`, `expiresAt`, composite index `(mint, source)` |
| **`CreatorLineage`** | Helius `searchAssets(creator)` cache | `creatorAddress PK`, `tokenCount24h`, `rugRate`, `fundingSource`, `lastSampledAt` |
| **`SmartWallet`** | Registry for pack 5 (Smart Money Follow) | `address PK`, `label`, `pnlUsd`, `winRate`, `source`, `active`, `refreshedAt` |
| **`SmartWalletEvent`** | Webhook-ingested wallet buys/sells | `walletAddress`, `mint`, `side`, `amountUsd`, `slot`, `txSig`, `receivedAt` |
| **`TradingSession`** | Wraps a period where a specific pack is live | `packId`, `packVersion`, `mode`, `startedAt`, `stoppedAt`, `stoppedReason`, `realizedPnlUsd`, `tradeCount` |

### 3.2 Column promotions (kill metadata sprawl)

| Currently in | Promote to real columns on |
|---|---|
| `Candidate.metadata.entryScore`, `.exitProfile`, `.confidenceScore` | `Candidate.entryScore`, `.exitProfile`, `.confidenceScore` |
| `Position.metadata.exitPlan.*`, `.exitProfile` | **delete** — replaced by `ExitPlan` row |
| `Position.metadata.discoveryLabReportAgeMsAtEntry` (3 fields) | `Position.discoveryLabReportAgeMsAtEntry`, `...RunAgeMsAtEntry`, `...CompletionLagMsAtEntry` |
| `Fill.metadata.live.timing.*` (5 latency fields) | `Fill.quoteLatencyMs`, `...swapBuildLatencyMs`, etc. (some already exist — finish the job) |

### 3.3 Fix dangling FKs

- [schema.prisma:161](trading_bot/backend/prisma/schema.prisma) and `:241` — `Candidate.liveStrategyPackId` + `DiscoveryLabRun.liveStrategyPackId` become real relations to `StrategyPack`.

### 3.4 Views — backfill the 20 missing

Grafana dashboards reference views that don't exist. Build these in [create_views.sql](trading_bot/backend/prisma/views/create_views.sql):

- **Daily aggregates:** `v_source_outcome_daily`, `v_candidate_cohort_daily`, `v_position_cohort_daily`, `v_position_exit_reason_daily`, `v_fill_pnl_daily`, `v_snapshot_trigger_daily`, `v_candidate_funnel_daily_source`
- **Hourly telemetry:** `v_api_provider_hourly`, `v_api_endpoint_hourly`, `v_payload_failure_hourly`
- **Live state:** `v_runtime_live_status`, `v_open_position_monitor`, `v_runtime_lane_health`, `v_recent_fill_activity`
- **Recent / detail:** `v_raw_api_payload_recent`, `v_token_snapshot_enriched`, `v_candidate_latest_filter_state`
- **Config impact:** `v_config_change_log`, `v_config_field_change`, `v_kpi_by_config_window`

**Pack leaderboard views** (new requirement):
- `v_strategy_pack_performance_daily` — packId × day → candidates, accepts, wins, avg winner %, avg loser %, realized PnL, EV
- `v_strategy_pack_exit_profile_mix` — packId × exit reason × profile → counts
- `v_adaptive_threshold_activity` — axis × reasonCode × hour → mutation counts (drives the adaptive dashboard)

### 3.5 Deletions / consolidations

- `DiscoveryLabRun.metadata` unused → drop.
- `DiscoveryLabRunToken.tradeSetup` redundant with `StrategyPack` once pack exists → drop.
- `/api/candidates`, `/api/positions`, `/api/fills` superseded by `/api/operator/*` → remove routes (not tables).
- `/api/views/:name` — restrict to an allowlist of 5–6 views actually used, not all 27.

---

## 4. Backend plan

### 4.1 New services (each ≤300 lines; small + testable)

| Service | Responsibility | Consumes |
|---|---|---|
| **`StrategyPackService`** | CRUD + version + grade + publish; owns `StrategyPack`/`Version`/`Run`/`RunGrade` | DB |
| **`AdaptiveThresholdService`** | Pure function: `mutate(baseFilters, baseExits, ctx) → { filters, exits, logEntries }`. Hooks into evaluator + exit engine. | `StrategyPack.adaptiveAxes`, live ctx (session regime, win rate, MC bucket, volume deltas) |
| **`TokenEnrichmentService`** | Single entry point for Rugcheck, DexScreener, Trench.bot, Bubblemaps, Solsniffer, Jupiter, GeckoTerminal, Pump.fun public, Cielo, Helius creator/holder calls. Owns `EnrichmentFact` + `BundleStats` + `CreatorLineage` caches with per-source TTL. | all providers |
| **`HeliusWatchService`** | Unifies all websocket/webhook subscriptions: migration logs (existing), smart-wallet tx, LP accounts, per-position dev wallet. Ingests into `SmartWalletEvent` + triggers exit engine. | Helius webhooks + laserstream |
| **`TradingSessionService`** | Start / stop / pause a session, applies pack to runtime-config atomically, records session stats. | `StrategyPackService`, `runtime-config` |
| **`PackGradingService`** | Turns a `StrategyRun` into suggested tuning: replays trace, computes rubric grade, recommends threshold deltas. | `StrategyRun`, `StrategyRunGrade`, winner stats |

### 4.2 Service consolidation (delete duplication)

- Move `ProviderBudgetService` + `SharedTokenFactsService` instantiation to `runtime.ts` only; inject into `GraduationEngine` via constructor. Removes the double bookkeeping between [runtime.ts:36](trading_bot/backend/src/engine/runtime.ts) and [graduation-engine.ts:54](trading_bot/backend/src/engine/graduation-engine.ts).
- `RugcheckClient` + `DexScreenerClient` move inside `TokenEnrichmentService` (current usage is already limited to discovery-lab).
- Extract from [graduation-engine.ts](trading_bot/backend/src/engine/graduation-engine.ts) (1281L): `DiscoveryLane`, `EvaluationLane`, `EntryScorer`, `FilterStack` — target <400L per file.
- Extract from [operator-desk.ts](trading_bot/backend/src/services/operator-desk.ts) (1091L): `HomePayloadBuilder`, `ShellBuilder`, `EventsBuilder`, `DiagnosticsBuilder` — one per screen.
- Extract from [discovery-lab-service.ts](trading_bot/backend/src/services/discovery-lab-service.ts) (1321L): `PackRepo` (file + DB I/O), `RunRunner` (subprocess), `RunReporter`. Pack storage goes to DB via `StrategyPackService` — files become export/import only.

### 4.3 Adaptive hook points (low-risk seams)

- **Evaluation:** inject `AdaptiveThresholdService.mutateFilters(ctx)` at [graduation-engine.ts:~1051](trading_bot/backend/src/engine/graduation-engine.ts) before `scoreEntrySignal`. Every mutation writes an `AdaptiveThresholdLog` row.
- **Exit plan build:** inject `AdaptiveThresholdService.mutateExits(ctx)` at `strategy-exit.ts:buildExitPlan` before return. Result persisted to `ExitPlan` row (not metadata).
- **Exit loop:** add a `liveMutators` pass in [exit-engine.ts](trading_bot/backend/src/engine/exit-engine.ts) that checks volume/buy-pressure deltas + smart-wallet exits, producing extra exit triggers. Gate behind `settings.exits.liveMutators.enabled`.

### 4.4 Helius expansion (5 concrete additions)

1. **Creator lineage**: `searchAssets(creator)` + `getSignaturesForAsset` → `CreatorLineage` cache. Runs once per new mint during evaluation.
2. **Holder-dump webhook**: per-position subscription on top-3 holder accounts; fires instant exit on >20% sell in <5m.
3. **LP removal webhook**: subscribe on Raydium/Meteora LP accounts associated with the position's pool.
4. **Smart-wallet tx stream**: `transactionSubscribe` on 40–60 wallets → `SmartWalletEvent` table → drives pack 5.
5. **Priority-fee estimator**: call `getPriorityFeeEstimate` pre-swap to size Jito tip dynamically instead of hardcoded constant.

### 4.5 API surface

**New operator routes:**
```
GET    /api/operator/packs                       list with filters (status, grade)
POST   /api/operator/packs                       create draft
GET    /api/operator/packs/:id                   full pack + version history
PATCH  /api/operator/packs/:id                   edit draft
POST   /api/operator/packs/:id/publish           move DRAFT→TESTING / GRADED→LIVE
POST   /api/operator/packs/:id/runs              start sandbox run
GET    /api/operator/packs/:id/runs              run history
POST   /api/operator/runs/:id/grade              submit per-token grades + finalize run grade
POST   /api/operator/runs/:id/suggest-tuning     PackGradingService output (deltas)
POST   /api/operator/sessions                    start live/dry session with pack
PATCH  /api/operator/sessions/:id                pause/resume/stop
GET    /api/operator/sessions/current            current session health
GET    /api/operator/enrichment/:mint            unified token card (bundle, cluster, creator, security)
GET    /api/operator/adaptive/activity           adaptive log feed (for telemetry panel)
```

**Deletions:** `/api/candidates`, `/api/positions`, `/api/fills` (legacy, unauthed), `/api/provider-payloads` (moves behind debug gate), narrow `/api/views/:name` to allowlist.

---

## 5. Dashboard plan

### 5.1 Information architecture (replaces current flat list)

```
Operational Desk
├── Overview          live health (existing, keep)
├── Trading           candidates + positions (existing, keep)
└── Settings          deployment only: capital, cadence, pauses, env
                      (strategy/filters/exits removed from here)

Strategy Workbench   (NEW — replaces fragmented discovery-lab)
├── Packs             library: grid of packs with grade, status, last run
├── Editor            one selected pack: filters, exits, adaptive axes, enrichment toggles
├── Sandbox           run the pack, live trace, candidate-by-candidate filter impact
├── Grader            last run's winners → operator verdict → auto-suggested tuning deltas
└── Sessions          launch/pause live, current session health, revert to prior pack version

Market Intel         (NEW — renamed & upgraded discovery-lab/market-stats)
├── Token Lookup      upgraded with Trench/Bubblemaps/Solsniffer/creator lineage panels
├── Trending          curated feed with smart-money activity strip
└── Watchlist         pinned mints
```

### 5.2 Routes to delete

- `/discovery-lab`, `/discovery-lab/overview`, `/discovery-lab/run-lab`, `/settings` (redirect-only)
- `/discovery-lab/config`, `/discovery-lab/strategy-ideas` (folded into Workbench/Editor and Grader)

### 5.3 Component refactor

- **`discovery-lab-results-board.tsx` (5722 lines)** — decompose into: `TokenResultsGrid`, `TokenInsightPanel`, `ManualEntryForm`, `MarketRegimeDisplay`, `RunTraceTimeline`. Server-side pagination on `/runs/:id/tokens?cursor=`.
- **`settings-client.tsx`** — split into `DeploymentSettingsForm` (desk) and the pack fields disappear (move to Editor).
- **`discovery-lab-client.tsx`** — retire; its responsibilities move to Packs/Editor/Sandbox.
- **`market-stats-client.tsx`** — virtual-scroll the token list, add enrichment panels (bundle, cluster, creator, security, pools).

### 5.4 New pages / components

| Page | Component | Key content |
|---|---|---|
| `/workbench/packs` | `PacksLibrary` | grade-filterable grid, one-click clone, archive |
| `/workbench/editor` | `PackEditor` | three panes: metadata, filter+exit forms, live candidate preview against last 10 min of tape |
| `/workbench/sandbox` | `SandboxRunner` | run controls, live-trace table, pack vs. baseline diff |
| `/workbench/grader` | `PackGrader` | per-token verdict UI, aggregate metrics, "apply suggested tuning" CTA |
| `/workbench/sessions` | `SessionLauncher` | current live pack card, health dials, pause/stop/revert, historical sessions |
| `/market/token/[mint]` | `TokenFullView` | all enrichment panels (Trench, Bubblemaps, Solsniffer, creator lineage, pools, smart-money strip) |

### 5.5 Trade/position view upgrades

Add to position detail:
- Exit plan visualization (SL / TP1 / TP2 markers on a price track)
- Adaptive mutation log for this position (which axes fired, when)
- Helius creator + bundle banner at entry time
- Latency cohort (this position's exec latency vs. last 100)
- PnL attribution (entry timing vs. exit timing vs. fee drag)

---

## 6. Grafana plan (high level)

Keep the 9 existing dashboards but rewire them once the 20 missing views ship. **Add 6 new dashboards:**

| Dashboard | Key panels | Primary views |
|---|---|---|
| **Pack Leaderboard** | Win rate, avg winner, avg loser, EV, hold-time, acceptance rate per pack; head-to-head pack A vs. B | `v_strategy_pack_performance_daily`, `v_kpi_by_config_window` |
| **Candidate Funnel** | Waterfall: discovered → queued → evaluated → accepted → bought → exited; rejection reason pie; hour-of-day buckets; source breakdown | `v_candidate_funnel_daily_source`, `v_candidate_decision_facts` |
| **Exit Reason RCA** | Exit reason histogram, realized PnL by reason, avg hold by exit profile, exit execution latency | `v_position_exit_reason_daily`, `v_recent_fill_activity` |
| **Provider Credit Burn** | Birdeye + Helius daily cost, cost per accepted candidate, cost per position, monthly forecast, endpoint ranking | `v_api_provider_daily`, `v_api_endpoint_efficiency`, `v_api_provider_hourly` |
| **Adaptive Telemetry** | Mutator firing rate by axis + reason, threshold drift over time, mutator→outcome correlation | `v_adaptive_threshold_activity`, joined with `v_position_pnl_daily` |
| **Live Session Health** | Lane status RAG, pause reason, open positions, cash exposure, last-fill age, stale-position alert, intervention band | `v_runtime_live_status`, `v_runtime_lane_health`, `v_open_position_monitor` |

Every view carries `config_version` + `strategyPackId` so every dashboard is filterable by pack and config epoch.

**docker-compose hardening:** add resource limits (`cpus: 0.25`, `memory: 512M`), configurable bind address, rotate admin password out of compose.env. Not urgent but should land with Grafana v2.

---

## 7. Phased rollout (concrete, sequenced)

Guardrails at every phase: no live-capital changes until phase 4; every phase is independently revertable.

### Phase 1 — Foundation (no behavior change)
- Prisma: add `StrategyPack`, `StrategyPackVersion`, `ExitPlan`, `AdaptiveThresholdLog`, `BundleStats`, `EnrichmentFact`, `CreatorLineage`, `SmartWallet`, `TradingSession`, `StrategyRun`, `StrategyRunGrade`. Fix dangling FKs.
- Column promotions: `Candidate.entryScore/exitProfile`, `Position.discoveryLabReportAge*`, finish `Fill.*LatencyMs` promotion.
- Backfill 20 missing Grafana views; add 3 pack-specific views.
- Run `npm run db:generate`. All existing tests green.
- **Guardrail:** dual-write (metadata + new columns) for one week, then read from columns only.

### Phase 2 — Pack as first-class object (internal only)
- `StrategyPackService` CRUD; import the 3 existing presets into `StrategyPack` rows (version 1, status LIVE).
- Graduation engine reads pack config from DB, falls back to hardcoded constants. Remove hardcoded constants after one week of parity.
- `ExitPlan` row written at position open; exit-engine reads from `ExitPlan` with fallback to metadata. Remove metadata path after parity.
- Delete duplicated `ProviderBudgetService`/`SharedTokenFactsService` instantiations. Collapse `graduation-engine.ts` into lanes.

### Phase 3 — Enrichment & Helius expansion
- `TokenEnrichmentService` with Trench.bot + Bubblemaps + Solsniffer + Pump.fun public + Jupiter + GeckoTerminal + Cielo clients. All behind feature flags.
- `HeliusWatchService` — start with creator-lineage on-demand, then add LP-removal webhook, holder-dump webhook. Smart-wallet stream deferred to phase 5.
- Upgrade market stats page + token detail view to surface new data.
- `/api/operator/enrichment/:mint` as the one endpoint the dashboard hits.

### Phase 4 — Workbench UI
- New routes: `/workbench/packs`, `/editor`, `/sandbox`, `/grader`, `/sessions`, `/market/token/[mint]`.
- Decompose `results-board.tsx`. Add server-side pagination to run tokens endpoint.
- Wire `PackGradingService` suggestions into grader page.
- Delete redirect-only routes + `discovery-lab/config` + `discovery-lab/strategy-ideas`.
- **Guardrail:** `TradingSession.start` requires explicit operator confirmation; `mode=LIVE` adds an IP + 2FA gate.

### Phase 5 — Adaptive engine + 10 new packs
- `AdaptiveThresholdService` wired into evaluator and exit-engine, gated `settings.adaptive.enabled=false` by default.
- Seed packs 4–10 as `StrategyPack` rows, status DRAFT. Run each in sandbox for 48h before promoting to TESTING.
- Exit-mutators ship last (live capital touch); require 30 paper exits per mutator showing neutral-or-better PnL.
- Smart-wallet stream + pack 5 go live once `SmartWalletEvent` has 7 days of clean ingestion data.

### Phase 6 — Grafana v2
- Ship the 6 new dashboards. Harden docker-compose. Add pack filter + config-version filter to every panel.

---

## 8. Sub-agent delegation map (keeping this modular)

Each phase is small enough to delegate to a focused sub-agent. Suggested split:

| Agent role | Owns |
|---|---|
| **schema-migrator** | Phase 1: Prisma edits, view SQL, `db:generate`, dual-write verification |
| **backend-extractor** | Phase 2 refactors (lane extraction, singleton collapse, pack import) |
| **enrichment-integrator** | Phase 3 clients + `TokenEnrichmentService` + `HeliusWatchService` (non-capital) |
| **dashboard-decomposer** | Phase 4 component split (`results-board.tsx`) + new workbench routes |
| **adaptive-engine-builder** | Phase 5 `AdaptiveThresholdService` + pack seeds + exit mutators (capital-touching, extra review) |
| **grafana-builder** | Phase 6 dashboard JSON + view additions |
| **session-briefer** (existing) | pre-phase brief using `.agents/skills/session-brief` |
| **research-scout** (existing) | one-off provider API spot-checks (Trench, Bubblemaps endpoint changes) |

Each agent gets: this doc + the specific phase block + the three companion docs (`draft_strategy_packs.md`, `draft_market_stats_upgrade.md`, `draft_workflow_redesign.md`) + read access only to their phase's files.

---

## 9. Guardrails (what must not break)

1. **No live-capital code path changes in phases 1–3.** Only reads, writes-behind-flag, and dual-write verification.
2. **Pack publish to LIVE is an explicit two-step**: `publish(pack → TESTING)` then `startSession(pack, mode=LIVE)` with operator confirmation. No silent promotion.
3. **Rollback is always one call:** every `TradingSession` stores `previousPackVersion`; `revert` re-applies it to runtime-config.
4. **Every metadata-column promotion is dual-write for ≥7 days** before the blob path is removed.
5. **Exit-engine live mutators** ship behind `settings.exits.liveMutators.enabled`, paper-verified on 30 exits per mutator before live.
6. **Webhook churn ceiling:** cap Helius webhooks at 5/active-position + 60 smart-wallet. Exceeding cap = dashboard warning, not silent failure.
7. **Pack grade propagation:** a pack can only be `status=LIVE` if `grade ∈ {A,B}`. Enforced at API layer, not trusted to UI.
8. **Capital brake still owns the last word:** `RiskEngine.canOpenPosition` stays authoritative; adaptive sizing only multiplies downward within its bounds.

---

## 10. What I want you to confirm before we start

1. **Phase order OK?** Specifically: want me to do 4 (Workbench UI) before 5 (adaptive) so you have a place to manage adaptive rollout from — or flip them?
2. **Pack import:** import the existing 3 presets as `StrategyPack` rows, or wipe and seed all 10 from scratch?
3. **Smart-money (pack 5):** build in phase 3 with webhook plumbing, or defer to phase 5? Adds ~1 week.
4. **Grafana:** extend the auto-generator in [dashboard-generator/index.mjs](trading_bot/grafana/src/dashboard-generator/index.mjs), or hand-author the new 6 dashboards?
5. **Notion/Obsidian integration:** you had a skills stack earlier — do you want pack grades + session recaps auto-posted somewhere, or keep it DB-only?

Pick answers and I'll start with phase 1 (schema + views). Everything in phase 1 is reversible — zero live-capital risk — so it's the right first commit.
