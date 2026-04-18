# Helius Integration — Deeper Wire-Up (phase 6)

Companion to [draft_index.md](draft_index.md), [draft_backend_plan.md](draft_backend_plan.md), [draft_credit_tracking.md](draft_credit_tracking.md), [draft_execution_plan.md](draft_execution_plan.md).

**Scope:** audit every Helius surface on the Developer plan, rank by trading value, assign each a service owner and a phase-6 verdict. Existing use today is narrow (migration logs + priority-fee estimate). This doc maps how to pull more signal out of a plan we are already paying for.

**Non-goals:** no LaserStream gRPC (Business-plan only). No Helius Sender behavior changes — execution uses it already; see [draft_execution_plan.md](draft_execution_plan.md).

---

## 1. Design principles

1. **One webhook per concern.** Smart-wallet, LP, holders, token-mint — each has its own endpoint, handler, and idempotency index.
2. **Stream first, poll second.** Any signal available via enhanced websocket or webhook must use that path before polling an RPC endpoint.
3. **Credit before call.** Every RPC/DAS call is routed through `ProviderBudgetService.requestSlot('helius', purpose)` — nothing reaches Helius without a slot and a purpose code.
4. **Dedupe at boundary.** Webhooks dedupe on `txSig + eventType`; streams dedupe on `(slot, txSig)`. Raw payloads are dropped after parse.
5. **Backpressure loud.** Enhanced websocket subscription cap = 100 per connection. Exceeding that pages — we do not silently drop.

---

## 2. Per-endpoint audit

