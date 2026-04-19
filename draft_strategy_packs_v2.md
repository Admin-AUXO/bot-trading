# Strategy Packs v2 — 10 Seed Recipes

Companion to [draft_backend_plan.md §2.7](draft_backend_plan.md), [draft_rollout_plan.md §3.2](draft_rollout_plan.md). Snapshot **2026-04-18**.

This doc is a design spec. None of these packs exist as `StrategyPack` rows today. Seed them as DRAFT rows via `trading_bot/backend/scripts/seed-packs.mjs`; each runs 48 h in sandbox before TESTING, and only grade A/B flips to LIVE.

---

## 1. Recipe format

Every pack config JSON shares this shape (stored on `StrategyPackVersion.config`):

```jsonc
{
  "discovery": {
    "sources": ["birdeye-trending", "pumpfun-new"],
    "mcapRange": [lowUsd, highUsd],
    "ageRange": [minutesMin, minutesMax]
  },
  "filters": {
    "liquidityMinUsd": number,
    "holdersMin": number,
    "bundleSupplyPctMax": number,
    "topClusterPctMax": number,
    "solsnifferScoreMin": number,
    "entryScoreFloor": number
  },
  "composite": {
    "weights": { /* provider → 0..1, sums to 1 */ }
  },
  "exit": {
    "profile": "BALANCED" | "SCALPER" | "RUNNER" | "EXIT_LIQUIDITY" | "SAFE_TRAIL",
    "stopLossPercent": number,
    "tp1Multiplier": number, "tp1SellFraction": number,
    "tp2Multiplier": number, "tp2SellFraction": number,
    "trailingStopPercent": number,
    "timeStopMinutes": number,
    "timeStopMinReturnPercent": number
  },
  "sizing": {
    "capitalPerTradeUsd": number,
    "maxOpenPositions": number
  }
}
```

All numbers are pack-authored defaults; the adaptive engine may mutate them at runtime.

---

## 2. The 10 packs

### 1. `FRESH_LAUNCH_SNIPER`

**Thesis.** Catch new launches before the first KOTH. Tiny cap, tight stop, runner-type exit.

- Discovery: `pumpfun-new`, age 0–15 min, mcap $5k–$50k.
- Filters: liquidity ≥ $3k, holders ≥ 15, bundle % ≤ 15%, cluster % ≤ 25%.
- Composite weights: Trench 0.35, Solsniffer 0.15, Pump.fun 0.15, Cielo 0.10, rest 0.05 each.
- Exit: `RUNNER`, SL 25%, TP1 2× (30% sell), TP2 5× (50% sell), trail 20%, time stop 45 min.
- Size: $25 / trade, max 3 open.

### 2. `SMART_MONEY_RUNNER`

**Thesis.** Follow smart wallets into fresh mints within 10 minutes of first buy.

- Discovery: `smart-wallet-webhook` stream (depends on [draft_helius_integration.md §3.3](draft_helius_integration.md)).
- Filters: liquidity ≥ $10k, holders ≥ 30, smart-wallet count ≥ 2 unique, bundle % ≤ 12%.
- Composite weights: Cielo 0.30, Trench 0.20, Bubblemaps 0.15, Birdeye smart-money 0.20, rest 0.05 each.
- Exit: `BALANCED`, SL 18%, TP1 2×, TP2 4×, trail 15%, time stop 90 min.
- Size: $50 / trade, max 2 open.
- **Gate: 7 days clean `SmartWalletEvent` ingest before LIVE.**

### 3. `KOTH_GRADUATE`

**Thesis.** Post-KOTH but pre-$500k grad window.

- Discovery: `pumpfun-koth`, mcap $50k–$500k, age 30 min–6 h.
- Filters: liquidity ≥ $25k, holders ≥ 100, dev-bundle flag = false, top-cluster ≤ 20%.
- Composite weights: Pump.fun 0.20, Trench 0.20, Bubblemaps 0.15, Solsniffer 0.15, Cielo 0.10, rest 0.05 each.
- Exit: `BALANCED`, SL 15%, TP1 1.8×, TP2 3.5×, trail 12%, time stop 4 h.
- Size: $75 / trade, max 3 open.

### 4. `POST_GRADUATION_RUNNER`

**Thesis.** Once graduated to Raydium, ride momentum.

- Discovery: `birdeye-trending` filtered by `pumpfun-graduated-24h`, mcap $500k–$5M.
- Filters: liquidity ≥ $100k, holders ≥ 500, composite ≥ 0.6.
- Composite weights: Birdeye 0.20, GeckoTerminal 0.15, Trench 0.15, Bubblemaps 0.10, Cielo 0.15, Solsniffer 0.10, rest 0.05 each.
- Exit: `RUNNER`, SL 12%, TP1 1.5×, TP2 3×, trail 10%, time stop 12 h.
- Size: $150 / trade, max 3 open.

