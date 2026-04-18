# Backend Plan — Services, Engine, API, Webhooks (Service-by-Service)

Companion to [draft_workflow_redesign.md](draft_workflow_redesign.md), [draft_database_plan.md](draft_database_plan.md), [draft_dashboard_plan.md](draft_dashboard_plan.md), [draft_workflow_principles.md](draft_workflow_principles.md).

**Stack (already in place):** Node.js + TypeScript, Prisma 7, PostgreSQL 16, Express-style `createApiServer`, Helius RPC + webhooks + laserstream, Birdeye Lite, Jupiter + Jito for execution, SSE for streaming. Reuse — don't introduce new frameworks.

**Runtime model (today):** one `BotRuntime` process with 13 in-process services + 4 timers (discovery, evaluation, exit, maintenance). Keep this model; tighten ownership.

---

## 1. Design principles (anti-bloat contract for the backend)

1. **One responsibility per file.** A service answers one question. If its name is a conjunction ("discovery-lab-strategy-calibration"), it's two services.
2. **File budget:** services ≤300 lines; engine files ≤400; route modules ≤120. Anything bigger fails review.
3. **Singletons live in `runtime.ts` only.** No service instantiates another service. Dependencies pass through constructors.
4. **Pure core, I/O at the edges.** Scoring, threshold math, exit-plan derivation are pure functions. DB / HTTP wrappers sit around them.
5. **All I/O through a budget gate.** Every provider call goes through `ProviderBudgetService`. No direct `fetch` outside clients.
6. **Every behavior change writes evidence.** Mutation → `AdaptiveThresholdLog`. Config change → `ConfigSnapshot`. Pack edit → `StrategyPackVersion`. No silent state change.
7. **Idempotency by construction.** Every ingestion handler dedupes on a natural key (`txSig`, `(mint, slot, side)`, `webhookEventId`).
8. **Fail loudly at boundaries, swallow nothing.** `safeRun` exists only for timer loops that must not kill the process. Business logic throws.
9. **Feature-flag every new capability** under `settings.*.enabled` until a full cycle of paper data proves it.
10. **No cross-lane imports.** `discovery` cannot import from `execution`; `execution` cannot import from `exit-engine`. They communicate through the DB and the event bus.

---

## 2. Process topology

```
BotRuntime (single process)
├── timers
│   ├── discoveryLoop         every settings.cadence.discoveryMs
│   ├── evaluationLoop        every settings.cadence.evaluationMs
│   ├── exitLoop              every settings.cadence.exitMs
│   └── maintenanceLoop       every 60 s (reconcile, cache sweep)
├── listeners
│   ├── HeliusMigrationWatcher (existing)
│   ├── HeliusWatchService     (new — smart wallets, holders, LP)
│   └── webhook HTTP handlers  (new — Helius enhanced webhooks)
├── http
│   └── createApiServer        (Express app, routes under §6)
└── services (see §4)
```

**Concurrency model:** all loops are single-threaded async; a loop-level mutex prevents overlap (`if (loop.running) return`). I/O fan-out inside a loop uses `Promise.allSettled` with a per-provider concurrency cap from `ProviderBudgetService`.

**Shutdown:** `stop()` in order — stop timers → cancel in-flight provider fetches → flush event bus → close Prisma. 15 s SIGTERM grace.

---

## 3. Current vs target service map

### 3.1 Services today (28 files, 13 wired into runtime)

Size outliers today: `discovery-lab-service` 1321 L · `graduation-engine` 1281 L · `operator-desk` 1091 L · `execution-engine` 866 L · `discovery-lab-market-regime-service` 801 L · `live-trade-executor` 771 L · `discovery-lab-strategy-calibration` 623 L · `discovery-lab-market-stats-service` 613 L · `discovery-lab-strategy-suggestion-service` 591 L · `runtime` 586 L · `strategy-exit` 508 L · `birdeye-client` 504 L · `runtime-config` 477 L.

These all need decomposition — see §4.

### 3.2 Target service map

