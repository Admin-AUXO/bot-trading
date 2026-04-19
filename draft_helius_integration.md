# Helius Integration — Streaming, Webhooks, Smart Money

Companion to [draft_backend_plan.md §2.3](draft_backend_plan.md), [draft_rollout_plan.md §3.5](draft_rollout_plan.md). Snapshot **2026-04-18**.

The repo uses the Helius Developer plan. This plan covers Helius surface ownership: what's landed, what's shallow, and what remains before the smart-money pack can flip LIVE.

---

## 1. What's landed

| Service | File | Scope |
|---|---|---|
| `HeliusPriorityFeeService` | [priority-fee-service.ts](trading_bot/backend/src/services/helius/priority-fee-service.ts) | `getPriorityFeeEstimate` with caching |
| `HeliusWatchService` | [helius-watch-service.ts](trading_bot/backend/src/services/helius/helius-watch-service.ts) | Webhook ingest (smart-wallet, LP, holders) with signature verify + replay dedupe |
| `HeliusClient` (thin RPC wrapper) | [helius-client.ts](trading_bot/backend/src/services/helius-client.ts) | DAS + RPC wrapper |
| `HeliusMigrationWatcher` | [helius-migration-watcher.ts](trading_bot/backend/src/services/helius-migration-watcher.ts) | Pumpfun migration detection |

Webhook routes already wired:

- `POST /webhooks/helius/smart-wallet` → `HeliusWatchService.ingestSmartWalletWebhook`
- `POST /webhooks/helius/lp` → `HeliusWatchService.ingestLpWebhook`
- `POST /webhooks/helius/holders` → `HeliusWatchService.ingestHoldersWebhook`

`HELIUS_WEBHOOK_SECRET` is required; every webhook verifies the signature before parse.

---

## 2. Endpoint usage audit

| Helius surface | Status | Notes |
|---|---|---|
| DAS `getAsset` / `searchAssets` | Used ad-hoc | Should route via `HeliusClient` with budget slot |
| DAS `getAssetsByOwner` | Used in creator-lineage path | Non-centralized; belongs in `HeliusWatchService.loadCreatorLineage(creator)` |
| RPC `getSignaturesForAsset` | Used in creator + bundle fallback | Credit heavy; cap to post-accept only |
| RPC `getTokenHolders` | Not used yet | Will be needed for the Bubblemaps fallback |
| Enhanced websocket (`accountSubscribe`, `transactionSubscribe`) | Not centralized | Plan: single connection managed by `HeliusWatchService`, fan out to subscribers |
| Priority fee estimate | Centralized in `HeliusPriorityFeeService` | Good |
| Webhook management (`createWebhook`, `deleteWebhook`) | Not wired | Webhooks today are provisioned manually — operator creates in Helius dashboard |
| Sender endpoint | Used in `SwapSubmitter` | Good |
| Laserstream | Not used | Deferred |

---

## 3. Remaining work

### 3.1 Webhook auto-provisioning

Today webhooks are manual — the operator registers them in the Helius dashboard. This breaks in two ways: fresh boots don't know which webhooks exist, and per-position webhooks can't respect the 5-cap.

Plan:
- On `HeliusWatchService` boot, call `getAllWebhooks` and reconcile against expected webhooks for active positions + curated smart wallets.
- On position open → call `createWebhook` with the mint as the account. On position close → `deleteWebhook`.
- Enforce cap: max 5 per active position + 60 smart-wallet subscriptions. Refuse new webhooks past cap with `OperatorEvent { severity: warning }`.
- Expose `GET /api/operator/helius/webhooks` (list) and `DELETE /api/operator/helius/webhooks/:id` (force clean).

### 3.2 Enhanced websocket ownership

`transactionSubscribe` + `accountSubscribe` should have one owner. Today `ExitEngine` imports `SmartWalletMintActivity` directly from `HeliusWatchService`, but holder-delta and LP-change subscriptions live outside.

Plan:
- `HeliusWatchService.subscribe({ kind: 'holders' | 'lp' | 'price', mint })` returns an async iterator.
- Consumers: `ExitEngine` (holder dump detection, LP pull detection), `TokenEnrichmentService` (live composite refresh on hot candidates).
- Single shared connection; reconnect with exponential backoff; metric `helius_ws_reconnects_total`.

