# Backend Plan — Trading-Critical Seams

Companion to [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

The backend already has the right broad pieces. The problem is not missing architecture; it is too much compatibility logic around a few hot seams. This plan keeps the trading workflow easy to reason about and easy to test.

## Current owner seams

- Session lifecycle: `TradingSessionService`
- Provider budget + forecast: `ProviderBudgetService` and `CreditForecastService`
- Candidate evaluation: `GraduationEngine`
- Enrichment bundle: `TokenEnrichmentService`
- Live execution: `QuoteBuilder` -> `SwapBuilder` -> `SwapSubmitter` -> `LiveTradeExecutor`
- Helius watch/admin seam: `HeliusWatchService`
- Composition root: `engine/runtime.ts`

## Biggest backend bloat

- `engine/runtime.ts` still wires both trading-critical services and discovery-lab compatibility surfaces.
- `TradingSessionService` is the right owner, but plan text elsewhere still treats forecast and LIVE gating as separate future seams.
- `GraduationEngine` still has plan pressure to read provider-specific data directly instead of treating the enrichment bundle as the contract.
- Discovery-lab cleanup is still described too aggressively in older drafts even though importers remain.

## Clear trading workflow to optimize for

1. Open a session.
2. Load enrichment once for a candidate.
3. Make the accept/reject decision from the unified bundle plus session config.
4. Build and submit the trade through the execution stack.
5. Confirm, exit, and write telemetry.

If a change does not make one of those five steps clearer or easier to test, it should usually wait.

## Implementation order

### 1. Keep session-open ownership in one seam

**Files**
- `trading_bot/backend/src/services/session/trading-session-service.ts`
- session routes only if the external contract changes

**Acceptance**
- Forecast decisions, LIVE gating, and operator events all stay on the `startSession(...)` path.
- New UI needs do not create a second preflight service.

### 2. Cut evaluator reads over to the enrichment bundle

**Files**
- `trading_bot/backend/src/engine/graduation-engine.ts`
- `trading_bot/backend/src/services/enrichment/token-enrichment-service.ts`

**Acceptance**
- Candidate evaluation reads one bundle contract instead of mixing ad-hoc provider calls.
- Degraded-source behavior is explicit and tested.

### 3. Keep runtime narrow

**Files**
- `trading_bot/backend/src/engine/runtime.ts`
- route handler factories it wires

**Acceptance**
- New work does not add more discovery-lab compatibility into `BotRuntime`.
- Route bags stay grouped by owner service.

### 4. Stage discovery-lab cleanup after caller collapse

**Files**
- discovery-lab helpers and any files importing them

**Acceptance**
- Move shared types first.
- Remove redirect/copy compatibility before deleting still-imported services.
- Delete leaves only after importer count reaches zero.

### 5. Add the smallest useful tests around hot seams

**Priority test surfaces**
- session start / pause / resume
- evaluator decision with degraded enrichment
- one live-submit path with mocked providers
- webhook replay dedupe if the Helius seam changes

## Testing shape

- Route handlers and middleware should stay thin and delegate to services.
- Unit tests should prefer dependency injection and mocked providers or mocked Prisma clients.
- Integration tests should use a real test DB for a small number of session/execution flows.
- Keep fixtures close to the service area instead of one giant shared harness.

## Done when

- The backend plan reads like the current codebase, not a future platform rewrite.
- `TradingSessionService`, `GraduationEngine`, and the execution stack have obvious ownership boundaries.
- Discovery-lab cleanup is sequenced instead of hand-waved.