| Domain | Existing (keep or rename) | New | Deleted / Folded |
|---|---|---|---|
| Runtime & config | `runtime`, `runtime-config`, `constants` | — | — |
| Risk & capital | `risk-engine` | — | — |
| Discovery (pre-grad + post-grad) | `graduation-engine` → split into `DiscoveryLane`, `EvaluationLane`, `EntryScorer`, `FilterStack` | — | inline ad-hoc filters |
| Execution | `execution-engine`, `live-trade-executor` → split by concern | — | — |
| Exit | `exit-engine`, `strategy-exit` | `ExitPlanBuilder`, `LiveExitMutator` | `Position.metadata.exitPlan` path |
| Strategy packs | `strategy-presets` (delete after phase 2) | `StrategyPackService`, `StrategyPackVersionRepo` | hardcoded presets |
| Adaptive | `adaptive-model` | `AdaptiveThresholdService`, `AdaptiveContextBuilder` | — |
| Enrichment | `rugcheck-client`, `dexscreener-client`, `birdeye-client`, `helius-client`, `shared-token-facts` | `TokenEnrichmentService`, `TrenchClient`, `BubblemapsClient`, `SolsnifferClient`, `PumpFunPublicClient`, `JupiterTokenClient`, `GeckoTerminalClient`, `CieloClient`, `DefiLlamaClient` | — |
| Helius watches | `helius-migration-watcher` | `HeliusWatchService` (unifies all subs), `SmartWalletIngest` | — |
| Operator API | `operator-desk`, `operator-events` → decompose | `HomePayloadBuilder`, `ShellBuilder`, `EventsBuilder`, `DiagnosticsBuilder` | — |
| Discovery-lab service family | — | Split into `PackRepo`, `RunRunner`, `RunReporter`, `MarketIntelService`, `TokenInsightService`, `ManualEntryService` | `discovery-lab-*` monoliths |
| Sessions | — | `TradingSessionService` | runtime-config "current pack" shim |
| Grading | — | `PackGradingService` | manual markdown |
| Provider budget | `provider-budget-service`, `provider-telemetry` | — | — |

---

## 4. Service-by-service spec

Each new or restructured service lists: **responsibility · inputs · outputs · DB surface · failure modes · size budget · tests**.

### 4.1 `StrategyPackService`

**Responsibility:** CRUD + version + grade + publish for `StrategyPack`.
**Inputs:** operator actions via API; `PackGradingService` deltas.
**Outputs:** `StrategyPack`, `StrategyPackVersion`, `StrategyRun`, `StrategyRunGrade` rows.
**DB:** `StrategyPack`, `StrategyPackVersion`, `StrategyRun`, `StrategyRunGrade`. Writes always produce a new `StrategyPackVersion` (append-only).
**Failure modes:** concurrent edit on same pack → optimistic concurrency via `version` column; reject `publish(→LIVE)` unless `grade ∈ {A, B}` and last `StrategyRun.mode=SANDBOX` finalized ≥48 h ago with ≥10 accepts.
**Size:** ≤300 L. **Tests:** unit (pure reducer) + integration (transactional publish + revert).

### 4.2 `AdaptiveThresholdService`

**Responsibility:** pure `mutate(baseFilters, baseExits, ctx) → { filters, exits, logEntries }`.
**Composition:** `filterMult = sessionMult × perfMult × drawdownMult × consecMult × exposureMult`. Entry-score floor is additive (`max(base, ctxFloor)`). Exits are MC-tiered plus grad-age taper.
**Inputs:** pack `adaptiveAxes`, live ctx (session regime, WR trailing 50, drawdown state, consecutive outcome streak, exposure %, MC bucket).
**Outputs:** mutated filters + exits + zero-or-more `AdaptiveThresholdLog` entries.
**DB:** writes to `AdaptiveThresholdLog` (via service — never direct Prisma from callers).
**Failure modes:** returns identity on missing ctx; never throws. Emits `log.warn` when axis bounds clip.
**Size:** ≤250 L pure + ≤100 L logging. **Tests:** property-based (mutate monotonically downward under drawdown; composes to ≤1 in negative regime; never widens RiskEngine bounds).

### 4.3 `AdaptiveContextBuilder`

**Responsibility:** builds the `ctx` consumed by `AdaptiveThresholdService` from runtime + DB.
**Inputs:** `runtime.state`, `StrategyRun` recent results, time-of-day.
**Outputs:** `AdaptiveContext` struct.
**Cache:** 15 s.
**Size:** ≤150 L. **Tests:** fixtures covering each regime.

### 4.4 `TokenEnrichmentService`

