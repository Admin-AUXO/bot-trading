You are not starting from scratch.

The draft docs are stale. Some phase-6 seams that drafts still describe as pending are already real in code. Other seams are still paper-thin. Your job is to separate those cleanly and finish the real leftovers instead of relanding solved work.

Current target:

- verify what is already real before changing anything
- identify what the `draft_*.md` set still expects that the repo has not actually landed
- finish one high-risk remaining seam end-to-end
- leave the repo build-green and the handoff docs more honest than you found them

Do not trust draft language over code, git history, runtime proof, or the current session note.

---

## Read First

Read these before touching code:

- [`draft_index.md`](../draft_index.md)
- [`draft_rollout_plan.md`](../draft_rollout_plan.md)
- [`draft_database_plan.md`](../draft_database_plan.md)
- [`draft_backend_plan.md`](../draft_backend_plan.md)
- [`draft_execution_plan.md`](../draft_execution_plan.md)
- [`draft_credit_tracking.md`](../draft_credit_tracking.md)
- [`draft_helius_integration.md`](../draft_helius_integration.md)
- [`draft_market_stats_upgrade.md`](../draft_market_stats_upgrade.md)
- [`draft_dashboard_plan.md`](../draft_dashboard_plan.md)
- [`draft_grafana_plan.md`](../draft_grafana_plan.md)
- [`draft_strategy_packs_v2.md`](../draft_strategy_packs_v2.md)
- [`notes/reference/api-surface.md`](reference/api-surface.md)
- [`notes/reference/prisma-and-views.md`](reference/prisma-and-views.md)
- [`notes/reference/strategy.md`](reference/strategy.md)
- [`notes/sessions/2026-04-18-dashboard-backend-simplification-pass.md`](sessions/2026-04-18-dashboard-backend-simplification-pass.md)

Then confirm repo state from code and git history before making assumptions.

---

## Repo Reality

Treat these as current unless code proves otherwise:

- `P0` schema slice is landed:
  - `ProviderCreditLog`
  - `FillAttempt`
  - `MutatorOutcome`
  - `SmartWalletFunding`
  - credit-reporting SQL views
- `P1/P2` execution helper slice is landed:
  - `services/helius/priority-fee-service.ts`
  - `services/execution/quote-builder.ts`
  - `services/execution/swap-builder.ts`
  - `services/execution/swap-submitter.ts`
- `P3` provider-budget generalization is landed:
  - provider-keyed budget service
  - batched `ProviderCreditLog` writes
- `P4a/P4b` enrichment slice is landed:
  - 8 provider clients
  - expanded `TokenEnrichmentService`
  - `/api/operator/enrichment/:mint`
  - token-detail enrichment cards
- `P5` market pages are landed:
  - `/market/trending`
  - `/market/token/[mint]`
  - `/market/watchlist`
  - market stats route
- `P6h` Grafana generator slice is landed:
  - new dashboard builders are wired into the generator
- session / pack / grader ownership slices are landed:
  - `TradingSessionService`
  - dedicated `/api/operator/packs*`, `/runs*`, `/sessions*`
  - `/workbench/*` pages
  - grader / tuning endpoints

Three important post-draft hardening seams are already real:

### 1. Live execution cutover is real

- `ExecutionEngine` no longer relies on the old inline live submit path as owner
- `LiveTradeExecutor` now uses `QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`, and `HeliusPriorityFeeService`
- `FillAttempt` is now exercised by the live runtime path
- old inline quote / swap / sender ownership inside `live-trade-executor.ts` was removed

### 2. Session credit forecast gate is real

- `CreditForecastService` exists
- `TradingSessionService.startSession()` forecasts Birdeye and Helius burn before runtime config mutation
- session start can reject on forecast
- successful session-start responses include `budgetForecast`
- backend env contract includes:
  - `HELIUS_MONTHLY_CREDIT_BUDGET`
  - `CREDIT_FORECAST_SESSION_HOURS`
  - `ALLOW_START_ON_BUDGET_CRITICAL`

### 3. Helius watch hardening moved forward, but is not finished

- `HeliusWatchService` now exposes richer watch telemetry in `/api/status`
- webhook replay / duplicate suppression exists
- migration-websocket activity now emits budget-ledger rows
- `SmartWalletFunding` is still explicitly marked as `dead_schema` unless you prove otherwise

