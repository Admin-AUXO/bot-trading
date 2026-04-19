# Backend Plan — Service Ownership + Remaining Wiring

Companion to [draft_rollout_plan.md §3.2–3.5](draft_rollout_plan.md). Snapshot **2026-04-18**.

This plan maps which service owns what, and what's still missing. Everything cited as "landed" corresponds to a real file in `trading_bot/backend/src/`.

---

## 1. Service ownership map (current reality)

| Area | Owner | File | Consumers |
|---|---|---|---|
| Jupiter quoting | `QuoteBuilder` | `services/execution/quote-builder.ts` | `LiveTradeExecutor` |
| Swap instruction build | `SwapBuilder` | `services/execution/swap-builder.ts` | `SwapSubmitter` |
| Send + retry + lane selection | `SwapSubmitter` | `services/execution/swap-submitter.ts` | `LiveTradeExecutor` |
| Priority fee estimate | `HeliusPriorityFeeService` | `services/helius/priority-fee-service.ts` | `SwapSubmitter` |
| Live execution orchestration | `LiveTradeExecutor` | `services/live-trade-executor.ts` | `ExecutionEngine` |
| Exit loop | `ExitEngine` | `engine/exit-engine.ts` | runtime |
| Entry/filter/reject | `GraduationEngine` | `engine/graduation-engine.ts` | runtime |
| Risk gates | `RiskEngine` | `engine/risk-engine.ts` | runtime |
| Adaptive context | `AdaptiveContextBuilder` | `services/adaptive/adaptive-context-builder.ts` | `GraduationEngine` |
| Adaptive mutator | `AdaptiveThresholdService` | `services/adaptive/adaptive-threshold-service.ts` | `GraduationEngine` |
| Trading session lifecycle | `TradingSessionService` | `services/session/trading-session-service.ts` | session-routes, runtime |
| Enrichment fanout + cache | `TokenEnrichmentService` | `services/enrichment/token-enrichment-service.ts` | market-intel, enrichment-routes, workbench |
| Provider budget slots | `ProviderBudgetService` | `services/provider-budget-service.ts` | every external client |
| Credit forecast | `CreditForecastService` | `services/credit-forecast-service.ts` | (not yet consumed) |
| Helius watch (webhooks + WS) | `HeliusWatchService` | `services/helius/helius-watch-service.ts` | runtime, webhook-routes, exit-engine |
| Pack repo + versions | `StrategyPackService` + `PackRepo` | `services/workbench/strategy-pack-service.ts` + `pack-repo.ts` | pack-routes |
| Pack grading | `PackGradingService` | `services/workbench/pack-grading-service.ts` | pack-routes, run-routes |
| Sandbox runs | `StrategyRunService` + `RunRunner` | `services/workbench/strategy-run-service.ts` + `run-runner.ts` | run-routes |
| Operator desk | `OperatorDesk` + `OperatorDeskBuilders` | `services/operator-desk.ts` + `services/desk/operator-desk-builders.ts` | desk-operator-routes |
| Market intel | `MarketIntelService` | `services/market/market-intel-service.ts` | market-routes |

The 8 enrichment clients are siblings under `services/enrichment/` — all exist with fixture-backed tests at `tests/enrichment/`.

---

## 2. Wiring gaps to close

### 2.1 MutatorOutcome writes (high priority)

No writer exists today. Grep confirms zero `mutatorOutcome.create` / `mutatorOutcome.upsert` call sites.

- Wire the write in `ExitEngine.close()` — after a position closes, walk `ExitPlanMutation` rows for this position (see [draft_database_plan.md §3.1](draft_database_plan.md)) and for each axis write a `MutatorOutcome` row with verdict `HELPED` / `HURT` / `NEUTRAL`.
- Counterfactual PnL: optional column — leave null unless the exit engine can cheaply recompute "what PnL would this have been at the pre-mutator threshold". If not cheap, ship without it; the dashboard tolerates null.
- Gate mutator firing in LIVE on the 30-paper-exits rule: `AdaptiveThresholdService.mutateFilters` must consult `MutatorOutcome` counts per `mutatorCode` and refuse to emit a LIVE mutation if count < 30.

### 2.2 Discovery-lab deletion

The following files predate the pack/session refactor and should be deleted once grep confirms no callers:

- `services/discovery-lab-created-packs.ts`
- `services/discovery-lab-manual-entry.ts`
- `services/discovery-lab-market-regime-service.ts`
- `services/discovery-lab-market-stats-service.ts`
- `services/discovery-lab-service.ts`
- `services/discovery-lab-strategy-calibration.ts`
- `services/discovery-lab-strategy-suggestion-service.ts`
- `services/discovery-lab-token-insight-service.ts`
- `services/discovery-lab-workspace-packs.ts`
- `services/discovery-lab-pack-types.ts`
- `services/workbench/discovery-lab-shared.ts`