**Responsibility:** single entry for enrichment. Owns per-source caches (`EnrichmentFact`, `BundleStats`, `CreatorLineage`). Fans out to provider clients.
**Clients it owns:** Rugcheck, DexScreener, Trench, Bubblemaps, Solsniffer, Pump.fun public, Jupiter, GeckoTerminal, Cielo, DefiLlama, Helius creator/holder.
**Cache TTL by source:** Trench 10 m · Bubblemaps 30 m · Solsniffer 15 m · Pump.fun 60 s · Jupiter 1 h · GeckoTerminal 5 m · DefiLlama 15 m · Cielo 60 s · Creator 6 h · Rugcheck existing · DexScreener existing.
**Budget:** every call passes through `ProviderBudgetService.requestSlot(source, purpose)`.
**Feature flags:** `settings.enrichment.<source>.enabled`.
**Contract:** `getEnrichment(mint): Promise<EnrichmentBundle>` — parallel fetch with `Promise.allSettled`; returns a bundle where each source field is `{ data, fetchedAt, source } | { error }`. Never fails whole call on one provider down.
**Size:** orchestrator ≤350 L; each client ≤150 L. **Tests:** per-client mock + fan-out dedupe test.

### 4.5 `HeliusWatchService`

**Responsibility:** unify every Helius sub (websocket + webhook). Replaces stand-alone `HeliusMigrationWatcher`.
**Subscriptions owned:**
- migration logs (existing program IDs)
- smart-wallet tx stream (40–60 addresses, cohorted into ≤25 per enhanced webhook)
- per-position top-3 holder accounts (accountSubscribe)
- per-position LP account (accountSubscribe on Raydium / Meteora pool)
- per-position dev wallet (accountSubscribe)

**Webhook cap:** 5 per active position + 60 smart-wallet. Above cap → dashboard warning via `operator-events`.
**Inbound:** HTTP `POST /webhooks/helius/<kind>` with signature verify.
**Outbound:** writes to `SmartWalletEvent`, emits runtime events (`lp-removed`, `holder-dump`, `smart-buy`).
**Idempotency:** dedupe on `txSig`; 15 min sliding window.
**Size:** orchestrator ≤300 L; per-kind handler ≤120 L. **Tests:** replay-safety + cap-enforcement.

### 4.6 `SmartWalletIngest` (sibling of `HeliusWatchService`)

**Responsibility:** parse enhanced-webhook SWAP payloads → `SmartWalletEvent` rows; feed `v_smart_wallet_mint_activity` rollup.
**Signal emit:** when ≥2 distinct tracked wallets buy a mint within 15 min, net flow ≥$3 k, and no tracked sell in prior 30 min, publish `smart-money-signal(mint)` to the runtime event bus.
**Failure modes:** spoofed payloads (must verify Helius signature); duplicate txs (idempotent insert).
**Size:** ≤200 L.

### 4.7 `TradingSessionService`

**Responsibility:** atomic start/stop/pause/revert for a `TradingSession`. Only caller that mutates the "live pack" in runtime-config.
**Contract:**
- `start({ packId, version, mode })` — stores `previousPackVersion`, applies pack atomically, creates `TradingSession` row, emits `session-started`.
- `stop({ sessionId, reason })` — closes row, pauses runtime.
- `revert({ sessionId })` — re-applies `previousPackVersion` atomically, emits `session-reverted`.
- `pause` / `resume` — flips runtime trade mode; does not close session.
**Guards:** `mode=LIVE` requires 2FA token + caller IP match; `status=LIVE` requires pack grade ≥ B (API layer enforces).
**DB:** `TradingSession`.
**Size:** ≤250 L. **Tests:** two-step publish flow, revert idempotence, concurrent-start rejection.

### 4.8 `PackGradingService`

**Responsibility:** from a completed `StrategyRun`, compute rubric grade and propose tuning deltas.
**Rubric inputs:** WR, avg winner %, avg loser %, EV, acceptance rate, false-positive rate (from `StrategyRunGrade`), exit-reason mix.
**Output:** `{ grade, suggestedDeltas: [{ field, from, to, reason }], summary }`.
**Deltas rules (examples):** if FP rate >35 % → tighten tightest filter by 10 %; if avg loser %>SL → tighten TP2 taper; if acceptance <1 % → loosen gating filter by one step.
**Apply:** `PackGradingService.applyDeltas(packId, deltas)` clones pack to DRAFT with new version.
**Size:** ≤300 L. **Tests:** rubric table-driven; delta math pure.

