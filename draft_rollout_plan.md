# Rollout Plan — Aggressive Parallel Agent Playbook

Companion to [draft_index.md](draft_index.md). Snapshot **2026-04-18**.

Two phases. Phase A is a **wave of 14 parallel work packages** — every WP is a self-contained PR a sub-agent can run end-to-end without coordinating with other agents. Phase B is sequential verification + promotion gates.

Each WP ships with:
- **Owner** — sub-agent type to spawn
- **Scope** — exact file paths
- **Acceptance** — binary pass/fail check
- **Prompt** — copy-paste brief for the sub-agent

---

## Guardrails (apply to every WP)

- Schema-only Prisma — no migration files, `prisma generate` only.
- Dual-write for 7 days on any metadata → column promotion.
- Never hand-edit emitted grafana JSON.
- Pack `LIVE` requires grade ∈ {A, B} — server-enforced.
- Adaptive off by default; operator opts in per session.
- Exit mutator gate: 30 paper exits at neutral-or-better PnL before mutator fires LIVE.
- SL uses the highest-priority lane; never throttle for cost.

---

## Phase A — Wave 1: 14 parallel work packages

Spawn all 14 in parallel worktrees. Each is independently mergeable. Cross-WP collisions are avoided by scope boundaries below.

Scope map (to prevent file collisions across agents):

| Area | File(s) | Owned by |
|---|---|---|
| `prisma/schema.prisma` | — | **WP1 only** |
| `prisma/views/create_views.sql` | — | **WP2 only** |
| `services/adaptive/*`, `engine/exit-engine.ts` | — | **WP3 only** |
| `services/discovery-lab-*.ts`, `services/workbench/discovery-lab-shared.ts` | — | **WP4 only** |
| `engine/graduation-engine.ts` filter-gate block | — | **WP5 only** |
| `services/helius/helius-watch-service.ts`, `api/routes/helius-*` (new) | — | **WP6 only** |
| `services/credit-forecast-service.ts`, `services/session/trading-session-service.ts` | — | **WP7 only** |
| `backend/scripts/seed-packs.mjs` (new), `services/workbench/strategy-pack-draft-validator.ts` | — | **WP8 only** |
| `api/routes/session-routes.ts` LIVE-flip guard, `services/session/live-guards.ts` (new) | — | **WP9 only** |
| `dashboard/components/results-board.tsx` → split | — | **WP10 only** |
| `grafana/provisioning/alerting/*.yaml` (new) | — | **WP11 only** |
| `docker-compose.yml`, `grafana/compose.env*` | — | **WP12 only** |
| `dashboard/app/market/token/[mint]/*` panel components | — | **WP13 only** |
| `backend/tests/**` (new service tests) | — | **WP14 only** |

If two WPs would touch the same file, the one not listed above defers and files an issue rather than editing.

---

### WP1 — Schema deltas

**Owner:** `schema-migrator` (use `Agent` with `subagent_type: general-purpose`, model `haiku`).
**Scope:** [trading_bot/backend/prisma/schema.prisma](trading_bot/backend/prisma/schema.prisma).
**Acceptance:** `prisma generate` clean; new models compile; no migration files added.

**Prompt:**
> Add three Prisma models to `trading_bot/backend/prisma/schema.prisma` per the specs in [draft_database_plan.md §3.1–3.3](draft_database_plan.md): `ExitPlanMutation`, `ConfigReplay`, `ThresholdSearchRun`, `ThresholdSearchTrial`. Add the reciprocal relation fields on `Position` and `ExitPlan` and `StrategyPack`. Run `cd trading_bot/backend && npx prisma generate`. Do not create any files under `prisma/migrations/`. Commit: `schema: add ExitPlanMutation, ConfigReplay, ThresholdSearch*`.

---

### WP2 — Views backfill

**Owner:** `schema-migrator` (haiku). **Scope:** [trading_bot/backend/prisma/views/create_views.sql](trading_bot/backend/prisma/views/create_views.sql). **Acceptance:** 14 new `CREATE VIEW` statements, file parses, every view referenced in §4 of `draft_database_plan.md` exists.