Do not delete `DiscoveryLabPack` / `DiscoveryLabRun` tables — legacy data is still read by `v_discovery_lab_run_summary` and `v_discovery_lab_pack_performance`. Views stay; services go.

Approach: one PR per group (packs, manual-entry, market-stats, etc.) so each is revertable.

### 2.3 Helius watch expansion

Current state: `HeliusWatchService` (670 lines) ingests signed webhooks for smart-wallet, LP, and holders. Websocket path is skeletal.

Missing:
- Webhook provisioning at boot — call `createWebhook` for every active position up to the 5-per-position cap.
- Enhanced websocket subs routed through `HeliusWatchService` rather than ad-hoc. Today `ExitEngine` imports `SmartWalletMintActivity` from the watch service, but holder-delta / LP-change subscriptions are not centralized.
- Smart-wallet event stream: today the webhook fires on curated wallets; the 7-day clean-ingest counter powering the `SMART_MONEY_RUNNER` gate doesn't exist yet.
- `/api/operator/helius/webhooks` listing + delete endpoint for operator sanity checks.

See [draft_helius_integration.md](draft_helius_integration.md).

### 2.4 Enrichment as the evaluator contract

`TokenEnrichmentService` is consumed by market-intel + enrichment routes + workbench today. The **entry filter gates in `GraduationEngine` still read ad-hoc `TokenMetrics` + Birdeye values** rather than the unified enrichment bundle.

Route change:
1. `GraduationEngine.evaluate(candidate)` calls `TokenEnrichmentService.load(mint)` as step one.
2. The returned bundle is the single source for subsequent filter checks.
3. If bundle is degraded (< 4 sources responded), candidate is rejected with reason `enrichment-degraded` — never fall back to ad-hoc calls.

This is a behavior-preserving change if the enrichment bundle already aggregates the same fields the filters read. Verify by running a sandbox trial with and without the change and diffing rejection counts.

### 2.5 Adaptive defaults

Grep `settings.adaptive.enabled`:
- Default value in fresh configs — confirm `false`.
- Session-start check — refuse to open a LIVE session with `adaptive.enabled = true` unless the operator explicitly flips it on the Session page.
- The flip must cause a `RuntimeConfigVersion` bump so the change is attributable.

### 2.6 Credit forecast enforcement

`CreditForecastService` exists and computes projected burn from `ProviderCreditLog`. It's not wired.

Plan:
- On `TradingSessionService.open(...)`, call `CreditForecastService.projectForSession()` with the pack's expected credit cost per candidate × expected candidates per session-hour × session duration.
- If projection > remaining monthly budget, reject with `credit-budget-exceeded`. Operator override is an explicit `allowOverBudget: true` flag.
- Log every decision as an `OperatorEvent`.

### 2.7 Pack seeding (10 packs)

See [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) for the 10 recipes. Seed them as `StrategyPack` DRAFT rows in a one-shot migration script at `trading_bot/backend/scripts/seed-packs.mjs`. Each gets:

- `StrategyPack { name, kind, status: DRAFT, grade: null }`
- One `StrategyPackVersion` with the pack config JSON
- No associated runs — operator kicks off the 48 h sandbox from the UI

---

## 3. Test coverage targets

Currently only `tests/enrichment/*` is covered. Minimum for phase 6 done:

- `tests/execution/swap-submitter.test.ts` — retry reason codes, lane attribution via mocked RPC.
- `tests/execution/quote-builder.test.ts` — dynamic slippage math, quote freshness expiry.
- `tests/adaptive/adaptive-threshold-service.test.ts` — mutator composition, 30-paper-exits gate.
- `tests/session/trading-session-service.test.ts` — active-session uniqueness, pause/resume, mode transitions.
- `tests/helius/helius-watch-service.test.ts` — webhook signature verify, replay dedupe, 5+60 cap.
- `tests/workbench/pack-grading-service.test.ts` — A/B/C/D thresholds.
- `tests/services/credit-forecast-service.test.ts` — projection math.
- `tests/engine/graduation-engine.test.ts` — filter gate composition with adaptive mutation.

Harness: use the existing vitest-style runner used for enrichment tests. Keep fixtures under `tests/<area>/fixtures/`.

---

## 4. Parallel Work Packages

All backend-surface WPs. Reference [draft_rollout_plan.md](draft_rollout_plan.md) for the full wave definition; these blocks are self-contained for an agent that only opens this draft.