### 4.9 Engine split (from `graduation-engine` 1281 L → 4 files)

| New file | Responsibility | Size |
|---|---|---|
| `engine/lanes/DiscoveryLane.ts` | Birdeye meme-list paging + Helius migration sink → `Candidate` rows, status `DISCOVERED` | ≤350 L |
| `engine/lanes/EvaluationLane.ts` | Pulls `DISCOVERED`, calls `TokenEnrichmentService`, applies `FilterStack`, runs `EntryScorer`, persists decision | ≤350 L |
| `engine/lanes/EntryScorer.ts` | Pure scoring function `(snapshot, enrichment, pack) → score ∈ [0,1]` | ≤200 L |
| `engine/lanes/FilterStack.ts` | Pure filter evaluator — takes mutated filters + snapshot → `{ pass, firingReasons[] }` | ≤150 L |

`graduation-engine.ts` disappears after migration. `runtime.ts` instantiates the two lanes and wires them to the timers.

### 4.10 Execution split (from `execution-engine` 866 L + `live-trade-executor` 771 L)

| New file | Responsibility | Size |
|---|---|---|
| `engine/execution/QuoteBuilder.ts` | Jupiter quote + route; records `quoteLatencyMs` | ≤200 L |
| `engine/execution/SwapBuilder.ts` | Swap tx build + Jito tip sizing (via `getPriorityFeeEstimate`) | ≤200 L |
| `engine/execution/SwapSubmitter.ts` | Submit + confirm + reconcile; writes `Fill` with promoted latency columns | ≤250 L |
| `engine/execution/PaperExecutor.ts` | DRY mode — simulate fills against tape | ≤150 L |
| `engine/execution/PhantomFillReconciler.ts` | Handle unknown-state fills (startup + runtime) | ≤200 L |

### 4.11 Exit split (from `strategy-exit` 508 L + `exit-engine` 236 L)

| New file | Responsibility | Size |
|---|---|---|
| `engine/exit/ExitPlanBuilder.ts` | Pure: `buildExitPlan(position, pack, score) → ExitPlan`; MC-tiered + grad-age taper | ≤250 L |
| `engine/exit/ExitLoop.ts` | Pulls open positions, evaluates each against mark price + mutators, fires exits | ≤300 L |
| `engine/exit/LiveExitMutator.ts` | Volume + smart-money exit signals (gated behind `settings.exits.liveMutators.enabled`) | ≤250 L |
| `engine/exit/ExitReasonLogger.ts` | Uniform reason tagging for Grafana | ≤80 L |

### 4.12 Operator-desk split (from `operator-desk` 1091 L)

| New file | Responsibility | Size |
|---|---|---|
| `services/desk/HomePayloadBuilder.ts` | `/api/desk/home` composite | ≤250 L |
| `services/desk/ShellBuilder.ts` | `/api/desk/shell` (already polled every 15 s) | ≤150 L |
| `services/desk/EventsBuilder.ts` | `/api/desk/events` + pagination | ≤200 L |
| `services/desk/DiagnosticsBuilder.ts` | `/api/operator/diagnostics` | ≤200 L |

### 4.13 Discovery-lab split (from `discovery-lab-service` 1321 L and siblings)

| New file | Responsibility | Size |
|---|---|---|
| `services/workbench/PackRepo.ts` | File ↔ DB import/export for packs | ≤250 L |
| `services/workbench/RunRunner.ts` | Spawns sandbox runs (in-process, not subprocess); streams trace | ≤300 L |
| `services/workbench/RunReporter.ts` | Aggregates a `StrategyRun` into summary stats | ≤200 L |
| `services/market/MarketIntelService.ts` | Trending + watchlist + token-lookup queries | ≤300 L |
| `services/market/TokenInsightService.ts` | Already exists at 373 L — keep, trim to ≤300 L |
| `services/workbench/ManualEntryService.ts` | Moved from `discovery-lab-manual-entry.ts` (348 L) — keep, trim | ≤250 L |