Each block: signal · when to call · credit cost · rate limit · cache TTL · bucket · verdict. All credit costs cite [Helius billing docs](https://www.helius.dev/docs/billing/credits) unless marked "verify".

### 2.1 `getWalletFundedBy` (Wallet API)

- **Signal:** funding source of a wallet (CEX / mixer / fresh / bridge). Tags "bot farm" wallets vs. real hands.
- **When to call:** on demand — only during creator-lineage enrichment or smart-wallet curation. Never on every candidate.
- **Credit cost:** 100 / call. Expensive.
- **Rate limit:** not documented for Wallet API — verify empirically, cap at 1 rps.
- **Cache TTL:** 24 h (funding source is effectively static).
- **Bucket:** pre-entry filtering (creator lineage only).
- **Verdict:** **DEFER.** 100 credits × every creator is a budget killer. Only call for the top-20 creators by recent launch rate. Cache in `CreatorLineage.fundingSource`.

### 2.2 `getSignaturesForAsset`

- **Signal:** ordered tx history for a mint → enables rug-pattern detection and LP-exit timeline reconstruction.
- **When to call:** (a) once at enrichment on creator's prior mints (walk top 3), (b) post-hoc on a closed position to attribute an exit cause.
- **Credit cost:** 10 / call (DAS).
- **Rate limit:** 10 rps (DAS baseline on Developer).
- **Cache TTL:** 30 s for live positions, 24 h for closed / historical.
- **Bucket:** pre-entry filtering + smart-money stream quality (backfill).
- **Verdict:** **WIRE NOW.** Cheap, high-signal, already used by one codepath. Extend to creator-lineage walk.

### 2.3 `getTokenHolders`

- **Signal:** full holder distribution snapshot. Confirms top-N concentration and identifies whales not already in `SmartWallet`.
- **When to call:** once per accepted candidate (post-filter, pre-entry) to double-check concentration vs. Birdeye; optional re-check at position open.
- **Credit cost:** ~20 / call base; paginates at 1000 holders/page — large tokens cost 40–60.
- **Rate limit:** 10 rps (DAS).
- **Cache TTL:** 30 min. Top-10 set does not change fast outside of a dump.
- **Bucket:** pre-entry filtering.
- **Verdict:** **WIRE (gated).** Use for pre-entry confirm only when Birdeye top-10 % looks borderline (30–40 %). Do not poll; Helius `accountSubscribe` on the top-3 ATAs is the runtime signal.

### 2.4 `laserstreamSubscribe`

- **Signal:** sub-100 ms shred-level block stream.
- **Availability:** **Business plan only ($499/mo).** Developer does not get gRPC.
- **Verdict:** **SKIP** on current plan. Re-evaluate if we ever move pack 1 (`HIGH_CONVICTION_RUNNER`) to a same-block entry posture; until then the gap vs enhanced websocket is ~20–50 ms and not worth $475/mo.

### 2.5 `transactionSubscribe` (enhanced websocket)

- **Signal:** filtered transaction stream by program / account. For us: Pump.fun program (graduation + KOTH), Jupiter program (live swaps on a watched mint), Raydium LP program (LP add/remove).
- **When to call:** always-on from boot. One persistent connection per program family, ≤100 filters per connection.
- **Credit cost:** 2 per 0.1 MB streamed. Budget ~30 k credits/day steady-state for the filters we need.
- **Rate limit:** 100 filters/conn, 150 concurrent conns on Developer.
- **Cache TTL:** N/A (stream).
- **Bucket:** smart-money stream quality + open-position management (via LP filter).
- **Verdict:** **WIRE NOW.** Backbone of `HeliusWatchService`. Replaces the existing RPC `logsSubscribe` on migration with enhanced filters that actually carry parsed action + token delta, saving a `parseTransactions` follow-up in most cases.

### 2.6 `accountSubscribe` (enhanced websocket)

- **Signal:** account-state write events. For us: top-3 holder ATAs (holder dump), Raydium/Meteora LP reserve account (LP pull), dev wallet (dev dump).
- **When to call:** subscribe on position open; unsubscribe on position close. 3-5 subs per open position.
- **Credit cost:** 2 / 0.1 MB.
- **Rate limit:** 100 subs/conn. At 5 subs × 20 open positions = 100 — right at the cap; shard into 2 connections.
- **Cache TTL:** N/A.
- **Bucket:** open-position management.
- **Verdict:** **WIRE NOW.** Primary input to the `holder-dump` and `lp-removed` events consumed by `LiveExitMutator`.

### 2.7 `parseTransactions`

- **Signal:** Helius-decoded tx description + source + actions array. Disambiguates swap vs. withdraw vs. migration on a specific signature.
- **When to call:** only on signatures we already have (from webhook retry fallback, or after an accountSubscribe fires and we need the swap-in/out context). Never for discovery.
- **Credit cost:** 100 / call (up to 100 sigs per request — batch aggressively).
- **Rate limit:** 10 rps.
- **Cache TTL:** forever (tx is immutable); persist to `EnrichmentFact` where useful.
- **Bucket:** open-position management + smart-money stream quality (fallback).
- **Verdict:** **WIRE NOW (batched).** Never call with <20 sigs per batch — waste of credits. Used for LP-pull forensic confirmation and smart-wallet event deep-parse.

### 2.8 `getPriorityFeeEstimate`

- **Signal:** microlamport fee floor at `Min|Low|Medium|High|VeryHigh|UnsafeMax`.
- **When to call:** once per entry, once per exit, plus a 3-s cached value on the maintenance loop. See [draft_execution_plan.md §3](draft_execution_plan.md).
- **Credit cost:** 1 / call (RPC baseline — verify).
- **Rate limit:** 50 rps on Developer.
- **Cache TTL:** 3 s (one slot). Cache per `priorityLevel`.
- **Bucket:** execution-priority-fees.
- **Verdict:** **ALREADY WIRED; FORMALIZE CACHE.** Add `PriorityFeeCache` with 3 s TTL and a purpose-code tag so burn is attributable.

### 2.9 Enhanced webhooks

- **Signal:** server-push per-address or per-program events (SWAP, TRANSFER, ADD_LIQUIDITY, WITHDRAW_LIQUIDITY, TOKEN_MINT, NFT_MINT).
- **When to call:** boot-time registration via `ensureWebhooks()`; ongoing reconciliation on pack / position change. Helius supports up to 100 000 addresses per webhook, but we shard so one webhook endpoint = one concern (smart-wallet / LP / holders).
- **Credit cost:** 1 / event delivered. Predictable.
- **Rate limit:** delivery retries 3× at 1 s gap — always return 204, never 5xx (that triggers extra retries and doubles credit burn).
- **Cache TTL:** N/A.
- **Bucket:** all three (filtering + position mgmt + smart-money).
- **Verdict:** **WIRE NOW.** Three endpoints per [draft_backend_plan.md §7](draft_backend_plan.md). Dedupe on `txSig + kind` — Helius may deliver the same event 2-3×.

### 2.10 `searchAssets` (DAS by creator / authority)

- **Signal:** every asset minted by a creator wallet → rug-rate + launch-cadence history.
- **When to call:** once per unique creator seen (cached 6 h in `CreatorLineage`).
- **Credit cost:** 10 / call.
- **Rate limit:** 10 rps.
- **Cache TTL:** 6 h.
- **Bucket:** pre-entry filtering.
- **Verdict:** **WIRE NOW.** Feeds the creator-lineage banner on `/market/token/[mint]` and an entry-gate boolean (`creator.rugRate > 0.4 → reject`).

### 2.11 Helius Sender

- **Signal:** low-latency tx submission across 7 regions + parallel Jito routing.
- **Credit cost:** 0 (tip only, min 0.001 SOL).
- **Verdict:** **ALREADY WIRED.** No phase-6 change here beyond the fee/tip strategy in [draft_execution_plan.md](draft_execution_plan.md).

### 2.12 `getAssetsByOwner`, `getAsset`

- **Signal:** wallet holdings / single-asset metadata.
- **Verdict:** **DEFER.** `getAsset` is useful for a rare manual-entry metadata fetch; `getAssetsByOwner` is not needed — we track wallets via webhooks + `accountSubscribe`, not periodic polls.

### 2.13 Not covered / skipped

- `getBlock`, `getProgramAccounts`, `getTokenAccounts` (paginated holder dump) — all have better alternatives on our plan. Flag in `TokenEnrichmentService` so they can't be added on a whim.

---

## 3. Outcome maps

### 3.1 Pre-entry filtering

| Endpoint | Signal | Trigger | Credits | TTL | Owner |
|---|---|---|---|---|---|
| `searchAssets` (creator) | prior mints by creator → rug rate | first time we see this creator | 10 | 6 h | `TokenEnrichmentService` |
| `getSignaturesForAsset` | creator-lineage backfill (top 3 prior mints) | chained after `searchAssets` | 10 × 3 | 24 h | `TokenEnrichmentService` |
| `getWalletFundedBy` | creator funding source | creator rug rate > 0 but < block threshold | 100 | 24 h | `TokenEnrichmentService` |
| `getTokenHolders` | confirm Birdeye top-10 % when borderline | Birdeye top-10 ∈ [30 %, 40 %] | 20–60 | 30 min | `TokenEnrichmentService` |

Compiled feed: `CreatorLineage{ creatorAddress, priorMints, rugRate, fundingSource, lastSampledAt }`.

### 3.2 Open-position management

| Endpoint | Signal | Trigger | Credits | TTL | Owner |
|---|---|---|---|---|---|
| `accountSubscribe` (LP reserve) | LP pulled | reserve → 0 or decrease > 80 % in 1 slot | 2 / 0.1 MB | stream | `HeliusWatchService` |
| `accountSubscribe` (top-3 ATA) | holder dump | balance delta > 20 % in 5 min | 2 / 0.1 MB | stream | `HeliusWatchService` |
| `accountSubscribe` (dev wallet) | dev dump | dev SOL-out > 50 % | 2 / 0.1 MB | stream | `HeliusWatchService` |
| webhook `WITHDRAW_LIQUIDITY` | LP pull, forensic | fallback if `accountSubscribe` missed | 1 / event | event | `HeliusWatchService` |
| `getPriorityFeeEstimate` | priority fee for exit swap | every exit fire | 1 | 3 s | `ExecutionEngine` |
| `parseTransactions` (batched) | confirm LP-pull tx | after `lp-removed` event emitted | 100 / batch | immutable | `HeliusWatchService` |

### 3.3 Smart-money stream quality

| Endpoint | Signal | Trigger | Credits | TTL | Owner |
|---|---|---|---|---|---|
| webhook `SWAP` on tracked cohort | smart-wallet buy/sell | continuous | 1 / event | event | `SmartWalletIngest` |
| `transactionSubscribe` (Jupiter, filtered by account list) | same as above — backup | always-on | 2 / 0.1 MB | stream | `HeliusWatchService` |
| `getSignaturesForAsset` | wallet backfill after webhook gap | drop-rate alert trigger | 10 | 30 s | `SmartWalletIngest` |
| `getWalletFundedBy` | new wallet curation | when an unknown wallet gets added to `SmartWallet` | 100 | 24 h | `SmartWalletCurator` (pack-2 tool, out of loop) |

Cohorting rule: 40–60 tracked addresses, sharded ≤25 per webhook → 2-3 webhooks. The duplicate `transactionSubscribe` filter acts as a dead-letter fallback if webhook delivery drops; dedupe on `txSig`.

---

## 4. Webhook transaction types — what to wire

Helius exposes 100+ parsed types. Memecoin-useful subset:

| Type | Use | Endpoint |
|---|---|---|
| `TOKEN_MINT` | pump.fun mint confirmation (cross-check migration) | `lp` (reuses infra) |
| `SWAP` | smart-wallet trades | `smart-wallet` |
| `ADD_LIQUIDITY` | new pool detected | `lp` |
| `WITHDRAW_LIQUIDITY` | LP pull (forensic / backup) | `lp` |
| `TRANSFER` | top-holder movement fallback | `holders` |
| `UNKNOWN_*` | unparsed — log, do not react | dropped at parse |

Everything else (NFT, staking, lending, governance) is irrelevant — reject at parse so an accidental subscription doesn't burn credits.

---

## 5. Stream-vs-webhook decision guide

```
  REQUIREMENT                           PICK
  ───────────────────────────────────── ─────────────────────
  sub-100 ms, same-slot reaction         laserstream gRPC        (Business only — SKIP)
  continuous program-wide filter         transactionSubscribe    (enhanced WSS)
  per-position account watching          accountSubscribe        (enhanced WSS)
  server-push for bounded address set    enhanced webhook
  historical backfill on a mint          getSignaturesForAsset
  historical forensic on a tx            parseTransactions
  priority-fee floor                     getPriorityFeeEstimate
```

Rule of thumb: if we already own the address list, use webhooks. If we need to filter by program and can't enumerate addresses ahead of time, use `transactionSubscribe`. Never poll for something that streams.

---

## 6. Gotchas (codify in tests)

1. **Webhook retries** — Helius sends each event up to 3× at 1 s intervals on non-2xx. Always return 204, dedupe on `txSig + kind`.
2. **WSS idle disconnect** — enhanced websocket drops after ~10 min silent. Ping every 60 s; auto-reconnect with jittered backoff.
3. **Subscription cap** — 100 per connection, 150 concurrent connections. `HeliusWatchService.subscriptionCount()` must page `operator-events` before hitting 90 %.
4. **DAS pagination** — `searchAssets`, `getSignaturesForAsset`, `getTokenAccounts` cap at 1000/page. Batch carefully inside 10 rps.
5. **Streaming credit metering** — billed monthly in arrears per 0.1 MB. Log bytes streamed per filter to `ApiCreditLog` so Grafana can show live vs. steady-state.
6. **Sender vs Jito** — both consume SOL tip (separate lines). Tag priority-fee calls with `purpose=entry|exit|mutator` so credit attribution is clean.

---

## 7. Service wiring summary

```
HeliusWatchService (one class, many connections)
  ├── conn:A  transactionSubscribe  [Pump.fun program]      → runtime event: migration
  ├── conn:A  transactionSubscribe  [Raydium LP program]    → runtime event: lp-added
  ├── conn:B  accountSubscribe      [per-position LP × N]   → runtime event: lp-removed
  ├── conn:B  accountSubscribe      [per-position top-3 × N]→ runtime event: holder-dump
  ├── conn:C  accountSubscribe      [per-position dev × N]  → runtime event: dev-dump
  └── webhooks /helius/{smart-wallet,lp,holders}            → same event bus

TokenEnrichmentService (on-demand DAS)
  ├── searchAssets(creator)           → CreatorLineage.priorMints
  ├── getSignaturesForAsset(prior)    → CreatorLineage.rugRate (backfill)
  ├── getWalletFundedBy(creator)      → CreatorLineage.fundingSource  (gated)
  └── getTokenHolders(mint)           → EnrichmentFact(source=helius-holders)

ExecutionEngine
  └── getPriorityFeeEstimate          (3 s cache, per purpose-code)

SmartWalletIngest
  ├── webhook SWAP                    → SmartWalletEvent
  ├── transactionSubscribe (backup)   → SmartWalletEvent (dedupe)
  └── parseTransactions (batched 20+) → deep-parse on suspicious entries only
```

---

## 8. Acceptance criteria

- Enhanced webhooks registered by `ensureWebhooks()` on boot, reconciled on pack/session change.
- Every webhook endpoint returns 204 within p95 50 ms, idempotent under replay (test with fixture).
- `HeliusWatchService.subscriptionCount()` logged per minute; alarm at ≥90 % of cap.
- All DAS calls flow through `ProviderBudgetService.requestSlot('helius', <purpose>)`; grep-enforced in CI.
- `ApiCreditLog` records bytes streamed per filter, credits per DAS call, credits per event.
- Smart-wallet webhook + `transactionSubscribe` dedupe test: same `txSig` via both paths produces exactly one `SmartWalletEvent` row.
- Priority-fee cache 3 s TTL enforced; miss-vs-hit ratio visible on the Credit Burn dashboard.

---

## 9. Open questions (verify during build)

- `getPriorityFeeEstimate` exact credit cost — docs ambiguous; instrument and measure.
- `getWalletFundedBy` rate limit — undocumented; cap at 1 rps until tested.
- Webhook burst ceiling — Helius has not published a concurrent-delivery cap. Instrument `webhook-dropped` on the event bus and trend it.
- `transactionSubscribe` parsed-payload stability — some obscure programs decode to `UNKNOWN_*`; maintain a fallback to `parseTransactions` on first sight.

---

## 10. Phase-6 ordering

1. `ensureWebhooks()` + three endpoints + signature middleware. Wire smart-wallet flow end-to-end in paper mode.
2. `accountSubscribe` per-position block. Flip `lp-removed` / `holder-dump` to real events.
3. `transactionSubscribe` for Pump.fun + Raydium LP (replaces `logsSubscribe` migration).
4. `searchAssets` + `getSignaturesForAsset` creator-lineage walker.
5. Formalize `getPriorityFeeEstimate` cache with purpose codes.
6. Batched `parseTransactions` forensic path (LP-pull / smart-wallet deep-parse).
7. Ship `getWalletFundedBy` last, gated behind `settings.enrichment.helius.fundingSourceProbe=false` until credit burn is well understood.

All of the above lands behind `settings.helius.<feature>.enabled` flags; default off; flip per rollout-plan guardrails.

---

## Sources

- [Helius pricing](https://www.helius.dev/pricing)
- [Plans & billing](https://www.helius.dev/docs/billing/plans)
- [Credits catalog](https://www.helius.dev/docs/billing/credits)
- [Enhanced websockets (next-gen)](https://www.helius.dev/blog/introducing-next-generation-enhanced-websockets)
- [Laserstream powers all websockets](https://www.helius.dev/blog/laserstream-websockets)
- [Webhook transaction types](https://www.helius.dev/docs/webhooks/transaction-types)
- [Priority-fee API](https://www.helius.dev/docs/priority-fee-api)
- [Zero-slot execution blog](https://www.helius.dev/blog/zero-slot)
- [Wallet API overview](https://www.helius.dev/docs/wallet-api/overview)
- [DAS API overview](https://www.helius.dev/docs/das-api)