**Prompt:**
> Append 14 views to `trading_bot/backend/prisma/views/create_views.sql`. Names + required columns are in [draft_database_plan.md §4](draft_database_plan.md): `v_runtime_live_status`, `v_runtime_lane_health`, `v_open_position_monitor`, `v_candidate_funnel_daily_source`, `v_candidate_latest_filter_state`, `v_position_exit_reason_daily`, `v_recent_fill_activity`, `v_submit_lane_daily`, `v_exit_plan_mutation_daily`, `v_mutator_outcome_daily`, `v_enrichment_freshness`, `v_enrichment_quality_daily`, `v_strategy_pack_exit_profile_mix`, `v_kpi_by_config_window`. Every view filters on a `bucket` column and exposes `strategyPackId` + `configVersion` where relevant. Study existing view style in the file. Verify with `psql -f` if possible; otherwise `node -e "require('fs').readFileSync('...')"` sanity check.

---

### WP3 — MutatorOutcome write-back

**Owner:** `adaptive-engine-builder`. **Scope:** [trading_bot/backend/src/engine/exit-engine.ts](trading_bot/backend/src/engine/exit-engine.ts), [trading_bot/backend/src/services/adaptive/adaptive-threshold-service.ts](trading_bot/backend/src/services/adaptive/adaptive-threshold-service.ts). **Acceptance:** Every position close writes 1+ `MutatorOutcome` rows; `AdaptiveThresholdService.mutateFilters` refuses LIVE firing when count < 30.

**Prompt:**
> Wire MutatorOutcome writes in `trading_bot/backend/src/engine/exit-engine.ts` at the close path: for each adaptive mutation that was applied to this position (read from `ExitPlanMutation` rows if WP1 landed, else from `AdaptiveThresholdLog`), insert a `MutatorOutcome` row with `positionId`, `mutatorCode`, `axis`, `beforeValue`, `afterValue`, `exitPnlUsd`, `verdict ∈ {HELPED,HURT,NEUTRAL}` (verdict := `HELPED` if realized > 0 and mutation reduced stop distance; `HURT` if realized < 0 and mutation widened stop or loosened filter; else `NEUTRAL`), `recordedAt`. Counterfactual is optional — leave null if not cheap. In `adaptive-threshold-service.ts`, before emitting a mutation in `settings.mode === 'LIVE'`, count `MutatorOutcome` rows for this `mutatorCode`; refuse emission if count < 30. Write one integration test at `trading_bot/backend/tests/adaptive/adaptive-threshold-gate.test.ts`.

---

### WP4 — Discovery-lab deletion

**Owner:** `backend-extractor`. **Scope:** delete 11 `services/discovery-lab-*.ts` files listed in [draft_backend_plan.md §2.2](draft_backend_plan.md), plus `services/workbench/discovery-lab-shared.ts`. Keep `DiscoveryLabPack`/`DiscoveryLabRun` tables and views untouched. **Acceptance:** `tsc` clean, no dangling imports, no re-export shims.