**Deleted after phase 2:** `discovery-lab-service.ts`, `discovery-lab-strategy-calibration.ts`, `discovery-lab-strategy-suggestion-service.ts`, `discovery-lab-workspace-packs.ts`, `discovery-lab-created-packs.ts`, `discovery-lab-pack-types.ts` (types move to `types/strategy-pack.ts`), `discovery-lab-market-regime-service.ts` (logic folds into `AdaptiveContextBuilder`), `discovery-lab-market-stats-service.ts` (logic folds into `MarketIntelService` + `TokenEnrichmentService`).

**Code removal: ~6 500 lines gross.**

---

## 5. Engine pipeline — end-to-end flow

```
Birdeye meme-list + Helius migration log
            │
            ▼
        DiscoveryLane                 ─── writes Candidate (status DISCOVERED)
            │
            ▼                          ── timer: evaluationLoop
        EvaluationLane
            ├── TokenEnrichmentService ── populates EnrichmentFact
            ├── AdaptiveThresholdService.mutateFilters(ctx)
            ├── FilterStack            ── writes AdaptiveThresholdLog
            ├── EntryScorer            ── writes Candidate.entryScore
            └── decide ACCEPT / REJECT
                     │ accept
                     ▼
                RiskEngine.canOpenPosition
                     │ ok
                     ▼
              ExecutionEngine
                ├── QuoteBuilder
                ├── SwapBuilder       ── priority-fee estimate
                └── SwapSubmitter     ── writes Fill + Position OPEN
                     │
                     ▼
                ExitPlanBuilder       ── writes ExitPlan (row, not metadata)
                     │
                     ▼                 ── timer: exitLoop
                ExitLoop
                ├── mark price (Birdeye)
                ├── LiveExitMutator   ── volume / smart-money signals
                └── fire ExecutionEngine exit → Position CLOSED
```

Events emitted on the runtime event bus (for `HeliusWatchService`, Grafana, and UI): `candidate-accepted`, `position-opened`, `exit-fired`, `session-started`, `session-reverted`, `adaptive-mutation`, `webhook-cap-exceeded`.

---

## 6. API surface (route-by-route)

Module split — one route file per domain, all mounted by `createApiServer`:

```
api/
  server.ts               (≤120 L — wiring only)
  routes/
    desk.ts               shell, home, events, diagnostics
    operator-candidates.ts
    operator-positions.ts
    operator-packs.ts     (NEW)
    operator-runs.ts      (NEW)
    operator-sessions.ts  (NEW)
    operator-market.ts    (NEW — trending, watchlist)
    operator-enrichment.ts (NEW)
    operator-adaptive.ts  (NEW)
    operator-settings.ts
    operator-views.ts     (allowlist only)
    control.ts            pause/resume/discover/evaluate/exit-check
    webhooks.ts           (NEW — helius smart-wallet, lp, holders)
    health.ts
  middleware/
    auth.ts               (existing)
    webhook-verify.ts     (NEW — Helius signature)
    request-log.ts        (NEW — structured per-request log)
```

### 6.1 Route list (target)

**Public health / shell**
- `GET /health`
- `GET /api/status`
- `GET /api/desk/shell` · `home` · `events`

**Operator — trading**
- `GET /api/operator/candidates?cursor=&status=&pack=`
- `GET /api/operator/candidates/:id`
- `GET /api/operator/positions?status=open`
- `GET /api/operator/positions/:id`
- `GET /api/operator/diagnostics`

**Operator — packs / runs / sessions**
- `GET/POST /api/operator/packs`
- `GET/PATCH /api/operator/packs/:id`
- `POST /api/operator/packs/:id/publish`
- `POST /api/operator/packs/:id/runs` · `GET /api/operator/packs/:id/runs`
- `GET /api/operator/runs/:id`
- `POST /api/operator/runs/:id/grade`
- `POST /api/operator/runs/:id/suggest-tuning`
- `GET /api/operator/runs/:id/stream` (SSE)
- `GET/POST /api/operator/sessions` · `PATCH /api/operator/sessions/:id`
- `GET /api/operator/sessions/current`

**Operator — market / enrichment / adaptive**
- `GET /api/operator/market/trending?sort=&filter=`
- `GET /api/operator/market/watchlist`
- `GET /api/operator/enrichment/:mint`
- `GET /api/operator/adaptive/activity`

**Operator — settings**
- `GET /api/operator/settings`
- `PATCH /api/operator/settings`

