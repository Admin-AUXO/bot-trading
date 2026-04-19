# Execution Plan — Depth, Lane Selection, Soak

Companion to [draft_backend_plan.md §2.3](draft_backend_plan.md) and [draft_rollout_plan.md §3.3](draft_rollout_plan.md). Snapshot **2026-04-18**.

Execution services already exist. This plan covers the remaining work to declare the execution stack production-ready.

---

## 1. What's landed

| Service | File | Role |
|---|---|---|
| `QuoteBuilder` | [quote-builder.ts](trading_bot/backend/src/services/execution/quote-builder.ts) | Jupiter v6 quote, dynamic slippage, freshness window |
| `SwapBuilder` | [swap-builder.ts](trading_bot/backend/src/services/execution/swap-builder.ts) | Builds `VersionedTransaction` from a quote |
| `SwapSubmitter` | [swap-submitter.ts](trading_bot/backend/src/services/execution/swap-submitter.ts) | Sends + retries + writes `FillAttempt` rows + lane attribution |
| `HeliusPriorityFeeService` | [priority-fee-service.ts](trading_bot/backend/src/services/helius/priority-fee-service.ts) | `getPriorityFeeEstimate` with caching |
| `LiveTradeExecutor` | [live-trade-executor.ts](trading_bot/backend/src/services/live-trade-executor.ts) | Orchestrates the above; composed in `ExecutionEngine` |

The `FillAttempt` model at [schema.prisma:746](trading_bot/backend/prisma/schema.prisma) is the per-attempt ledger. `SubmitLane` enum (`JUPITER`, `JITO`, `SENDER`, `HELIUS_SENDER`) and `ProviderPurpose` flow through the submitter.

---

## 2. Lane selection policy

`SwapSubmitter.submit(input)` decides the lane. Policy below is the intended behavior; audit the submitter against it before declaring soak passed.

### 2.1 Buy side

| Market cap tier | Lane | Priority fee tier | Slippage cap |
|---|---|---|---|
| < $100k | `JITO` bundle | `p90` of `getPriorityFeeEstimate` | 15% |
| $100k – $1M | `HELIUS_SENDER` | `p75` | 8% |
| $1M – $10M | `JUPITER` (direct) | `p50` | 3% |
| > $10M | `JUPITER` | `p50` | 1.5% |

Rationale: small caps live on sub-second landing and tolerate higher slippage; large caps are dominated by slippage cost, not landing speed.

### 2.2 Exit side

Stop loss takes precedence over landing cost.

| Exit reason | Lane | Priority fee tier | Slippage cap |
|---|---|---|---|
| `STOP_LOSS` | `JITO` bundle | `p95` | 20% |
| `TAKE_PROFIT_*` | `HELIUS_SENDER` | `p75` | 5% |
| `TRAILING_STOP` | `HELIUS_SENDER` | `p75` | 8% |
| `TIME_STOP` | `JUPITER` | `p50` | 3% |

Rationale: SL must land; fee is a small fraction of the stopped loss.

### 2.3 Fallback ladder

1. Primary lane fails → retry once with +1 fee tier.
2. Second failure → fall to the next lane in `[JITO → HELIUS_SENDER → JUPITER]`.
3. Third failure on exit path with `STOP_LOSS` → escalate to operator via `OperatorEvent` with `severity: critical`.

Each attempt writes a `FillAttempt` row with `failureCode` populated on loss.

---

## 3. Soak verification

Before declaring execution-engine cutover production-ready:

- Run a 24 h paper session with LIVE lane selection enabled (but submit lane set to `DRY_RUN` for send).
- Session Overview dashboard: no panel red for > 15 m.
- Exit RCA dashboard: SL bundle land rate ≥ 0.95.
- `FillAttempt` counts match expectations: ~1 attempt per position for small caps, ~1.2 avg across tiers.
- Provider Credit Burn dashboard: within daily budget.

Document the soak run under `notes/sessions/<date>-execution-soak.md`.

---

## 4. Retry telemetry

`SwapSubmitter` writes `FillAttempt` rows. Missing on the dashboard side:

- `v_submit_lane_daily` view (see [draft_database_plan.md §4](draft_database_plan.md)) grouping by `lane × failureCode × date`.
- `v_recent_fill_activity` surfaces the last N attempts for live diagnostics.
- Panel `SL Land Rate` on Exit RCA: `SUM(landed) / SUM(attempts) WHERE reason = 'STOP_LOSS'` — binding on the alert `sl_bundle_fail_rate`.

---

## 5. Quote freshness

`QuoteBuilder` caches quotes with a short TTL. Rule: a quote older than 2 seconds is invalid for submission. Enforce in `SwapSubmitter` — reject and re-quote rather than submitting stale.

Add a metric: `quote_stale_rejections_total` surfaced via `ApiEvent` rows with `endpoint = 'jupiter.quote'` and `outcome = 'stale-reject'`. The Enrichment Quality dashboard can include this in a sibling panel.

---

## 6. Priority fee tiers

`HeliusPriorityFeeService` exposes `p50 / p75 / p90 / p95` estimates. Do not hardcode fee values. All tier references in `SwapSubmitter` should call the service.

Cap the absolute fee at `1_000_000` micro-lamports per transaction; log and fall back to the cap if the provider returns higher.

---