### 5. `CLUSTER_HUNTER`

**Thesis.** Early clusters with healthy concentration ≤ 15% buy before broader market notices.

- Discovery: `birdeye-trending`, mcap $100k–$1M, age 2–24 h.
- Filters: top-cluster ≥ 5% AND ≤ 15% (tight band), holders ≥ 200, Bubblemaps decentralization score ≥ 0.7.
- Composite weights: Bubblemaps 0.35, Trench 0.20, Cielo 0.15, Solsniffer 0.15, rest 0.05 each.
- Exit: `BALANCED`, SL 18%, TP1 1.7×, TP2 3×, trail 14%, time stop 6 h.
- Size: $75 / trade, max 2 open.

### 6. `LIQUIDITY_SNIPER`

**Thesis.** New Raydium pools with concentrated LP (no fake-split), mcap $1M–$10M.

- Discovery: `geckoterminal-new-pools`, age 0–2 h.
- Filters: LP in single pool ≥ 80% of total, liquidity ≥ $500k, holders ≥ 1000.
- Composite weights: GeckoTerminal 0.30, DefiLlama 0.15, Birdeye 0.20, Trench 0.10, Bubblemaps 0.10, rest 0.05 each.
- Exit: `SCALPER`, SL 8%, TP1 1.3× (70% sell), TP2 2× (remainder), trail 7%, time stop 2 h.
- Size: $200 / trade, max 2 open.

### 7. `SAFE_MIDCAP_TRAIL`

**Thesis.** Conservative; trail established mid-caps.

- Discovery: `birdeye-trending`, mcap $5M–$50M.
- Filters: liquidity ≥ $1M, holders ≥ 3000, Solsniffer score ≥ 70, composite ≥ 0.7.
- Composite weights: Solsniffer 0.25, Birdeye 0.20, GeckoTerminal 0.15, Bubblemaps 0.15, DefiLlama 0.10, rest 0.05 each.
- Exit: `SAFE_TRAIL`, SL 8%, TP1 1.3×, TP2 2×, trail 6%, time stop 24 h.
- Size: $300 / trade, max 4 open.

### 8. `EXIT_LIQUIDITY_SHORT_HOLD`

**Thesis.** Accept that most memes are exit-liquidity plays — get in for a 15% pop and leave.

- Discovery: `birdeye-trending`, mcap $200k–$2M, age 4–24 h.
- Filters: volume/liquidity ratio ≥ 3, holders ≥ 500, composite ≥ 0.5.
- Composite weights: Birdeye 0.25, Cielo 0.20, Trench 0.15, Solsniffer 0.15, rest 0.05 each.
- Exit: `EXIT_LIQUIDITY`, SL 10%, TP1 1.15× (100% sell), no TP2, no trail, time stop 60 min.
- Size: $200 / trade, max 4 open.

### 9. `WHALE_FOLLOW`

**Thesis.** Only trade when a top-100 Solana wallet (Birdeye `smart-money-v1/token-list`) opens a position.

- Discovery: `birdeye-smart-money-v1` poll (60 s).
- Filters: smart-money PnL on this mint last 24 h ≥ $10k net positive, liquidity ≥ $50k.
- Composite weights: Birdeye 0.35, Cielo 0.20, Trench 0.15, rest 0.05 each.
- Exit: `BALANCED`, SL 15%, TP1 1.8×, TP2 4×, trail 12%, time stop 3 h.
- Size: $100 / trade, max 3 open.

### 10. `REJECTION_TRADER`

**Thesis.** After a pack rejects a candidate, wait 30 min and re-evaluate. Many rejections reverse — buy on the second signal.

- Discovery: internal stream of `Candidate` rows with `status = REJECTED` in last 30 m.
- Filters: same as the originally-rejecting pack, but lower `entryScoreFloor` by 0.1.
- Composite weights: inherit from originating pack.
- Exit: `SCALPER`, SL 10%, TP1 1.25× (100% sell), time stop 45 min.
- Size: $50 / trade, max 2 open.

---

## 3. Seeding plan

1. Write `trading_bot/backend/scripts/seed-packs.mjs` that inserts the 10 packs as `StrategyPack` DRAFT rows + one `StrategyPackVersion` row each with the config JSON above.
2. Idempotent: if pack with `name` already exists, skip.
3. Operator promotes each pack DRAFT → TESTING via the UI; 48 h sandbox must pass before the UI allows flipping to LIVE (and only if grade ∈ {A, B}).