**Control**
- `POST /api/control/{pause,resume,discover-now,evaluate-now,exit-check-now}`

**Views (allowlist)**
- `GET /api/views/:name` — allowlist of ≤6 views the dashboard actually renders.

**Webhooks**
- `POST /webhooks/helius/smart-wallet`
- `POST /webhooks/helius/lp`
- `POST /webhooks/helius/holders`

### 6.2 Deletions

- `GET /api/candidates`, `/api/positions`, `/api/fills` — legacy unauthed; delete.
- `GET /api/provider-payloads` — move behind `settings.debug.rawPayloads`.
- `GET /api/snapshots` — move behind debug gate.
- `GET /api/operator/discovery-lab/*` — folded into `/api/operator/packs` + `/runs` + `/market`.
- `GET/POST /api/settings` (non-operator) — delete; operator route is canonical.

### 6.3 Route contract rules

- All mutating routes return `202 { jobId }` if async, otherwise `200 { data }`.
- Zod validates body + query at the route boundary; shape lives in `schemas/*.ts`.
- Auth middleware on every `/api/operator/*` and `/api/control/*`. Webhooks use signature verify instead.
- Rate limit per IP at 30 r/s on `/api/*`; per webhook source at 200 r/s (budget expects bursty).
- Every route log line carries `requestId`, `route`, `durationMs`, `resultCode`, `packId?`, `sessionId?`.

---

## 7. Webhook ingestion — concrete contract

**Setup:** `HeliusWatchService.ensureWebhooks()` runs at boot and on pack changes. Reconciles desired state (smart-wallet cohorts + per-position subs) against Helius `getAllWebhooks`. Creates / updates / deletes as needed.

**Handler shape (`routes/webhooks.ts`):**
```
POST /webhooks/helius/<kind>
  headers: x-helius-signature
  body:    Helius enhanced payload

  middleware:
    1. webhookVerify(kind)       — HMAC check; 401 on fail
    2. rateLimit(200rps)          — shed load above cap
    3. parseEnhancedPayload(kind) — zod schema per kind

  handler:
    - idempotency check on txSig
    - write raw payload (debug mode only) → keep size bounded
    - dispatch to HeliusWatchService.ingest(kind, payload)
    - return 204 always (Helius retries on non-2xx)

  errors:
    - never propagate to 5xx; log + record `webhook-dropped` event
    - above drop-rate threshold → `operator-events` warning visible in Grafana
```

**Kinds:**
- `smart-wallet` — SWAP tx from tracked cohort → `SmartWalletEvent`.
- `lp` — account write on Raydium / Meteora pool LP → `lp-removed` event if `reserve → 0`.
- `holders` — account write on top-3 holder ATA → `holder-dump` event if tokenAmount delta > 20 % in 5 min.

**Backpressure:** handler is fire-and-forget to an in-memory queue (≤1 k deep); drained by a worker at steady rate. Overflow → drop + alert.

---

## 8. Provider client patterns

All clients follow the same shape:

```ts
class ProviderClient {
  constructor(private budget: ProviderBudgetService, private config: ClientConfig) {}

  async fetch(resource, purpose): Promise<Result> {
    const slot = await this.budget.requestSlot(source, purpose);       // credits + rate limit
    try {
      const res = await this.transport(resource);                       // retry 3x w/ jittered backoff on 5xx/429
      await this.budget.reportOk(slot, res.creditsCharged);
      return res;
    } catch (e) {
      await this.budget.reportErr(slot, e);
      throw ProviderError.from(e);
    }
  }
}
```

**Rules:**
- No `fetch`/`axios` calls outside `services/clients/*`.
- No client reads `env` directly; all config via constructor.
- Every client exports a `describe()` function → surfaces TTL + credit cost + rate limit in `/api/operator/diagnostics`.
- Mock adapters live under `test/mocks/clients/*` — route-level contract tests wire these.

**New clients needed (phase 3):** `TrenchClient`, `BubblemapsClient`, `SolsnifferClient`, `PumpFunPublicClient`, `JupiterTokenClient`, `GeckoTerminalClient`, `CieloClient`, `DefiLlamaClient`. All ≤150 L.

---

## 9. Concurrency, queues, timers