## 7. Parallel Work Packages

Execution-surface WPs. All independently mergeable; none touches files owned by other WPs in [draft_rollout_plan.md](draft_rollout_plan.md).

### WP-EX-1 — Lane selection audit + unit tests

**Owner:** `execution-builder`.
**Scope:** [services/execution/swap-submitter.ts](trading_bot/backend/src/services/execution/swap-submitter.ts) (read-only audit + inline comments), new `tests/execution/lane-selection.test.ts`.
**Acceptance:** one unit test per tier × side combination in §2.1 + §2.2 of this draft (8 rows); every test names the expected lane/fee tier/slippage cap; audit comment block in `swap-submitter.ts` above `selectLane(...)` cites the §2 policy.

**Prompt:**
> Read `services/execution/swap-submitter.ts` and verify the lane selection matches the policy tables in §2 of [draft_execution_plan.md](draft_execution_plan.md). Write `tests/execution/lane-selection.test.ts` with 8 cases (4 buy-tier + 4 exit-reason). Mock the RPC; assert chosen `SubmitLane`, `priorityFeeTier`, `slippageCap`. If the implementation diverges from §2, file a discrepancy in this draft's §4 (retry telemetry is separate) but do not silently fix — surface first. Add a comment block above `selectLane` citing §2. Do NOT touch `swap-builder.ts` or `quote-builder.ts`.

### WP-EX-2 — Priority fee cap + fallback

**Owner:** `execution-builder`.
**Scope:** [services/helius/priority-fee-service.ts](trading_bot/backend/src/services/helius/priority-fee-service.ts), [services/execution/swap-submitter.ts](trading_bot/backend/src/services/execution/swap-submitter.ts) fee-read site.
**Acceptance:** cap at `1_000_000` micro-lamports per tx; provider failure → static `p75` (200_000) + `OperatorEvent` warning; one test at `tests/helius/priority-fee-fallback.test.ts`.

**Prompt:**
> In `HeliusPriorityFeeService`, wrap `getPriorityFeeEstimate` with: (a) enforce cap of `1_000_000` micro-lamports — if provider returns higher, log and clamp; (b) on fetch failure, return static `{ p50: 100_000, p75: 200_000, p90: 400_000, p95: 600_000 }` and emit `OperatorEvent { severity: 'warning', detail: 'priority-fee fallback engaged' }`. In `swap-submitter.ts`, confirm every fee reference calls the service (no hardcoded values — grep `priorityFee.*= .*_000` returns zero). Write `tests/helius/priority-fee-fallback.test.ts` covering: healthy path, provider-5xx fallback, cap clamp.

### WP-EX-3 — Quote freshness enforcement

**Owner:** `execution-builder`.
**Scope:** [services/execution/quote-builder.ts](trading_bot/backend/src/services/execution/quote-builder.ts), [services/execution/swap-submitter.ts](trading_bot/backend/src/services/execution/swap-submitter.ts) submit site.
**Acceptance:** quote older than 2 s refuses submission; logged as `ApiEvent { endpoint: 'jupiter.quote', outcome: 'stale-reject' }`; one test covers the reject path.

**Prompt:**
> In `SwapSubmitter.submit(input)`, check `input.quote.fetchedAt` — if `Date.now() - fetchedAt > 2000`, reject with `StaleQuoteError` and emit `ApiEvent { endpoint: 'jupiter.quote', outcome: 'stale-reject', durationMs: age }`. `QuoteBuilder` already stamps `fetchedAt`; verify. Write `tests/execution/quote-freshness.test.ts` covering fresh (submits), 2 s stale (rejects), re-quote path. Do NOT change `QuoteBuilder`'s TTL — the enforcement lives at the submitter.

### WP-EX-4 — 24 h paper soak (= rollout B3)

**Owner:** manual operator + `execution-builder` for diagnostics.
**Scope:** runtime session; no code changes.
**Acceptance:** SL land rate ≥ 0.95 on Exit RCA; no dashboard alert fires > 15 m; `FillAttempt` avg retries ≤ 1.2 across tiers; credit burn within daily budget; session log under `notes/sessions/<date>-execution-soak.md`.

**Prompt:**
> Prerequisite: WP-EX-1/2/3 merged; rollout WP6 (helius) + WP11 (alerts) merged. Start a `mode=PAPER` session with `adaptive.enabled=true` for 24 h. Watch Session Overview, Exit RCA, Credit Burn, Adaptive Telemetry, Enrichment Quality dashboards. Log hourly snapshots. Green = SL land rate ≥ 0.95, no alert fires > 15 m, FillAttempt avg retries ≤ 1.2, credit burn within daily budget. At end, commit `notes/sessions/<date>-execution-soak.md` citing PR merges that made it into the soak and the measured metrics.

---

## 8. Acceptance

- Lane selection audit matches §2 — one unit test per tier × side combination.
- `v_submit_lane_daily` + `v_recent_fill_activity` landed and wired to Exit RCA.
- 24 h soak run logged in `notes/sessions/` with green metrics.
- SL land rate alert provisioned (see [draft_grafana_plan.md](draft_grafana_plan.md)).
- No direct Jupiter/RPC calls live outside `QuoteBuilder` / `SwapBuilder` / `SwapSubmitter` (grep `jupiter.com` outside `services/execution/` returns zero).