### 3.3 Smart-wallet stream + 7-day gate

`SmartWalletEvent` rows populate from the `smart-wallet` webhook. Missing:

- Curated wallet list in `SmartWallet` table — seed from Birdeye gainers/losers (7-day PnL > $50k) + operator adds.
- Funding-source attribution: on wallet add, call `getWalletFundedBy` and persist as `SmartWalletFunding` (table exists).
- 7-day clean-ingest counter: a query on `SmartWalletEvent.createdAt` distinct-day count must return 7 before the `SMART_MONEY_RUNNER` pack can flip LIVE. Enforce in `PackRoute` on the `LIVE` flip.

### 3.4 Creator lineage live hooks

`CreatorLineage` rows populate only on `/market/token/:mint` navigation today. Plan: on candidate accept, kick off a background `loadCreatorLineage(creator)` that writes to the table. If already present and < 24 h old, skip.

Budget: ~50 credits per creator. Gated by `ProviderBudgetService` with purpose `ENRICHMENT_CREATOR_LINEAGE`.

### 3.5 Priority fee service hardening

- Cache TTL: 2 seconds is aggressive enough for meme-scale markets; confirm.
- Fallback: if Helius fee endpoint fails, use a static `p75` default (`200_000` micro-lamports) with an `OperatorEvent` warning.
- Cap: never exceed `1_000_000` micro-lamports per tx (see [draft_execution_plan.md §6](draft_execution_plan.md)).

---

## 4. Stream vs webhook — when to use which

| Signal | Mechanism | Why |
|---|---|---|
| Smart-wallet buys/sells | Webhook | Low volume, per-wallet subscription matches Helius pricing |
| LP pull | Webhook (pool-level) | Event-driven; rare but critical — must not miss |
| Holder-count delta | Enhanced websocket | High volume; webhook would thrash |
| Price tick | Enhanced websocket | High volume |
| Bundle detection | `getSignaturesForAsset` fallback | Only when Trench is degraded |

---

## 5. Credit budget per surface

Every Helius call is gated by `ProviderBudgetService.requestSlot('helius', purpose)`. Purposes:

| Purpose | Expected calls/day | Credits/call |
|---|---|---|
| `DISCOVERY` (never for Helius — reject) | 0 | — |
| `ENRICHMENT_CREATOR_LINEAGE` | ~200 | ~50 |
| `ENRICHMENT_HOLDERS` | ~500 | ~20 |
| `ENRICHMENT_BUNDLE_FALLBACK` | rare | ~80 |
| `EXEC_PRIORITY_FEE` | ~high (cached) | 1 |
| `EXEC_SENDER` | per submit | 0 (plan-covered) |
| `WEBHOOK_MGMT` | low | 0 |

Daily Helius budget projection feeds the Credit Burn dashboard.

---

## 6. Parallel Work Packages

Helius-surface WPs. WP-HE-1 collides only with itself; the rest are additive and safe to run alongside.

### WP-HE-1 — Webhook auto-prov + WS ownership (= rollout WP6)

**Owner:** `helius-watcher`.
**Scope:** [services/helius/helius-watch-service.ts](trading_bot/backend/src/services/helius/helius-watch-service.ts), new [api/routes/helius-admin-routes.ts](trading_bot/backend/src/api/routes/helius-admin-routes.ts), engine runtime wiring at [engine/runtime.ts](trading_bot/backend/src/engine/runtime.ts), new `tests/helius/helius-watch-service.test.ts`.
**Acceptance:** boot reconciles via `getAllWebhooks`; position open → `ensurePositionWebhook`; position close → `removePositionWebhook`; 5+60 cap enforced; `GET /api/operator/helius/webhooks`, `DELETE /api/operator/helius/webhooks/:id` gated by auth.