| Loop | Cadence (default) | Overlap guard | Notes |
|---|---|---|---|
| discoveryLoop | 15 s | mutex | fans out Birdeye paging `Promise.all` within budget |
| evaluationLoop | 5 s | mutex | pulls ≤N queued per tick; N scales by pack's `capacity` |
| exitLoop | 3 s | mutex | checks all open positions; budget-aware snapshot batching |
| maintenanceLoop | 60 s | none | cache sweep + phantom-fill reconcile + webhook cap check |

**Queue (in-memory):**
- `webhook-ingest` — smart-wallet / lp / holders, ≤1 k deep, drain rate ~200/s.
- `exit-mutator-events` — downstream consumers inside `ExitLoop`.

Use plain arrays + monotonic drain; no Bull/Queue lib.

---

## 10. Error handling, retries, idempotency

- **Business errors** throw typed `BotError` with `code`, `retryable`, `context`. Routes translate to HTTP.
- **Provider errors** retry 3× with jitter for 5xx / 429; 4xx surface immediately.
- **DB writes** are transactional per "unit of work" (e.g., accept-candidate + open-position + create-exit-plan is one tx).
- **Idempotency keys** for every ingestion: webhook `eventId`, `txSig`, `(mint, slot, side)` — unique index in DB.
- **Startup reconcile:** on boot in `LIVE`, run `PhantomFillReconciler` (already exists) before opening any new fills.

---

## 11. Observability

- **Structured logs:** pino JSON, one line per I/O + one per decision. Fields: `requestId`, `packId`, `sessionId`, `mint`, `lane`, `durationMs`, `resultCode`.
- **Operator events** (`operator-events` service, already present): business events surfaced on `/api/desk/events`. Emit `adaptive-mutation`, `webhook-cap-exceeded`, `session-started`, etc.
- **Metrics** (via the views already backed by Grafana): request rates, credit burn, latency cohorts, webhook drop rate, adaptive mutation rate.
- **Traces:** add one `traceparent` per candidate lifecycle (discovery → eval → execution → exit). Log spans at each handoff; no external tracer needed.

---

## 12. Testing contract

- **Pure units** — every scoring / filter / exit-plan / adaptive file has a co-located `.test.ts`. Table-driven where possible.
- **Integration** — per route, using test Postgres (Docker). At minimum: happy path + auth failure + validation failure.
- **Webhook** — replay fixtures under `test/fixtures/webhooks/*.json`; assert idempotency + signature-verify.
- **Runtime** — one high-level test that spins up `BotRuntime` in DRY mode with mocked clients and asserts "one candidate → one fill → one exit" end-to-end.
- **Pre-merge:** `npm run test` green; `npm run build` green; `npm run db:generate` no drift.

---

## 13. File layout (target)

```
src/
  config/
    env.ts
    schemas/
  db/
    client.ts
  engine/
    runtime.ts                        ≤300 L (wiring only)
    constants.ts
    risk-engine.ts
    lanes/
      DiscoveryLane.ts
      EvaluationLane.ts
      EntryScorer.ts
      FilterStack.ts
    execution/
      QuoteBuilder.ts
      SwapBuilder.ts
      SwapSubmitter.ts
      PaperExecutor.ts
      PhantomFillReconciler.ts
    exit/
      ExitPlanBuilder.ts
      ExitLoop.ts
      LiveExitMutator.ts
      ExitReasonLogger.ts
  services/
    runtime-config.ts
    provider-budget-service.ts
    provider-telemetry.ts
    adaptive/
      AdaptiveThresholdService.ts
      AdaptiveContextBuilder.ts
    enrichment/
      TokenEnrichmentService.ts
      clients/
        BirdeyeClient.ts
        HeliusClient.ts
        RugcheckClient.ts
        DexScreenerClient.ts
        TrenchClient.ts
        BubblemapsClient.ts
        SolsnifferClient.ts
        PumpFunPublicClient.ts
        JupiterTokenClient.ts
        GeckoTerminalClient.ts
        CieloClient.ts
        DefiLlamaClient.ts
    helius/
      HeliusWatchService.ts
      SmartWalletIngest.ts
      HeliusMigrationWatcher.ts
    pack/
      StrategyPackService.ts
      StrategyPackVersionRepo.ts
      PackGradingService.ts
    session/
      TradingSessionService.ts
    workbench/
      PackRepo.ts
      RunRunner.ts
      RunReporter.ts
      ManualEntryService.ts
    market/
      MarketIntelService.ts
      TokenInsightService.ts
    desk/
      HomePayloadBuilder.ts
      ShellBuilder.ts
      EventsBuilder.ts
      DiagnosticsBuilder.ts
    shared-token-facts.ts
    operator-events.ts
  api/
    server.ts
    routes/...
    middleware/...
    schemas/
  types/
    domain.ts
    strategy-pack.ts                  (new — absorbs discovery-lab-pack-types.ts)
  utils/
    logger.ts
    errors.ts
```