**Prompt:**
> Delete these services from `trading_bot/backend/src/services/`: discovery-lab-created-packs.ts, discovery-lab-manual-entry.ts, discovery-lab-market-regime-service.ts, discovery-lab-market-stats-service.ts, discovery-lab-service.ts, discovery-lab-strategy-calibration.ts, discovery-lab-strategy-suggestion-service.ts, discovery-lab-token-insight-service.ts, discovery-lab-workspace-packs.ts, discovery-lab-pack-types.ts, and services/workbench/discovery-lab-shared.ts. Before deleting each, grep for imports and migrate callers to the newer pack/session/workbench services (or delete the callers if they're only test code). Do not touch the `DiscoveryLabPack` / `DiscoveryLabRun` / `DiscoveryLabRunQuery` / `DiscoveryLabRunToken` Prisma models — they stay. Do not touch `v_discovery_lab_run_summary` / `v_discovery_lab_pack_performance` views. Run `cd trading_bot/backend && npx tsc --noEmit`. Ship one PR per group (packs, manual-entry, market-stats, services/strategy-*, workspace-packs, shared).

---

### WP5 — Evaluator → TokenEnrichmentService cutover

**Owner:** `enrichment-integrator`. **Scope:** [trading_bot/backend/src/engine/graduation-engine.ts](trading_bot/backend/src/engine/graduation-engine.ts) filter-gate block only. **Acceptance:** no direct Birdeye/Rugcheck calls inside `GraduationEngine`; all filter inputs flow from the bundle.

**Prompt:**
> In `trading_bot/backend/src/engine/graduation-engine.ts`, reroute the filter-gate block (currently reads `TokenMetrics` + ad-hoc provider data) to consume the unified bundle from `TokenEnrichmentService.load(mint)`. When `bundle.responsiveSourceCount < 4`, reject the candidate with `rejectReason: 'enrichment-degraded'`. Never fall back to ad-hoc calls if a field is missing — fail the specific filter closed. Measure before/after acceptance rates in a sandbox trial (log both; don't mutate DB). Write one integration test that covers: (a) all-sources-up → same decision as before, (b) one-source-degraded → graceful weight redistribution, (c) 3-sources-responded → reject. Do NOT touch the execution engine, exit engine, or market-intel service.

---

### WP6 — Helius webhook auto-provisioning + WS ownership

**Owner:** `helius-watcher`. **Scope:** [trading_bot/backend/src/services/helius/helius-watch-service.ts](trading_bot/backend/src/services/helius/helius-watch-service.ts), new `trading_bot/backend/src/api/routes/helius-admin-routes.ts`. **Acceptance:** boot reconciles existing webhooks; per-position webhook created on open / deleted on close; `/api/operator/helius/webhooks` GET+DELETE; 5+60 cap enforced.

**Prompt:**
> Extend `HeliusWatchService` in `trading_bot/backend/src/services/helius/helius-watch-service.ts`: add `reconcileAtBoot()` that calls `getAllWebhooks` and logs drift; add `ensurePositionWebhook(mint)` + `removePositionWebhook(mint)` using `createWebhook` / `deleteWebhook` via `HeliusClient`; enforce cap (5 per active position + 60 smart-wallet). Add a single shared enhanced-websocket connection owned by the service; expose `subscribe({ kind: 'holders'|'lp'|'price', mint })` returning an async iterator. Add new routes file `trading_bot/backend/src/api/routes/helius-admin-routes.ts` exposing `GET /api/operator/helius/webhooks` and `DELETE /api/operator/helius/webhooks/:id` (gated by auth middleware). Wire into `engine/runtime.ts` so position-open fires `ensurePositionWebhook` and position-close fires `removePositionWebhook`. One test at `tests/helius/helius-watch-service.test.ts` covers signature verify, replay dedupe, and cap enforcement.

---

### WP7 — Credit forecast session-start gate

**Owner:** `credit-bookkeeper`. **Scope:** [trading_bot/backend/src/services/session/trading-session-service.ts](trading_bot/backend/src/services/session/trading-session-service.ts), [trading_bot/backend/src/services/credit-forecast-service.ts](trading_bot/backend/src/services/credit-forecast-service.ts). **Acceptance:** session open blocks when projected burn > remaining budget unless `allowOverBudget: true`.

**Prompt:**
> In `TradingSessionService.open(...)`, call `CreditForecastService.projectForSession({ packId, expectedCandidatesPerHour, expectedHours, mode })` before persisting the session. If projection exceeds the Birdeye or Helius monthly budget (from env `BIRDEYE_MONTHLY_BUDGET` / `HELIUS_MONTHLY_BUDGET`), throw a `CreditBudgetExceeded` error unless `input.allowOverBudget === true`. On override, emit an `OperatorEvent { severity: 'warning', detail: 'over-budget session opened' }`. Add `projectForSession` to `CreditForecastService` if missing — compute MTD from `ProviderCreditLog`, add projected per-call cost × expected call count, compare to daily budget × days remaining. One test at `tests/services/credit-forecast-service.test.ts` covers the projection math against fixture rows.

---

### WP8 — Seed 10 packs script + draft validator

**Owner:** `adaptive-engine-builder`. **Scope:** new `trading_bot/backend/scripts/seed-packs.mjs`, existing [trading_bot/backend/src/services/workbench/strategy-pack-draft-validator.ts](trading_bot/backend/src/services/workbench/strategy-pack-draft-validator.ts). **Acceptance:** script is idempotent; 10 DRAFT `StrategyPack` rows with valid config JSON.

**Prompt:**
> Write `trading_bot/backend/scripts/seed-packs.mjs` that imports the 10 pack recipes from [draft_strategy_packs_v2.md §2](draft_strategy_packs_v2.md) and inserts them as `StrategyPack { status: 'DRAFT', grade: null }` rows plus one `StrategyPackVersion` row each with the recipe config JSON. Idempotent: skip by `name` if already present. Extend `strategy-pack-draft-validator.ts` to validate the composite weights sum ∈ [0.99, 1.01], no negatives, no weight on globally-disabled providers, and all required pack-config fields from the doc's §1 format. Run the validator over each seed recipe before insert. Do not auto-promote anything — all 10 stay DRAFT.

---

### WP9 — LIVE-mode guards (IP + 2FA + capital brake)

**Owner:** `backend-extractor`. **Scope:** [trading_bot/backend/src/api/routes/session-routes.ts](trading_bot/backend/src/api/routes/session-routes.ts), new `trading_bot/backend/src/services/session/live-guards.ts`. **Acceptance:** `mode=LIVE` flip blocked without IP allowlist + TOTP; manual entry > $100 blocked without second-confirmation field.

**Prompt:**
> Create `trading_bot/backend/src/services/session/live-guards.ts` exporting: `enforceIpAllowlist(req)` (reads `LIVE_MODE_ALLOW_IPS` env as CSV), `enforceTotp(req)` (verify 6-digit TOTP against `LIVE_MODE_TOTP_SECRET`), `enforceCapitalBrake(notionalUsd, confirmation)` (requires `confirmation === notionalUsd` when notional > 100). Wire in `api/routes/session-routes.ts` on any PATCH that sets `mode: 'LIVE'`, and in `api/routes/run-routes.ts` on the manual-entry POST. Return `403 { code: 'live-guard-failed', guard: '...' }` on violation. Tests at `tests/session/live-guards.test.ts`.

---

### WP10 — results-board decomposition

**Owner:** `dashboard-decomposer`. **Scope:** `trading_bot/dashboard/components/results-board.tsx` → split into three files. **Acceptance:** original file deleted; three new files; all existing pages that imported `ResultsBoard` import from the new location(s); typecheck clean.

**Prompt:**
> Split `trading_bot/dashboard/components/results-board.tsx` into three files under `trading_bot/dashboard/components/results/`: `run-grid.tsx` (AG Grid table), `candidate-drawer.tsx` (side drawer), `action-panel.tsx` (grade / apply-live buttons). Preserve props contracts. Update all importers in `app/**`. Delete the original monolithic file. Run `cd trading_bot/dashboard && pnpm typecheck` and fix imports. Do NOT change any behavior or styling — purely structural.

---

### WP11 — Grafana alert YAMLs

**Owner:** `grafana-builder`. **Scope:** new YAML files under `trading_bot/grafana/provisioning/alerting/`. **Acceptance:** 9 alert rules per [draft_grafana_plan.md §3](draft_grafana_plan.md); Grafana reloads clean; each rule has summary/description/runbook_url/dashboardUid/panelId annotations.

**Prompt:**
> Provision 9 Grafana alert rules as YAML under `trading_bot/grafana/provisioning/alerting/`: `session-alerts.yaml` (session_paused_5m), `execution-alerts.yaml` (exit_latency_p95_high, sl_bundle_fail_rate), `credit-alerts.yaml` (credit_burn_80pct, credit_burn_100pct, credit_slope_3x), `enrichment-alerts.yaml` (enrichment_source_degraded), `adaptive-alerts.yaml` (mutator_hurts_repeatedly), `lane-alerts.yaml` (webhook_cap_90pct). Conditions + severities + pending periods per [draft_grafana_plan.md §3](draft_grafana_plan.md). Each rule annotates `summary`, `description`, `runbook_url`, `__dashboardUid__`, `__panelId__`. All route to the ops notification policy. Rules reference views from WP2 — write them even if the views aren't live yet; Grafana will fail evaluation silently until views exist.

---

### WP12 — docker-compose hardening

**Owner:** `grafana-builder`. **Scope:** [trading_bot/docker-compose.yml](trading_bot/docker-compose.yml), `trading_bot/grafana/compose.env`, new `trading_bot/grafana/compose.secrets.env.example`. **Acceptance:** Grafana has resource limits + bind addr + secrets file; password removed from tracked env file.

**Prompt:**
> Edit `trading_bot/docker-compose.yml`: add `deploy.resources.limits: { cpus: '0.25', memory: '512M' }` on the grafana service; set `environment.GF_SERVER_HTTP_ADDR: ${GF_SERVER_HTTP_ADDR:-127.0.0.1}`; add `env_file: [./grafana/compose.env, ./grafana/compose.secrets.env]`. Remove `GF_SECURITY_ADMIN_PASSWORD` from tracked `trading_bot/grafana/compose.env`. Create `trading_bot/grafana/compose.secrets.env.example` with a placeholder password + TOTP secret and note in the file that real secrets go in a gitignored `compose.secrets.env`. Add `trading_bot/grafana/compose.secrets.env` to `.gitignore`. Do NOT touch loki/promtail.

---

### WP13 — Market page 8 panels

**Owner:** `dashboard-decomposer`. **Scope:** `trading_bot/dashboard/app/market/token/[mint]/*` (page + new components). **Acceptance:** all 8 panels render from the bundle; each has a degraded-fallback state.

**Prompt:**
> Under `trading_bot/dashboard/app/market/token/[mint]/components/`, implement panel components consuming data from `/api/operator/enrichment/:mint`: `bundle-snipers-panel.tsx` (Trench: bundle %, sniper count, dev-bundle, top-5 wallets → Solscan), `cluster-map-panel.tsx` (Bubblemaps thumbnail + top-cluster %, red banner > 20%), `creator-history-panel.tsx` (Helius searchAssets + signatures: prior launches, rug rate), `pools-panel.tsx` (GeckoTerminal pools with age + LP split), `security-composite-ring.tsx` (0..1 score ring), `pumpfun-origin-panel.tsx` (replies, KOTH duration, grad ts, creator cashed %), `holder-velocity-sparkline.tsx` (from TokenMetrics snapshots), `smart-money-strip.tsx` (last 6 Cielo + Birdeye smart-money events). Each panel checks `bundle.sources[<name>].status` — on `degraded` render the copy from [draft_market_stats_upgrade.md §4.3](draft_market_stats_upgrade.md). Compose into `page.tsx`. Use existing shadcn/ag-grid primitives. Do NOT modify the API route or the enrichment service.

---

### WP14 — Minimum backend tests

**Owner:** any `general-purpose` agent. **Scope:** new files under `trading_bot/backend/tests/`. **Acceptance:** 6 new test files green per [draft_backend_plan.md §3](draft_backend_plan.md).

**Prompt:**
> Add 6 test files to `trading_bot/backend/tests/` following the same vitest-style pattern used by `tests/enrichment/*.test.ts`: `execution/swap-submitter.test.ts` (retry reason codes, lane attribution with mocked RPC), `execution/quote-builder.test.ts` (slippage math, quote freshness expiry), `session/trading-session-service.test.ts` (active-session uniqueness, pause/resume state machine), `workbench/pack-grading-service.test.ts` (A/B/C/D thresholds), `engine/graduation-engine.test.ts` (filter-gate composition with adaptive mutation), `enrichment/token-enrichment-service.test.ts` (fanout, cache hit/miss, degraded path, composite score formula). Use the real services with mocked providers. Do not touch production code — if a test reveals a bug, file it as a separate WP.

---

## Phase A kickoff

Spawn all 14 WPs concurrently. Example orchestration:

```
# in one Claude Code session:
# - send 14 Agent tool calls in a single message
# - each Agent gets its own worktree (isolation: "worktree")
# - each finishes to its own branch; merge sequentially via gh pr merge
```

Spawn them as separate agents so the main session stays clean. Don't wait — all 14 run in the background.

Expected duration if all 14 ship: a single working day for the main session orchestrator (most time is waiting on agent runs, not coordination).

---

## Phase B — Sequential verification + promotion

Each step depends on prior Phase A WPs landing.

### B1 — Intervention band + session forecast UI

**Depends on:** WP7 (credit gate), WP9 (LIVE guards).
**Owner:** `dashboard-decomposer`.

**Prompt:**
> Create `trading_bot/dashboard/components/intervention-band.tsx` showing `[Pack v#] [Config v#] [Mode] [Adaptive on/off] [Pause reason]` as always-visible chips. Consume `/api/operator/sessions/current`. Mount on the Session page and the Operational Desk overview. Then update the Session-open form to display the output of `CreditForecastService.projectForSession(...)` — red text + "over-budget" button copy when projection exceeds budget; require operator checkbox `allowOverBudget` to submit.

### B2 — Lint-dashboards + regenerate

**Depends on:** WP2 (views).
**Owner:** `grafana-builder`.

**Prompt:**
> Write `trading_bot/grafana/scripts/lint-dashboards.mjs` that walks `trading_bot/grafana/dashboards/**.json`, extracts SQL from every panel, extracts view names referenced (`FROM "v_..."`), and confirms each exists as a `CREATE VIEW` in `trading_bot/backend/prisma/views/create_views.sql`. Fail loudly on missing. Then run `node scripts/build-dashboards.mjs && node scripts/lint-dashboards.mjs`. Add a Turbo/npm script `lint:dashboards` and wire into root `package.json`. CI wiring is a follow-up ticket.

### B3 — 24 h paper soak

**Depends on:** WP3, WP5, WP6, WP7, WP11.
**Owner:** manual operator + `execution-builder` for diagnostics.

**Steps:**
1. Start a TradingSession in `mode=PAPER` with `adaptive.enabled=true` for 24 h.
2. Watch Session Overview, Exit RCA, Credit Burn, Adaptive Telemetry, Enrichment Quality dashboards.
3. Green criteria: no alert fires for > 15 m, SL "land rate" ≥ 0.95, credit burn within daily budget, `MutatorOutcome` rows accumulating.
4. Log under `notes/sessions/<date>-phase-a-soak.md`.

### B4 — Pack promotion loop

**Depends on:** WP8, B3 green.
**Owner:** `adaptive-engine-builder`.

- Promote each of the 10 seeded packs from DRAFT → TESTING via UI.
- Each runs 48 h sandbox.
- Auto-grade via `PackGradingService`.
- Packs grading A/B move to LIVE via UI with operator consent.
- `SMART_MONEY_RUNNER` additionally waits on 7 days `SmartWalletEvent` ingest counter.

### B5 — ProviderCreditLog rollup cron

**Depends on:** WP1 for `ProviderCreditDaily` table if added.
**Owner:** `credit-bookkeeper`.

**Prompt:**
> Write `trading_bot/backend/scripts/prisma-maintenance.mjs` that nightly at 04:00 UTC: (a) prunes `EnrichmentFact` rows where `updatedAt < now() - 7d`, (b) rolls up `ProviderCreditLog` rows older than 30 d into daily summaries and deletes source rows. Register in `n8n` (leave the workflow JSON under `trading_bot/n8n/workflows/prisma-maintenance.json`).

---

## Agent orchestration playbook

### Spawning Phase A

In a single message, issue 14 `Agent` tool calls (one per WP). Each agent gets:

- `subagent_type`: the owner type from the WP
- `isolation: "worktree"`: forces the agent into its own git worktree so they don't collide
- `prompt`: the WP's prompt block verbatim, prefixed with the scope line and acceptance line

Keep the orchestrator terse — let each agent self-report PR links back. Never read back into the orchestrator's context the full diff of any WP; only the acceptance checks.

### Merging

Merge order (low-risk first): WP14 (tests) → WP12 (compose) → WP11 (alerts) → WP1 (schema) → WP2 (views) → WP10 (UI split) → WP4 (delete) → WP13 (market panels) → WP9 (guards) → WP7 (credit gate) → WP8 (seed) → WP3 (mutator writes) → WP5 (evaluator) → WP6 (helius).

If a WP fails acceptance, don't block the wave — ship the others, re-spawn the failing WP fresh with error context attached to the prompt.

### Parallel ceiling

14 agents in parallel is the target. Lower if rate limits bite. Never serialize within Phase A unless an acceptance criterion literally depends on another WP's output (only WP2 ↔ B2 does).

### Agent prompt conventions

- Each prompt is self-contained — assume the agent has not read any other WP.
- File paths are absolute or unambiguous relative paths.
- "Do not touch X" clauses are load-bearing; include them to prevent drift.
- Every prompt ends with the acceptance line so the agent self-checks before declaring done.

---

## Acceptance for the whole rollout

- All 14 Phase A WPs merged; individual acceptance criteria green.
- B1 + B2 merged.
- B3 soak logged green.
- B4: all 10 packs in at least TESTING state; A/B graded packs LIVE.
- B5 cron registered and ran once successfully.
- Draft docs updated in the same PRs as the WPs that closed their items — or deleted if a draft becomes empty of remaining work.