### WP-BE-1 — MutatorOutcome write-back (= rollout WP3)

**Owner:** `adaptive-engine-builder`.
**Scope:** [engine/exit-engine.ts](trading_bot/backend/src/engine/exit-engine.ts), [services/adaptive/adaptive-threshold-service.ts](trading_bot/backend/src/services/adaptive/adaptive-threshold-service.ts), new `tests/adaptive/adaptive-threshold-gate.test.ts`.
**Acceptance:** every position close writes ≥ 1 `MutatorOutcome` row; `AdaptiveThresholdService.mutateFilters` refuses LIVE firing when count < 30 for that `mutatorCode`.

**Prompt:**
> In `engine/exit-engine.ts` close path, for each adaptive mutation applied to this position (read from `ExitPlanMutation` rows if WP-DB-1 landed; else from `AdaptiveThresholdLog`), insert a `MutatorOutcome` row: `positionId`, `mutatorCode`, `axis`, `beforeValue`, `afterValue`, `exitPnlUsd`, `verdict` (`HELPED` if realized > 0 ∧ mutation tightened exit, `HURT` if realized < 0 ∧ mutation loosened, else `NEUTRAL`), `recordedAt`. Leave `counterfactualPnlUsd` null unless cheap. In `AdaptiveThresholdService.mutateFilters`, when `settings.mode === 'LIVE'`, query `MutatorOutcome` count per `mutatorCode` and refuse emission if < 30. Write one integration test at `tests/adaptive/adaptive-threshold-gate.test.ts` covering: (a) count 29 → refuse, (b) count 30 → emit, (c) PAPER mode bypasses gate.

### WP-BE-2 — Discovery-lab deletion (= rollout WP4)

**Owner:** `backend-extractor`.
**Scope:** 11 files under `services/discovery-lab-*.ts` + `services/workbench/discovery-lab-shared.ts` (exact list §2.2 above). Do NOT touch `DiscoveryLabPack`/`DiscoveryLabRun` Prisma models or `v_discovery_lab_*` views.
**Acceptance:** `cd trading_bot/backend && npx tsc --noEmit` clean; `grep -r "discovery-lab-" src/` returns zero matches outside the 11 deleted files.

**Prompt:**
> Delete the 11 files listed in §2.2 of [draft_backend_plan.md](draft_backend_plan.md). Before each delete, grep for importers and either migrate callers to `StrategyPackService` / `TradingSessionService` / `OperatorDesk` or delete the calling code if it's only test scaffolding. Keep the `DiscoveryLabPack` / `DiscoveryLabRun` / `DiscoveryLabRunQuery` / `DiscoveryLabRunToken` Prisma models and `v_discovery_lab_run_summary` / `v_discovery_lab_pack_performance` views untouched. Ship one PR per group: (a) packs + workspace-packs, (b) manual-entry, (c) market-stats + market-regime, (d) strategy-calibration + strategy-suggestion + token-insight, (e) service.ts + pack-types.ts, (f) workbench/discovery-lab-shared.ts. Run `npx tsc --noEmit` after each group.

### WP-BE-3 — Evaluator cutover (= rollout WP5)

**Owner:** `enrichment-integrator`.
**Scope:** [engine/graduation-engine.ts](trading_bot/backend/src/engine/graduation-engine.ts) filter-gate block only.
**Acceptance:** `grep -E "birdeyeClient|rugcheckClient|helius.*das" src/engine/graduation-engine.ts` returns zero direct hits; all filter inputs read from `TokenEnrichmentService.load(mint)`.

**Prompt:**
> In `engine/graduation-engine.ts`, replace the filter-gate's ad-hoc Birdeye/Rugcheck reads with `await tokenEnrichmentService.load(mint)`. Filters consume `bundle.fields`. If `bundle.responsiveSourceCount < 4`, reject with `rejectReason: 'enrichment-degraded'` — never fall back to ad-hoc calls. Log before/after acceptance counts in sandbox to a temp table for diffing (do not change DB schema). Write `tests/engine/graduation-engine-enrichment.test.ts` covering: all-sources-up (same decision), 1-source-degraded (weight redistribution preserves pass), 3-sources-responded (reject). Do NOT touch execution, exit, or market-intel services.

### WP-BE-4 — Credit forecast session-start gate (= rollout WP7)

**Owner:** `credit-bookkeeper`.
**Scope:** [services/session/trading-session-service.ts](trading_bot/backend/src/services/session/trading-session-service.ts), [services/credit-forecast-service.ts](trading_bot/backend/src/services/credit-forecast-service.ts), new `tests/services/credit-forecast-service.test.ts`.
**Acceptance:** session open blocks when projected burn > remaining budget unless `allowOverBudget: true`.