Do not reland any of the above.

---

## What The Drafts Still Expect

The `draft_*.md` set still points at real remaining work. It just overstates how much of earlier phase-6 is still missing.

These are the remaining implementation tracks that still show up across the drafts and are not yet clearly finished in code:

### 1. Helius paid-path ownership is still incomplete

The watch service got better. The whole Helius billable surface did not.

Still verify and finish:

- execution-side Helius calls that may still bypass `ProviderBudgetService`
- webhook / stream accounting coverage for every intended paid path
- whether any Helius Sender path is still invisible to provider credit telemetry
- whether `SmartWalletFunding` should be wired live or declared intentionally dead and isolated

Known suspicious areas:

- `trading_bot/backend/src/services/live-trade-executor.ts`
- `trading_bot/backend/src/services/execution/swap-submitter.ts`
- any remaining direct Helius RPC / Sender usage outside runtime-owned budget wrappers

Done when:

- every intended paid Helius path writes budget telemetry
- watch subscriptions are observable from runtime status
- replay / duplicate handling is proven, not narrated
- `SmartWalletFunding` is either live or clearly isolated as dead schema with docs updated

### 2. Credit telemetry proof is still incomplete

Drafts want credit tracking, views, and operational reporting. Storage exists. Proof still matters.

Still verify and finish:

- one real or simulated discovery / evaluate runtime path writes `ProviderCreditLog`
- Grafana credit views are fed by non-empty rows, not just schema and SQL
- remaining provider-call bypasses are audited out

Done when:

- a runtime path produces non-empty `ProviderCreditLog` rows
- the Grafana-facing credit views are visibly non-empty from that path
- no intended provider lane bypasses telemetry ownership

### 3. Grafana alert rollout is still missing

The dashboards are there. The alerting story is still mostly draft fiction.

Still verify and finish:

- burn alerts
- slope / acceleration alerts
- failed-call share alerts
- route ownership from those alerts to actual telemetry sources

Done when:

- alert rules exist in repo-owned Grafana generation or provisioning
- alert expressions map to real tables / views
- the session note and Grafana docs stop pretending this is finished if it is not

### 4. Execution failure-proofing is still partial

The submit path cutover landed. Retry and failure semantics still need evidence.

Still verify and finish:

- stale-quote retry behavior in the real runtime path
- `BLOCKHASH_EXPIRED` retry behavior in the real runtime path
- Jito lane vs regular lane ownership and fallback behavior
- `FillAttempt` completeness across open / close persistence
- `STALE_EXIT` escalation path, or explicit isolated deferral with no fake promise

Known current smell:

- `swap-submitter.ts` still carries `STALE_EXIT` deferral language

Done when:

- retry semantics are unambiguous in code and tests
- old submit-path drift is gone or explicitly isolated
- telemetry tables, docs, and runtime behavior agree

### 5. Adaptive engine / pack rollout is still mostly pending

The drafts are right here. Most of the adaptive loop is still a shell.

Still finish:

- `AdaptiveThresholdService`
- context builder wiring
- `MutatorOutcome` attribution on close
- pack seeding / versioning that matches the existing DB contract

Do not invent another storage format.

Done when:

- adaptive thresholds actually influence runtime decisions through owned seams
- close-path attribution writes real `MutatorOutcome` rows
- seeded packs match the schema and grader expectations

### 6. Smart-money pack / live smart-wallet exploitation is still pending

The watch plumbing is ahead of the pack wiring.

Still finish:

- smart-money strategy pack wiring
- live use of `SmartWalletEvent`
- explicit decision on `SmartWalletFunding`
- backup path behavior for smart-wallet stream degradation

Done when:

- the smart-money runtime path uses live watch data intentionally
- fallback behavior is observable
- dead schema is either removed from the story or made live

### 7. Discovery-lab / compatibility cleanup is still pending

Drafts still call for removing compatibility leftovers. That is still true, but only after dependency proof.

Still audit:

- discovery-lab compatibility routes
- compatibility client wrappers
- duplicated market / workbench ownership
- dead aliases still pointing to the same seam

Done when:

- active pages prove they no longer depend on the compatibility surface
- redundant routes / wrappers are deleted instead of merely renamed

---

## What Was Already Proved

Do not waste the next session re-proving these unless code changed under you.

### Execution

