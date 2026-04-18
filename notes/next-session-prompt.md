# Next Agent Session — Production Hardening Prompt

Paste this as the opening message of the next agent session in this repo.

---

## Mission

You are not starting from scratch. Major phase-6 slices are already on `main`.

Your job is to take the repo from **"large partial landing"** to **production-ready hardening level**:
- verify what is real before changing anything
- finish the missing high-risk seams
- remove stale compatibility where safe
- leave the repo build-green and operationally defensible

Do not waste time rewriting plans that the code has already outgrown.

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

## Landed Already

These are already on `main` and should be treated as current reality unless code proves otherwise:

- `P0` schema slice:
  - `ProviderCreditLog`
  - `FillAttempt`
  - `MutatorOutcome`
  - `SmartWalletFunding`
  - credit-reporting SQL views
- `P1/P2` execution slice:
  - `services/helius/priority-fee-service.ts`
  - `services/execution/quote-builder.ts`
  - `services/execution/swap-builder.ts`
  - `services/execution/swap-submitter.ts`
- `P3` provider-budget generalization:
  - provider-keyed budget service
  - batched `ProviderCreditLog` writes
- `P4a/P4b` enrichment slice:
  - 8 free-provider clients
  - expanded `TokenEnrichmentService`
  - `/api/operator/enrichment/:mint`
  - token-detail enrichment cards
- `P5` market pages:
  - real `/market/trending`
  - real `/market/token/[mint]`
  - real `/market/watchlist`
  - market stats route
- `P6h` Grafana generator slice:
  - 7 new dashboard builders wired into generator

Builds were green at handoff:

- `cd trading_bot/backend && npm run db:generate`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/grafana && node scripts/build-dashboards.mjs`

Branch state:
- work is already merged into `main`
- stale Codex branches were pruned

---

## Highest-Value Remaining Work

Focus on the gaps that still prevent a production-ready claim.

### 1. Helius watch / webhook ownership

Finish the real-time Helius side instead of pretending migration-watch plus priority fee is enough:

- `HeliusWatchService` as the real owner for:
  - LP removal
  - holder dump
  - dev-wallet watch
  - smart-wallet stream backup path
- enhanced webhook reconciliation on boot
- enhanced websocket subscription accounting
- `SmartWalletEvent` and `SmartWalletFunding` usage from live wiring, not just schema

Done when:
- every intended Helius paid path is budget-wrapped
- watch subscriptions are observable
- replay / duplicate handling is proven

### 2. Credit forecast and session budget enforcement

The ledger exists. The operational brake does not.

Finish:
- `CreditForecastService`
- session-start estimate and budget gate
- alert-rule rollout for burn / slope / failed-call share
- verification that one real discovery / evaluate tick writes `ProviderCreditLog` rows correctly

Done when:
- starting a session can reject on forecast
- Grafana data is driven by real rows, not empty views

### 3. Execution cutover and failure-proofing

The new builders exist. That does not mean the engine truly uses them.

Verify and finish:
- actual execution call path ownership
- stale-quote / blockhash-expired / Jito-drop retry behavior
- `STALE_EXIT` escalation path
- `FillAttempt` completeness for success and failure

Done when:
- the production path is unambiguous
- old submit-path drift is either removed or explicitly isolated

### 4. Adaptive engine / pack rollout

Most of the schema is there. The real adaptive loop is not.

Finish:
- `AdaptiveThresholdService`
- context builder wiring
- `MutatorOutcome` attribution on close
- initial pack seeding / versioning plan that matches the real DB contract

Do not invent another storage format.

### 5. Discovery-lab compatibility removal

A lot of the repo still carries compatibility adapters because the old surfaces were left standing.

Audit and remove what is now truly redundant:
- discovery-lab compatibility routes
- compatibility client wrappers
- duplicated market/workbench ownership
- any dead alias that still points to the same seam for no reason

Do this only after verifying no active page still depends on it.

### 6. Browser-grade verification

This repo has too many “build green, probably fine” passes already.

At minimum, verify:
- `/api/operator/enrichment/:mint` returns a `compositeScore > 0` when enough providers respond
- `/market/token/[mint]` renders all 6 cards and tolerates one provider returning `5xx`
- credit rows appear after a real or simulated discovery/evaluate tick
- market pages are readable at desktop width and a mobile breakpoint

---

## Session Learnings

Carry these forward. They were paid for already.

1. Do not trust the draft docs blindly.
   The drafts lagged the repo badly. Verify code and git first.

2. Preserve compatibility intentionally, not accidentally.
   When old pages still depend on a shape, return a compatible payload on purpose. Do not break consumers just because the new model is cleaner.

3. Runtime-owned services must stay singular.
   `ProviderBudgetService` duplication was a real source of drift before. Inject the runtime-owned instance; do not create cute local copies.

4. If a provider call bypasses `ProviderBudgetService`, the pass is incomplete.
   Paid or free does not matter. Visibility matters.

5. If the engine still uses the old submit path, the execution story is not production-ready.
   Existence of `swap-submitter.ts` means nothing by itself.

6. Watch Windows-specific rough edges.
   Graphify and some local file / env tooling had Windows-specific failures in prior sessions. Do not assume Linux behavior.

7. Build verification is necessary and insufficient.
   This repo has several history notes where builds passed while browser ownership still drifted.

8. Keep docs honest in the same pass.
   If you change route, schema, or view ownership, update:
   - [`notes/reference/api-surface.md`](reference/api-surface.md)
   - [`notes/reference/prisma-and-views.md`](reference/prisma-and-views.md)
   - relevant session note if the handoff would otherwise be ambiguous

---

## Working Rules

- Use sub-agents for bounded independent tracks.
- Keep them scoped. Do not send the blocking critical path to a sub-agent and sit there waiting.
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

Then perform targeted runtime or browser verification for the specific production-hardening slice you changed.

Do not say "production ready" unless the risky path was actually exercised.