**Prompt:**
> Add `CreditForecastService.projectForSession({ packId, expectedCandidatesPerHour, expectedHours, mode })` returning `{ birdeye: { projectedMtd, monthlyBudget }, helius: {...} }`. Compute MTD from `ProviderCreditLog` + projected per-call cost × call count. Budgets from `BIRDEYE_MONTHLY_BUDGET` / `HELIUS_MONTHLY_BUDGET` env. In `TradingSessionService.open(...)`, call the projection before persisting; throw `CreditBudgetExceeded` unless `input.allowOverBudget === true`; on override emit `OperatorEvent { severity: 'warning', detail: 'over-budget session opened' }`. Test the math with fixture `ProviderCreditLog` rows.

### WP-BE-5 — 10 pack seed + validator extension (= rollout WP8)

**Owner:** `adaptive-engine-builder`.
**Scope:** new [trading_bot/backend/scripts/seed-packs.mjs](trading_bot/backend/scripts/seed-packs.mjs), [services/workbench/strategy-pack-draft-validator.ts](trading_bot/backend/src/services/workbench/strategy-pack-draft-validator.ts).
**Acceptance:** `node scripts/seed-packs.mjs` idempotent; 10 DRAFT rows + 10 `StrategyPackVersion` rows post-run.

**Prompt:**
> Write `trading_bot/backend/scripts/seed-packs.mjs` that imports the 10 pack recipes from §2 of [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) and inserts `StrategyPack { status: 'DRAFT', grade: null }` + one `StrategyPackVersion` each with the recipe config JSON. Idempotent by `name`. Extend `strategy-pack-draft-validator.ts`: composite weights sum ∈ [0.99, 1.01], no negatives, no weight on globally-disabled providers, required config fields per §1 of the packs doc. Run validator before each insert. All packs stay DRAFT; no auto-promotion.

### WP-BE-6 — Adaptive default enforcement

**Owner:** `backend-extractor`.
**Scope:** [services/session/trading-session-service.ts](trading_bot/backend/src/services/session/trading-session-service.ts), fresh-config template in [services/settings-service.ts](trading_bot/backend/src/services/settings-service.ts) (or wherever defaults live — grep `settings.adaptive.enabled`).
**Acceptance:** fresh configs have `adaptive.enabled = false`; LIVE session with `adaptive.enabled = true` refused unless operator explicitly set it (bumps `RuntimeConfigVersion`).

**Prompt:**
> Grep `settings.adaptive.enabled` across backend. Confirm the fresh-config default is `false`. In `TradingSessionService.open({ mode: 'LIVE' })`, if `settings.adaptive.enabled === true`, require that the most recent `RuntimeConfigVersion` change was an explicit flip of this key by an operator (check the diff in the most-recent `RuntimeConfigVersion.diff`). Otherwise refuse with `adaptive-default-violation`. Log the decision as an `OperatorEvent`. One test at `tests/session/adaptive-default.test.ts`.

### WP-BE-7 — Minimum backend tests (= rollout WP14)

**Owner:** any `general-purpose` agent.
**Scope:** 6 new test files under `trading_bot/backend/tests/**`. Do NOT touch production code.
**Acceptance:** all 6 green.

**Prompt:**
> Add 6 vitest-style test files under `trading_bot/backend/tests/` mirroring the `tests/enrichment/` pattern: `execution/swap-submitter.test.ts` (retry reason codes, lane attribution with mocked RPC), `execution/quote-builder.test.ts` (dynamic-slippage math, 2 s freshness expiry), `session/trading-session-service.test.ts` (active-session uniqueness, pause/resume state, mode transitions), `workbench/pack-grading-service.test.ts` (A/B/C/D thresholds), `engine/graduation-engine.test.ts` (filter gate composition with adaptive mutation), `enrichment/token-enrichment-service.test.ts` (fanout, cache hit/miss, degraded path, composite formula). Use real services with mocked providers. If a test reveals a bug, file as a new WP — do not fix in this PR.

---

## 5. Acceptance

- Every service listed in §1 has at least one caller (no orphan services).
- MutatorOutcome rows are written on every close and visible on the Adaptive Telemetry dashboard.
- `discovery-lab-*.ts` is gone from `services/`.
- Evaluator runs through `TokenEnrichmentService` — grep for direct Birdeye calls in `GraduationEngine` is clean.
- No LIVE session opens with `adaptive.enabled = true` unless the operator flipped it explicitly.
- Credit forecast refuses over-budget sessions.
- 10 `StrategyPack` DRAFT rows exist.
- Minimum test set above is green.