---

## 4. Review cadence

- After each pack has 30 live exits, recompute its composite-weight overrides against observed PnL per source.
- Retire any pack that graded D across two consecutive 7-day windows.
- Never edit a LIVE pack's config in place — always bump `StrategyPackVersion` and flip the pack to the new version.

---

## 5. Parallel Work Packages

Pack-surface WPs. WP-SP-1 = rollout WP8 = WP-BE-5. The others are operational follow-ups.

### WP-SP-1 — Seed 10 packs + validator extension (= rollout WP8)

**Owner:** `adaptive-engine-builder`.
**Scope:** per WP-BE-5 in [draft_backend_plan.md §4](draft_backend_plan.md). Single WP.

### WP-SP-2 — Pack promotion loop (= rollout B4)

**Owner:** manual operator + `adaptive-engine-builder` for diagnostics.
**Scope:** no new code — operator drives UI; harness uses existing `StrategyRunService` + `PackGradingService`.
**Acceptance:** each of the 10 packs DRAFT → TESTING via UI, runs 48 h sandbox, auto-grades; packs grading A/B move to LIVE via UI (operator consent + WP-UI-1 guards); `SMART_MONEY_RUNNER` additionally waits on WP-HE-2's 7-day gate; all transitions logged under `notes/sessions/<date>-pack-promotion.md`.

**Prompt:**
> Prerequisite: WP-SP-1 landed (10 DRAFT packs exist); Phase B3 paper soak green; WP-HE-2 smart-wallet gate active. For each pack: promote DRAFT → TESTING via `/workbench/packs` UI; the 48 h sandbox kicks off automatically. After 48 h, `PackGradingService` emits an A/B/C/D grade. Operator reviews grade + `/workbench/grader/:runId` verdicts. For A/B packs, flip to LIVE via UI — expect the server-side guards from WP-UI-1 (IP+TOTP) to engage. `SMART_MONEY_RUNNER` LIVE flip additionally blocks on WP-HE-2's 7-day gate — expect a clean rejection until 7 distinct days of `SmartWalletEvent` rows exist. Log every promotion under `notes/sessions/<date>-pack-promotion.md` with the grade, metrics, and any rejections encountered.

### WP-SP-3 — Pack review cadence cron

**Owner:** `adaptive-engine-builder`.
**Scope:** new [trading_bot/backend/scripts/pack-review.mjs](trading_bot/backend/scripts/pack-review.mjs), [trading_bot/n8n/workflows/pack-review.json](trading_bot/n8n/workflows/pack-review.json).
**Acceptance:** weekly cron recomputes composite-weight suggestions per pack based on the last 30 live exits; emits an `OperatorEvent { severity: 'info', detail: 'pack review ready: <name>' }`; never mutates `StrategyPackVersion` directly.

**Prompt:**
> Write `trading_bot/backend/scripts/pack-review.mjs` to run weekly (Mondays 08:00 UTC). For each LIVE pack with ≥ 30 exits since its current `StrategyPackVersion.createdAt`, recompute per-source correlation of (source-score × exitPnlUsd) across its exits and propose new weights. Write the proposal to a new `PackReviewProposal` table if WP-DB-1 has landed — else emit as `OperatorEvent { severity: 'info', detail: 'pack review: {name}: {weights}' }` with the JSON payload. Never mutate `StrategyPackVersion` directly — operator decides via UI. Register under `trading_bot/n8n/workflows/pack-review.json`.

### WP-SP-4 — Pack retirement job

**Owner:** `adaptive-engine-builder`.
**Scope:** extend `pack-review.mjs` from WP-SP-3.
**Acceptance:** any pack graded D across two consecutive 7-day windows auto-proposed for retirement via `OperatorEvent { severity: 'warning', detail: 'pack retirement: <name>' }`; never auto-retires without operator action.

**Prompt:**
> Extend `pack-review.mjs` from WP-SP-3: at the same weekly tick, check each LIVE pack's `grade` history over the last two 7-day windows (via `PackGradingService`). If both windows graded D, emit `OperatorEvent { severity: 'warning', detail: 'pack retirement candidate: {name}' }` with a link to the grader page. Never auto-flip status — operator decides. Test at `tests/workbench/pack-retirement.test.ts` covering: D+D → emit, D+C → silent, D+no-data → silent.

---

## 6. Acceptance

- 10 DRAFT rows exist after running the seed script.
- Each has one `StrategyPackVersion` with valid config (validator in [draft_backend_plan.md §2.4](draft_backend_plan.md) passes).
- None is LIVE without operator action.
- SMART_MONEY_RUNNER is gated on 7-day smart-wallet ingest.
