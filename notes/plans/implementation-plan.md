# Implementation Plan — Fastest Safe Path

Companion to [README.md](README.md). Snapshot **2026-04-19**.

This re-audit keeps the plan centered on the current codebase, not the older rollout story. The dashboard already has real surfaces, the backend already has a live execution stack, and the fastest path now is to tighten boundaries and tests around those seams.

## What changed in this audit

- The dashboard uses two real data paths:
  - Server Components read the backend directly through `dashboard/lib/server-api.ts`.
  - Browser reads and writes go through `dashboard/lib/api.ts` and `dashboard/app/api/[...path]/route.ts`.
- Market intel is no longer one generic board shape:
  - Trending is the paid-seeded discovery board.
  - Watchlist should be a lighter scoped board built from pinned mints plus free/runtime coverage.
- `TradingSessionService.startSession(...)` already consumes `CreditForecastService.forecastSession(...)`; forecast wiring is not future work.
- `BotRuntime` is still too broad and still carries discovery-lab compatibility through shared seams.
- The trading path is already split into `QuoteBuilder` -> `SwapBuilder` -> `SwapSubmitter` -> `LiveTradeExecutor`; the missing work is hardening and proof, not a fresh redesign.

## Best-practice rules applied

- Next.js: fetch directly from the source in Server Components; use the dashboard proxy only where the browser needs a same-origin API boundary.
- Backend: keep one owner per seam and make it easy to unit test with injected dependencies, then add a small number of real DB integration tests.
- Solana execution: always treat blockhash lifetime, confirmation, and retries as first-class state.
- Jupiter: keep the current custom build/submit path only where we need lane control; do not add extra execution layers on top of it.
- Helius Sender: if we choose that lane, include the required tip, priority fee, and `skipPreflight: true`.
- Helius webhooks: assume retries and duplicates; idempotency is part of the contract.

## Codex rules

- Run read-only proof first.
- Keep at most `3` write agents active at once.
- Assign agents by disjoint write set, not by feature theme.
- Keep one main agent responsible for docs and merge order.
- Prefer small acceptance checks over long work-package prompts.

## Agent mapping

| Need | Best role |
|---|---|
| Trace current seam / importer map | `code_navigator` |
| Backend service edits | `implementation_worker` or specialist owner |
| Dashboard route/data wiring | `dashboard_handler` |
| Helius / smart-wallet seam | `smart_money_builder` |
| Enrichment seam | `enrichment_integrator` |
| DB / SQL views | `database_agent` |
| Review / regression pass | `code_reviewer` |

## Execution order

### 1. Dashboard boundary cleanup

**Why first:** the current plan text is stale and the dashboard has easy bloat wins.

**Write set**
- `dashboard.md`
- `trading_bot/dashboard/lib/{api.ts,server-api.ts}`
- `trading_bot/dashboard/app/market/**`
- `trading_bot/dashboard/components/{app-shell.tsx,settings-client.tsx}`
- `trading_bot/dashboard/next.config.ts`

**Acceptance**
- Server-rendered pages keep direct backend reads.
- Browser mutations stay behind the proxy route.
- `/market/token/[mint]` fetches enrichment once per render path.
- `/market/watchlist` uses a scoped watchlist contract instead of reloading the paid-seeded trending board and filtering locally.
- Only intentional legacy redirects remain.

### 1B. Market intel and watchlist cleanup

**Why immediately after:** this is the cleanest way to cut provider waste and make the market surfaces easier to scan.

**Write set**
- `trading_bot/backend/src/services/market/market-intel-service.ts`
- `trading_bot/backend/src/api/routes/{market-routes.ts,types.ts}`
- `trading_bot/dashboard/app/market/{trending,watchlist}/**`
- `trading_bot/dashboard/components/market-trending-grid.tsx`
- shared market payload types and fallback helpers

**Acceptance**
- Trending remains the paid-seeded board.
- Watchlist is driven by pinned mints and uses the lighter scoped backend contract.
- Market payloads expose enough metadata to show paid/free/local provider coverage clearly.
- The primary board actions are obvious without relying on icon-only controls.

### 1C. Dashboard layout sweep

**Why immediately after:** once the boundaries are clear, the highest leverage UX win is making every page faster to scan and act on.

**Write set**
- `dashboard.md`
- `trading_bot/dashboard/app/{operational-desk,workbench,market}/**`
- `trading_bot/dashboard/components/**`

**Acceptance**
- Major pages share a common anatomy: title, state summary, metrics strip, primary actions, main workspace, secondary diagnostics.
- The most common operator actions are visible without scrolling.
- Shared layout primitives replace repeated one-off card headers and action clusters where useful.

### 2. Backend contract cleanup

**Why second:** this is the narrowest path to a clearer and easier-to-test trading workflow.

**Write set**
- `backend.md`
- `trading_bot/backend/src/services/session/trading-session-service.ts`
- `trading_bot/backend/src/engine/runtime.ts`
- `trading_bot/backend/src/engine/graduation-engine.ts`
- related route files only where the contract must change

**Acceptance**
- `TradingSessionService` stays the single owner of session-open forecast and LIVE gating.
- `GraduationEngine` consumes the enrichment bundle instead of ad-hoc provider reads.
- Market-intel provider usage stays behind one owner service; dashboard pages do not re-derive paid-vs-free provider logic client-side.
- `BotRuntime` no longer accumulates new compatibility work.

### 3. Execution hardening

**Why third:** the stack exists, so speed comes from proof and guardrails, not a rewrite.

**Write set**
- `execution.md`
- `trading_bot/backend/src/services/execution/{quote-builder.ts,swap-builder.ts,swap-submitter.ts}`
- `trading_bot/backend/src/services/live-trade-executor.ts`
- `trading_bot/backend/src/services/helius/priority-fee-service.ts`

**Acceptance**
- Quote age, blockhash expiry, fee estimation, and retries are explicit and tested.
- `FillAttempt` remains the ledger for every real submission attempt.
- We do not add a second execution abstraction over the current stack.

### 4. Helius ownership cleanup

**Why fourth:** webhook/admin ownership should follow the clearer trading-critical path.

**Write set**
- `helius.md`
- `trading_bot/backend/src/services/helius/helius-watch-service.ts`
- any new `helius` admin route file

**Acceptance**
- Webhook reconcile/list/delete has one owner.
- Duplicate webhook deliveries stay idempotent.
- Smart-wallet readiness is a pack gate, not scattered UI logic.

### 5. Compatibility cleanup

**Why last:** this is where delete work becomes safe.

**Write set**
- `dashboard/next.config.ts`
- discovery-lab compatibility helpers
- any plan text still treating discovery-lab as a first-class dashboard/backend surface

**Acceptance**
- No first-wave delete of still-imported services.
- Redirect cleanup and label cleanup can ship before deep service deletion.

## Minimum proof before merge

- Dashboard: one server-rendered route and one client mutation path still work.
- Market: trending and watchlist must prove different provider/seed scopes without breaking token-detail drill-in.
- Backend: session start, evaluator decision, and one trade submission path have tests.
- Execution: stale quote, fee fallback, and blockhash-expiry behavior are covered.
- Helius: replay dedupe remains tested anywhere webhook ownership changes.

## Done when

- The plan set matches the current dashboard/backend seams.
- Codex can execute the next wave without reopening dead `results-board` or first-wave discovery-lab stories.
- The live trading workflow is easy to describe in five steps:
  1. open session,
  2. enrich and evaluate candidate,
  3. build and submit trade,
  4. confirm and record fill,
  5. exit and write telemetry.