---

## 14. Deletion list (hard)

After phase 2 lands:
- `src/services/strategy-presets.ts`
- `src/services/discovery-lab-service.ts`
- `src/services/discovery-lab-strategy-calibration.ts`
- `src/services/discovery-lab-strategy-suggestion-service.ts`
- `src/services/discovery-lab-workspace-packs.ts`
- `src/services/discovery-lab-created-packs.ts`
- `src/services/discovery-lab-pack-types.ts` (content migrates)
- `src/services/discovery-lab-market-regime-service.ts`
- `src/services/discovery-lab-market-stats-service.ts`
- `src/services/discovery-lab-manual-entry.ts` (moved)
- `src/engine/graduation-engine.ts` (replaced)
- `src/engine/execution-engine.ts` (replaced by `engine/execution/*`)
- `src/services/live-trade-executor.ts` (folded into `engine/execution/*`)
- `src/engine/exit-engine.ts` (replaced by `engine/exit/*`)
- `src/services/strategy-exit.ts` (replaced by `ExitPlanBuilder`)
- `src/services/operator-desk.ts` (replaced by `services/desk/*`)

**Rough net code delta:** −7 800 lines gross / +4 500 lines new = ~3 300 line reduction. More importantly: no file >400 lines, every file single-purpose.

---

## 15. Acceptance criteria

- `runtime.ts` ≤300 lines and instantiates every service exactly once.
- No service imports another service except through constructor injection.
- `/api/candidates`, `/api/positions`, `/api/fills` return 404 post phase 2.
- Every webhook handler idempotent under replay (test proves it).
- Every provider call goes through `ProviderBudgetService` (grep check in CI).
- No `any` escapes the service boundary; public interfaces are fully typed.
- Smart-money pack meets the 7-day ingestion + 48 h sandbox gates (see [draft_backend_plan.md §5 — Smart-Money build](#smart-money-build) below).
- `AdaptiveThresholdLog` row present for every filter/exit mutation (test assertion).
- End-to-end "one candidate → one fill → one exit" test green in DRY mode.

---

## 16. Phasing (maps to global rollout)

**Phase 2 — Pack + extraction**
- `StrategyPackService`, `StrategyPackVersionRepo`, `ExitPlanBuilder`, `runtime.ts` trimmed to wiring only.
- Engine split: `graduation-engine.ts` → 4 files. Execution split: 5 files. Exit split: 4 files. Operator-desk split: 4 files.
- Delete duplicate `ProviderBudgetService` + `SharedTokenFactsService` instantiations.
- Dual-read / dual-write `Position.metadata.exitPlan` ↔ `ExitPlan` for 7 days.

**Phase 3 — Enrichment + Helius**
- `TokenEnrichmentService` + 8 new clients + `/api/operator/enrichment/:mint`.
- `HeliusWatchService` (merge migration watcher), LP + holders webhooks, `SmartWalletIngest` scaffolding (no pack wired yet).
- Feature flags default off; ops verifies TTL + budget before flipping.

**Phase 5 — Adaptive + packs + smart money**
- `AdaptiveThresholdService` + `AdaptiveContextBuilder`. Hook points live behind `settings.adaptive.enabled=false`.
- Seed packs 1–10 as `StrategyPack` DRAFT rows.
- Smart-money pack wired end-to-end with its 7-day ingestion + 48 h sandbox gates.

Every phase keeps loop semantics identical; only seams change.

---

## Smart-Money build (unchanged — detailed elsewhere)

The step-by-step build for pack 2 (`SMART_MONEY_RUNNER`) — wallet curation, webhook plumbing, signal aggregation, entry evaluator, exit wiring, rollout gates — is in [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) §B.1 pack 2, mirrored in the [smart-money-watcher skill](.agents/skills/smart-money-watcher/SKILL.md). Build here; no duplication in this doc.