**Prompt:**
> Extend `HeliusWatchService`: add `reconcileAtBoot()` (calls `getAllWebhooks`, logs drift into `OperatorEvent`), `ensurePositionWebhook(mint)` + `removePositionWebhook(mint)` (uses `HeliusClient.createWebhook` / `deleteWebhook`), `subscribe({ kind: 'holders'|'lp'|'price', mint })` returning an async iterator over a single shared enhanced-websocket connection with exponential-backoff reconnect. Enforce cap: max 5 webhooks per active position + 60 smart-wallet subscriptions — refuse with `OperatorEvent { severity: 'warning', detail: 'helius webhook cap reached' }`. Wire `engine/runtime.ts` to fire `ensurePositionWebhook` on position open and `removePositionWebhook` on close. Add `api/routes/helius-admin-routes.ts` exposing `GET /api/operator/helius/webhooks` (list) and `DELETE /api/operator/helius/webhooks/:id` under the auth middleware used by other operator routes. Write `tests/helius/helius-watch-service.test.ts` covering signature verify, replay dedupe, cap enforcement, reconnect.

### WP-HE-2 — Smart-wallet 7-day gate

**Owner:** `helius-watcher`.
**Scope:** [services/workbench/strategy-pack-service.ts](trading_bot/backend/src/services/workbench/strategy-pack-service.ts) LIVE-flip path, new `services/helius/smart-wallet-gate.ts`.
**Acceptance:** `SMART_MONEY_RUNNER` pack LIVE flip blocks until `SmartWalletEvent` has 7+ distinct days of rows; operator sees `smart-wallet-gate` rejection reason.

**Prompt:**
> Create `services/helius/smart-wallet-gate.ts` exporting `async function checkSmartWalletCleanIngest(days = 7): Promise<{ ok: boolean; distinctDays: number }>` — query `SmartWalletEvent` `SELECT COUNT(DISTINCT date_trunc('day', createdAt))` and return whether ≥ 7. Wire into `StrategyPackService.setStatus(packId, 'LIVE')`: if the pack's `kind === 'SMART_MONEY_RUNNER'` and `checkSmartWalletCleanIngest().ok === false`, throw `PackGateRefused({ reason: 'smart-wallet-gate', distinctDays })`. Test at `tests/workbench/smart-wallet-gate.test.ts` with fixture data (6 distinct days → refuse, 7 → pass).

### WP-HE-3 — Creator lineage background load

**Owner:** `enrichment-integrator`.
**Scope:** [services/helius/helius-watch-service.ts](trading_bot/backend/src/services/helius/helius-watch-service.ts) (add `loadCreatorLineage(creator)`), [engine/graduation-engine.ts](trading_bot/backend/src/engine/graduation-engine.ts) candidate-accept hook.
**Acceptance:** on every candidate accept, a `CreatorLineage` row exists for the creator within 60 s (or was already < 24 h old); budget gated by `ProviderBudgetService` with purpose `ENRICHMENT_CREATOR_LINEAGE`.

**Prompt:**
> Add `HeliusWatchService.loadCreatorLineage(creator: string): Promise<void>` that: (a) checks `CreatorLineage` for this creator and returns early if row exists and `updatedAt > now() - 24h`, (b) calls `ProviderBudgetService.requestSlot('helius', 'ENRICHMENT_CREATOR_LINEAGE')`, (c) on slot, calls `HeliusClient.searchAssets({ creator })` + `getSignaturesForAsset(creator)`, (d) upserts `CreatorLineage` with prior launches + rug-rate estimate. Wire into `GraduationEngine` candidate-accept path as a fire-and-forget background task (do not block the accept decision). Do NOT touch the market-page path — it stays as-is. Test at `tests/helius/creator-lineage.test.ts` covering fresh fetch, 24 h cache hit, budget-denied skip.

### WP-HE-4 — Priority fee service hardening (= WP-EX-2)

**Owner:** `execution-builder`.
**Scope:** `services/helius/priority-fee-service.ts`. See [draft_execution_plan.md](draft_execution_plan.md) WP-EX-2 for the full prompt.
**Acceptance:** cap clamp + fallback + one test. Shared between this draft and execution — owned by `execution-builder`.

---

## 7. Acceptance

- Webhook auto-provisioning lands; fresh boot reconciles and enforces cap.
- `HeliusWatchService.subscribe` owns all websocket traffic; ad-hoc connections elsewhere grep clean.
- `SmartWalletEvent` has 7+ distinct-day rows before `SMART_MONEY_RUNNER` pack is allowed to flip LIVE.
- `CreatorLineage` populates on candidate accept.
- `HeliusPriorityFeeService` fallback path exercised in a test.
- `/api/operator/helius/webhooks` returns the active list.