- before the cutover, the real runtime path was `GraduationEngine` / `ExitEngine` -> `ExecutionEngine` -> old inline `LiveTradeExecutor`
- the helper execution slice existed before but was dead
- `FillAttempt` was effectively dead until the cutover
- after the cutover, the shared submitter path is the live owner
- injected proof already showed a mocked live buy writes `FillAttempt` metadata and a mocked live sell failure throws `BLOCKHASH_EXPIRED`

### Session budgeting

- `ProviderCreditLog` and SQL views existed before the forecast gate
- the missing seam was enforcement, not storage
- `CreditForecastService` now gates `TradingSessionService.startSession()`
- one allowed `DRY_RUN` and one rejected `DRY_RUN` were already proven
- boolean env parsing for `ALLOW_START_ON_BUDGET_CRITICAL` was already fixed

### Helius watch hardening

- webhook replay suppression exists
- duplicate smart-wallet payload suppression exists
- boot reconciliation is deeper than it used to be
- websocket subscription activity is visible in status and credit telemetry
- `SmartWalletFunding` still appears to be dead schema unless code proves otherwise

---

## Recommended Next Move

Do not chase five tracks at once. Pick one seam and finish it with proof.

Best next candidates:

1. execution-side Helius budget bypass audit and fix
2. credit-ledger runtime proof plus Grafana alert rollout
3. execution retry / `STALE_EXIT` hardening

If you need a tie-breaker, start with execution-side Helius budget bypasses. That seam sits between cost control, observability, and live trading correctness. Leaving it half-owned is stupid.

---

## Session Learnings

Carry these forward.

1. Do not trust the drafts blindly.
   They lag both code and git history.

2. Runtime-owned services must stay singular.
   If `ProviderBudgetService` is duplicated locally, ownership drifts.

3. If a provider call bypasses `ProviderBudgetService`, the pass is incomplete.
   Paid or free is secondary. Visibility is the real contract.

4. If a table exists but runtime never writes it, the slice is not landed.
   Keep using this lens for `SmartWalletFunding`, `MutatorOutcome`, and any telemetry table.

5. Build verification is necessary and insufficient.
   Browser and runtime proof matter more than green builds alone.

6. Boolean env parsing can silently gut safety checks.
   Never coerce strings blindly for guard flags.

7. Keep docs honest in the same pass.
   If ownership changes, update:
   - [`notes/reference/api-surface.md`](reference/api-surface.md)
   - [`notes/reference/prisma-and-views.md`](reference/prisma-and-views.md)
   - the relevant session note

8. Do not claim type-clean unless you actually fixed typecheck.
   Backend build green is not the same thing.

---

## Working Rules

- Use sub-agents only for bounded independent read-heavy tracks.
- Do not hand off the blocking critical path and sit there like furniture.
- Good sub-agent candidates:
  - read-only trace of remaining Helius budget bypasses
  - read-only trace of Grafana credit views and alert sources
  - browser verification of market / enrichment pages
  - compatibility dependency audit
- Bad sub-agent use:
  - delegating the main seam and waiting idle
  - sending multiple agents to rediscover the same ownership path

- No new npm packages unless unavoidable.
- Use typed Prisma selects.
- No raw SQL outside `create_views.sql`.
- Schema edits are schema-only; no hand-authored migrations.
- Keep changes minimal and verifiable.

---

## Required Verification

Before ending the session, run:

1. `cd trading_bot/backend && npm run db:generate`
2. `cd trading_bot/backend && npm run build`
3. `cd trading_bot/dashboard && npm run build`
4. `cd trading_bot/grafana && node scripts/build-dashboards.mjs`

Then perform targeted proof for the seam you touched.

If you touch Helius budget ownership:

- prove the runtime path now writes `ProviderCreditLog`
- show which formerly direct calls now flow through the budget owner

If you touch credit telemetry or Grafana:

- prove non-empty `ProviderCreditLog` rows from a runtime path
- prove the Grafana-facing views are non-empty
- if alert rules were added, show the exact repo-owned source

If you touch execution failure handling:

- exercise the real or injected runtime path again
- show stale-quote / blockhash-expired / lane fallback behavior explicitly

If you touch adaptive or smart-money seams:

- prove real row writes for `MutatorOutcome` or `SmartWalletFunding`, or declare the table intentionally inactive and update docs

Do not say “production ready” unless the risky path was actually exercised.
