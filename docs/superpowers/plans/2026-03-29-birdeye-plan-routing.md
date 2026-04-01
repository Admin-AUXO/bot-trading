# Birdeye Lite/Starter Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the bot operational on Birdeye Lite and Starter by removing fixed-cadence Birdeye spend from discovery, analytics, and exit fast paths while preserving safety-critical Birdeye scoring and selective slow-path refreshes.

**Architecture:** Keep Helius as the event, confirmation, and wallet-truth plane. Add a small `market-router` in `backend/src/services/` so strategies, `ExitMonitor`, `OutcomeTracker`, and regime/market-tick jobs ask for normalized seed, prefilter, price, and exit-refresh data instead of hardcoding provider calls. Use Jupiter for cheap prices and category seeds, DEX Screener for cheap pair and liquidity prefilter, and Birdeye only for final scoring, S2 catch-up, and rare slow-path refreshes.

**Tech Stack:** TypeScript ESM, Node 24, Express, Prisma 7, PostgreSQL 16, Helius RPC/WSS, Birdeye REST, Jupiter REST, DEX Screener REST, optional PumpPortal WSS, optional Raydium and Meteora REST.

---

## Repo-fit corrections to the March 29 draft

- `trading_bot/backend/src/core/stats-aggregator.ts` only boots the worker. The duplicated daily-budget math that must stay in sync lives in `trading_bot/backend/src/workers/stats-aggregator.ts`.
- `trading_bot/backend/src/services/jupiter.ts` still hardcodes `https://quote-api.jup.ag/v6` and `https://price.jup.ag/v6/price`. Fix that before moving any fast path to Jupiter.
- `trading_bot/backend/src/core/api-budget-manager.ts` still models quota blockers only for `HELIUS` and `BIRDEYE`. Do not jam Jupiter or DEX Screener into Birdeye-style monthly reserve logic unless the provider actually has that billing model.
- `trading_bot/backend/src/services/outcome-tracker.ts` owns the per-minute price backfill loop. `trading_bot/backend/src/bootstrap/intervals.ts` only owns the separate `wouldHaveWon` pass every 10 minutes. Wrong file, wrong fix, wasted time.
- `trading_bot/backend/src/core/regime-detector.ts` and `trading_bot/backend/src/services/market-tick-recorder.ts` persist `trendingCount`. If the source stops being Birdeye trending, keep the field shape or relabel docs and dashboard together. No Prisma/view churn in the base phase.
- The repo already uses `Math.ceil(n^0.8 * 5)` for Birdeye `multi_price`. Birdeye now publishes that batch formula, so phase 1 should replace the "internal guess" framing with a shared, source-backed helper.
- `trading_bot/dashboard/features/quota/quota-page-client.tsx` and `trading_bot/dashboard/lib/api.ts` are already service-dynamic and typed for `JUPITER`. Do not create dashboard churn unless the API contract really changes.

## Current repo evidence

- `trading_bot/backend/src/bootstrap/runtime.ts` wires `JupiterService`, `BirdeyeService`, `ExitMonitor`, `OutcomeTracker`, `MarketTickRecorder`, `S1`, `S2`, and `S3`.
- `trading_bot/backend/src/bootstrap/intervals.ts` does a 60s regime refresh with Jupiter SOL price plus Birdeye trending, hourly Birdeye credit sync, daily wallet scoring, hourly stats aggregation, and the 10m `wouldHaveWon` pass.
- `trading_bot/backend/src/services/market-tick-recorder.ts` does a 5m Jupiter SOL price plus Birdeye trending write.
- `trading_bot/backend/src/services/outcome-tracker.ts` still uses Birdeye `multi_price` for signal, position, wallet-activity, and graduation-event backfills.
- `trading_bot/backend/src/core/exit-monitor.ts` still polls Birdeye `multi_price` every 5s and pulls Birdeye trade-data per S3 position for fade checks.
- `trading_bot/backend/src/strategies/momentum.ts` still scans Birdeye `token/list` every 20s.
- `trading_bot/backend/src/strategies/graduation.ts` still runs dual Birdeye `meme/list` scans every 20s plus a 5m `new_listing` fallback.
- `trading_bot/backend/src/strategies/copy-trade.ts` still uses Birdeye for final scoring, wallet-activity price capture, and daily top-trader seed discovery.

## Verified provider facts

Facts verified on **April 2, 2026**:

- Birdeye pricing still shows:
  - `Lite`: `1,500,000 CUs/MO`, `15 RPS`, `WebSocket Access: No`
  - `Starter`: `5,000,000 CUs/MO`, `15 RPS`, `WebSocket Access: No`
- Birdeye pricing docs still show Lite/Starter as `Most APIs` at `15 rps`, while Premium Plus and Business add websockets. Treat Lite/Starter as no-websocket plans.
- Birdeye package-access docs still show the current repo's single-token endpoints on Lite/Starter, including `token_trending`, `token_security`, `token/holder`, `token/meme/list`, and `token/meme/detail/single`.
- Birdeye now publishes batch-token CU math:
  - `Batch CU Cost = N^0.8 * Base CU Cost`, rounded up
  - `/defi/multi_price` base cost = `5`
  - `/defi/multi_price` `n_max` = `100`
- Helius Developer still shows `10,000,000` monthly credits, `50` RPC req/s, `10` DAS req/s, and `150` concurrent WebSocket connections.
- Helius credits docs still price:
  - `getSignaturesForAddress` = `10`
  - `getTransaction` = `10`
  - `getTransactionsForAddress` = `100`
- Helius docs now also announce streaming-metering changes effective **April 7, 2026**, with Standard and Enhanced WebSockets billed at `2 credits per 0.1 MB`, and broad WSS metering activation on **May 1, 2026**. That is a docs/update item, not base-phase scope for byte-level budget math.
- Jupiter portal docs now require `x-api-key` on `https://api.jup.ag/`.
- Jupiter Free still uses a fixed `60 rpm` rate limit, but the current docs now describe separate buckets:
  - `Default` bucket for standard API traffic
  - dedicated `Price API` bucket for `/price/v3`
- Jupiter Price docs still expose `GET https://api.jup.ag/price/v3` with `x-api-key`.
- Jupiter Token docs still expose category-style discovery feeds such as `toptrending`, `toptraded`, and `recent`, with interval support on category feeds.
- DEX Screener still allows:
  - `/tokens/v1/{chainId}/{tokenAddresses}` with up to `30` token addresses per request
  - token and pair endpoints at `300 rpm`
  - token-profile / paid-order style endpoints at `60 rpm`
- PumpPortal still requires one shared WebSocket connection. If the optional phase expands into PumpSwap data, plan for API key and funded-wallet requirements instead of assuming a free firehose.
- Meteora docs still publish `30 RPS` for DLMM and `10 RPS` for DAMM v2.

## Budget envelope

Repo invariant: keep the existing `20%` Birdeye reserve.

| Plan | Monthly CU | Reserve | Usable Monthly CU | Approx Daily Budget |
| --- | ---: | ---: | ---: | ---: |
| Lite | 1,500,000 | 300,000 | 1,200,000 | 40,000/day |
| Starter | 5,000,000 | 1,000,000 | 4,000,000 | 133,333/day |

Use:

- `daily usage = unit cost * calls per day`
- `calls per day = 86,400 / interval_seconds`
- `Birdeye batch cost = ceil(N^0.8 * baseCost)` for published batch endpoints such as `/defi/multi_price`

## Current repo API usage calculations

### Birdeye fixed scheduled usage already in code

| Path | Current cadence | Calculation | Daily CU |
| --- | --- | --- | ---: |
| `S3` seed via `/defi/v3/token/list` | every `20s` | `100 * (86400 / 20)` | 432,000 |
| `S2` near-grad via `/defi/v3/token/meme/list` | every `20s` | `100 * (86400 / 20)` | 432,000 |
| `S2` just-grad via `/defi/v3/token/meme/list` | every `20s` | `100 * (86400 / 20)` | 432,000 |
| `S2` fallback via `/defi/v2/tokens/new_listing` | every `5m` | `80 * (86400 / 300)` | 23,040 |
| runtime regime sample via `/defi/token_trending` | every `60s` | `50 * (86400 / 60)` | 72,000 |
| market tick recorder via `/defi/token_trending` | every `5m` | `50 * (86400 / 300)` | 14,400 |
| S1 daily wallet-scoring seed | daily | `50 + (6 * 30)` | 230 |
| **Fixed scheduled subtotal** |  |  | **1,405,670** |

That fixed subtotal is:

- about `35.1x` the Lite daily budget
- about `10.5x` the Starter daily budget

This is not a tuning problem. This is an architecture problem.

### Birdeye exit-path and event-driven costs in the current repo

The published Birdeye batch formula now matches the repo's current `multi_price` estimator:

| Path | Current behavior | Calculation | Daily CU |
| --- | --- | --- | ---: |
| `ExitMonitor` `/defi/multi_price` with `1` token | every `5s` | `5 * (86400 / 5)` | 86,400 |
| `ExitMonitor` `/defi/multi_price` with `3` tokens | every `5s` | `13 * (86400 / 5)` | 224,640 |
| `ExitMonitor` `/defi/multi_price` with `5` tokens | every `5s` | `19 * (86400 / 5)` | 328,320 |
| `S3` fade checks via `/defi/v3/token/trade-data/single` | every `5s`, per position | `15 * (86400 / 5)` | 259,200 per S3 position |

### Birdeye per-candidate final scoring cost in the current repo

| Flow | Calls | Total CU |
| --- | --- | ---: |
| `S1` final score | `overview + trade-data + security + holders` | 145 |
| `S2` final score | `meme-detail + overview + trade-data + security + holders` | 175 |
| `S3` final score | `overview + trade-data + security + holders` | 145 |
| optional adders | `pair overview + exit liquidity` | `+20 to +50` |

### Helius usage that stays in scope

| Path | Current behavior | Calculation | Credits |
| --- | --- | --- | ---: |
| wallet reconcile in `LIVE` | every `60s` | `1 * (86400 / 60)` | 1,440/day |
| S1 wallet event detection | per event | `getSignaturesForAddressIncremental 10 + getTransaction 10` | 20/event |
| S2 creator/token lookback | per candidate | `getSignaturesForAddress 10 + getSignaturesForAddress 10` | 20/candidate |
| daily wallet scoring worst case | once/day | `500 wallets * getTransactionsForAddress 100` | 50,000/day |
| trade-confirm polling fallback | per trade worst case | `15 polls * 1` | 15/trade |

Helius is not the blocking provider today. It still belongs in the plan so nobody accidentally multiplies archival queries or ignores the April 2026 WSS billing change.

### Target Jupiter and DEX scheduled rates

These are request-rate calculations, not Birdeye-style CU budgets.

#### Jupiter Price bucket steady state

| Provider path | Cadence | Requests/day | Avg rpm | Public limit |
| --- | --- | ---: | ---: | ---: |
| exit batch price reads via `/price/v3` | `5s` | 17,280 | 12 | 60 rpm free |
| outcome/backfill price reads worst case | `10 req/min` | 14,400 | 10 | 60 rpm free |
| **Price bucket subtotal** |  | **31,680** | **22** | **60 rpm free** |

#### Jupiter Default bucket steady state

| Provider path | Cadence | Requests/day | Avg rpm | Public limit |
| --- | --- | ---: | ---: | ---: |
| `toptrending` discovery | `20s` | 4,320 | 3 | 60 rpm free |
| `toptraded` discovery | `20s` | 4,320 | 3 | 60 rpm free |
| `recent` discovery | `60s` | 1,440 | 1 | 60 rpm free |
| **Default bucket subtotal** |  | **10,080** | **7** | **60 rpm free** |

Quote-derived Jupiter fallback is not part of steady state. Keep it off the `5s` loop and rate-cap it behind the router.

#### DEX Screener steady state

| Provider path | Cadence | Requests/day | Avg rpm | Public limit |
| --- | --- | ---: | ---: | ---: |
| S3 batch prefilter via `/tokens/v1/solana/{addresses}` | `20s` | 4,320 | 3 | 300 rpm |
| S2 batch prefilter via `/tokens/v1/solana/{addresses}` | `60s` | 1,440 | 1 | 300 rpm |
| **DEX subtotal** |  | **5,760** | **4** | **300 rpm** |

## Target Birdeye operating model

### Lite target

| Usage | Cadence | Daily CU |
| --- | --- | ---: |
| `S2` catch-up `meme/list` near + just | every `30m` | 9,600 |
| S1 daily wallet-scoring seed | daily | 230 |
| fixed-cadence regime, market tick, backfills, exit fast path | none on Birdeye | 0 |
| **Scheduled subtotal** |  | **9,830** |

Remaining Birdeye headroom before event-driven work:

- `40,000 - 9,830 = 30,170 CU/day`
- raw ceiling at `145 CU` per S1/S3 final score: `208`
- raw ceiling at `175 CU` per S2 final score: `172`

### Starter target

| Usage | Cadence | Daily CU |
| --- | --- | ---: |
| `S2` catch-up `meme/list` near + just | every `10m` | 28,800 |
| S1 daily wallet-scoring seed | daily | 230 |
| fixed-cadence regime, market tick, backfills, exit fast path | none on Birdeye | 0 |
| **Scheduled subtotal** |  | **29,030** |

Remaining Birdeye headroom before event-driven work:

- `133,333 - 29,030 = 104,303 CU/day`
- raw ceiling at `145 CU` per S1/S3 final score: `719`
- raw ceiling at `175 CU` per S2 final score: `596`

These are upper bounds, not spending targets. Leave margin for slow-path exit refreshes and bursty days.

## Design rules

- Keep all provider calls in `trading_bot/backend/src/services/`.
- Add a `market-router` service; do not sprinkle Jupiter or DEX fetches directly into strategies or `ExitMonitor`.
- Keep Helius as the only event, transaction-confirmation, and wallet-truth plane.
- Do not add Prisma migration files or SQL-view changes in the base phase.
- Keep runtime quota blockers limited to real blocker services. Do not fabricate DEX or Jupiter pause reasons.
- Do not let stale `shouldRunNonEssential("BIRDEYE")` guards keep suppressing work after that work moves off Birdeye.
- Keep `trendingCount` schema and payload shape intact unless a later phase explicitly renames the field and updates the dashboard together.
- DEX Screener is a cheap prefilter only. It does not replace Birdeye security, holders, or final score inputs.
- Keep the dashboard quota UI untouched unless an API contract change forces it. The current screen is already dynamic.
- Update docs in the same pass as runtime behavior changes.

## Implementation tasks

### Task 1: Codify Birdeye plan capabilities and shared budget math

**Files:**

- Create: `trading_bot/backend/src/config/provider-plan.ts`
- Modify: `trading_bot/backend/src/config/index.ts`
- Modify: `trading_bot/backend/src/core/api-budget-manager.ts`
- Modify: `trading_bot/backend/src/workers/stats-aggregator.ts`
- Modify: `trading_bot/backend/.env.example`
- Modify: `docs/workflows/quota-and-provider-budgets.md`

- [ ] Add `BIRDEYE_PLAN=LITE|STARTER` config and a helper that returns monthly CU, reserve, plan-aware S2 catch-up cadence, and the published `multi_price` batch-cost helper.
- [ ] Make both `ApiBudgetManager` and `workers/stats-aggregator.ts` read Birdeye budget math from the same helper so daily remaining math cannot drift.
- [ ] Keep quota blockers limited to `HELIUS` and `BIRDEYE` in this phase.
- [ ] Replace stale doc text that says Birdeye batch pricing is unpublished or that Lite/Starter websocket access might exist.
- [ ] Run: `npm run typecheck`

### Task 2: Modernize Jupiter configuration and add current price/category wrappers

**Files:**

- Modify: `trading_bot/backend/src/config/index.ts`
- Modify: `trading_bot/backend/src/services/jupiter.ts`
- Modify: `trading_bot/backend/src/bootstrap/runtime.ts`
- Modify: `trading_bot/backend/.env.example`
- Modify: `docs/architecture/backend-runtime.md`
- Modify: `docs/workflows/quota-and-provider-budgets.md`

- [ ] Add explicit Jupiter config for:
  - `JUPITER_API_KEY`
  - `JUPITER_BASE_URL=https://api.jup.ag`
  - `JUPITER_PRICE_PATH=/price/v3`
  - `JUPITER_SWAP_PATH=/swap/v1`
- [ ] Replace hardcoded `quote-api.jup.ag/v6` and `price.jup.ag/v6/price`.
- [ ] Add batch-friendly helpers such as:
  - `getPricesUsd(mints: string[])`
  - `getTopTrendingTokens(...)`
  - `getTopTradedTokens(...)`
  - `getRecentTokens(...)`
- [ ] Keep the existing quote/build-swap interface stable for trade execution callers.
- [ ] Document the current Jupiter bucket model: `Price API` traffic is separate from `Default` bucket traffic.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/core/trade-executor.test.ts`
- [ ] Run: `npm run typecheck`

### Task 3: Add DEX Screener and introduce the market-router

**Files:**

- Create: `trading_bot/backend/src/services/dexscreener.ts`
- Create: `trading_bot/backend/src/services/market-router.ts`
- Create: `trading_bot/backend/src/services/market-router.test.ts`
- Modify: `trading_bot/backend/src/utils/types.ts`
- Modify: `trading_bot/backend/src/bootstrap/runtime.ts`
- Modify: `docs/strategies/overview.md`

- [ ] Add provider-agnostic router models for:
  - `SeedCandidate`
  - `PrefilterResult`
  - `FinalScoreInput`
  - `ExitRefresh`
- [ ] Implement DEX Screener batching through `/tokens/v1/solana/{tokenAddresses}` with up to `30` addresses per request.
- [ ] Use `/token-pairs/v1/solana/{tokenAddress}` only when pair-age or pair-specific detail is required.
- [ ] Keep DEX failures soft and keep DEX telemetry out of Prisma enums and quota pause reasons.
- [ ] Make the router the only new place that knows provider fallback order.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/services/market-router.test.ts`
- [ ] Run: `npm run typecheck`

### Task 4: Move regime breadth, market ticks, and analytics backfills off Birdeye

**Files:**

- Modify: `trading_bot/backend/src/bootstrap/intervals.ts`
- Modify: `trading_bot/backend/src/services/market-tick-recorder.ts`
- Modify: `trading_bot/backend/src/services/outcome-tracker.ts`
- Modify: `trading_bot/backend/src/core/regime-detector.ts`
- Modify: `trading_bot/backend/src/services/market-router.ts`
- Modify: `docs/architecture/backend-runtime.md`
- Modify: `docs/workflows/quota-and-provider-budgets.md`

- [ ] Replace Birdeye regime and market-tick breadth sampling with router-backed free-side breadth data while keeping the persisted/output field name `trendingCount`.
- [ ] Replace all `OutcomeTracker` `multi_price` backfills with Jupiter price-batch reads.
- [ ] Remove or replace stale `shouldRunNonEssential("BIRDEYE")` guards on any path that no longer spends Birdeye.
- [ ] Revisit the 10-minute `wouldHaveWon` interval guard in `bootstrap/intervals.ts`; that pass does not itself hit a provider and should not stay incorrectly tied to Birdeye once prices move off Birdeye.
- [ ] Verify steady-state Jupiter usage stays inside:
  - Price bucket about `22 rpm`
  - Default bucket about `7 rpm`
- [ ] Run: `npm run typecheck`

### Task 5: Remove Birdeye from the exit fast path

**Files:**

- Modify: `trading_bot/backend/src/core/exit-monitor.ts`
- Modify: `trading_bot/backend/src/services/jupiter.ts`
- Modify: `trading_bot/backend/src/services/market-router.ts`
- Modify: `trading_bot/backend/src/bootstrap/runtime.ts`
- Modify: `docs/strategies/s1-copy-trade.md`
- Modify: `docs/strategies/s2-graduation.md`
- Modify: `docs/strategies/s3-momentum.md`

- [ ] Replace `Birdeye multi_price` in the `5s` loop with router-backed Jupiter batch prices.
- [ ] Replace unconditional per-position S3 `trade-data` polling with plan-aware conditional refreshes. Slow or high-risk refreshes may still use Birdeye; the `5s` loop may not.
- [ ] Use `market-router.refreshExitContext()` so fallback order is:
  - Jupiter price batch
  - Jupiter quote-derived price on throttled slow path
  - Birdeye only when the router marks the token as price-insufficient or high-risk
- [ ] Keep Helius as the confirmation source for landed exits.
- [ ] Prove the monitor no longer burns Birdeye on the `5s` price loop and no longer polls S3 trade-data every `5s` per open position.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/core/exit-monitor.test.ts`
- [ ] Run: `node --env-file=.env.example --test --import tsx src/core/trade-executor.test.ts`
- [ ] Run: `npm run typecheck`

### Task 6: Refactor S3 discovery onto Jupiter plus DEX and keep Birdeye for final score only

**Files:**

- Modify: `trading_bot/backend/src/strategies/momentum.ts`
- Modify: `trading_bot/backend/src/strategies/momentum.test.ts`
- Modify: `trading_bot/backend/src/services/market-router.ts`
- Modify: `docs/strategies/s3-momentum.md`

- [ ] Seed S3 from Jupiter category feeds such as `toptrending` and `toptraded` instead of Birdeye `token/list`.
- [ ] Run DEX Screener batch prefilter before any paid Birdeye call.
- [ ] Keep Birdeye `overview + trade-data + security + holders` as the final go/no-go gate.
- [ ] Update signal source labels away from `v3/token/list` so analytics reflects the new router path honestly.
- [ ] Preserve current `20s` responsiveness using Jupiter and DEX, not Birdeye.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/strategies/momentum.test.ts`
- [ ] Run: `npm run typecheck`

### Task 7: Refactor S2 into cheap seed plus paid catch-up

**Files:**

- Modify: `trading_bot/backend/src/strategies/graduation.ts`
- Modify: `trading_bot/backend/src/strategies/graduation.test.ts`
- Modify: `trading_bot/backend/src/services/market-router.ts`
- Modify: `docs/strategies/s2-graduation.md`

- [ ] Seed S2 from Jupiter `recent` and DEX Screener pair data for cheap continuous discovery.
- [ ] Keep Birdeye `meme/list` only as plan-aware catch-up:
  - Lite: every `30m`
  - Starter: every `10m`
- [ ] Keep Birdeye `meme/detail`, `overview`, `trade-data`, `security`, and `holders` for shortlisted candidates only.
- [ ] Keep Helius creator and token lookbacks intact at `20 credits` per shortlisted candidate.
- [ ] Do not delete the `new_listing` fallback blindly. First gate it behind router telemetry or a feature flag, then remove it only after coverage proves the cheap seed path is good enough.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/strategies/graduation.test.ts`
- [ ] Run: `npm run typecheck`

### Task 8: Keep S1 on Helius and add cheap sanity before paid Birdeye scoring

**Files:**

- Modify: `trading_bot/backend/src/strategies/copy-trade.ts`
- Modify: `trading_bot/backend/src/strategies/copy-trade.test.ts`
- Modify: `trading_bot/backend/src/services/market-router.ts`
- Modify: `docs/strategies/s1-copy-trade.md`

- [ ] Preserve the Helius wallet-trigger path exactly; this strategy is not being re-architected around polling.
- [ ] Replace the single-token Birdeye `multi_price` wallet-activity price capture with a cheap Jupiter/router price read.
- [ ] Add a DEX Screener sanity check before Birdeye final scoring so obvious trash is filtered before paid calls.
- [ ] Keep S1 final paid score at the current `145 CU` shape unless there is a safety reason to add pair-level checks.
- [ ] Leave daily wallet-scoring cadence unchanged, but document both the Birdeye top-trader seed cost and the current Helius archival-query cost.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/strategies/copy-trade.test.ts`
- [ ] Run: `npm run typecheck`

### Task 9: Optional PumpPortal watchlist phase

Only do this after Tasks 1 through 8 land and telemetry still says S2 discovery needs cheaper eventing.

**Files:**

- Create: `trading_bot/backend/src/services/pumpportal.ts`
- Optional Create: `trading_bot/backend/src/core/watchlist-store.ts`
- Optional Modify: `docs/strategies/s2-graduation.md`

- [ ] Add one shared PumpPortal WebSocket client.
- [ ] Honor the one-connection rule.
- [ ] Treat PumpSwap or paid data requirements as explicit config and ops work, not as hidden assumptions.
- [ ] Only add persistence if in-memory watchlists prove too lossy across restarts.

### Task 10: Optional venue-confirmation phase

Only do this if Jupiter route labels show repeated Raydium or Meteora concentration that justifies direct venue reads.

**Files:**

- Optional Create: `trading_bot/backend/src/services/raydium.ts`
- Optional Create: `trading_bot/backend/src/services/meteora.ts`
- Optional Modify: `trading_bot/backend/src/services/market-router.ts`

- [ ] Add read-only confirmation wrappers for pool detail.
- [ ] Keep them off the hot path unless a router decision already points there.

## Verification checklist

- Lite and Starter still use a `20%` Birdeye reserve.
- Lite and Starter treat Birdeye WebSockets as unavailable.
- Birdeye `multi_price` batch cost uses the published `ceil(N^0.8 * 5)` formula.
- Scheduled Birdeye usage falls from `1,405,670 CU/day` fixed baseline to:
  - Lite about `9,830 CU/day`
  - Starter about `29,030 CU/day`
- Regime breadth, market ticks, and analytics backfills no longer spend Birdeye.
- Exit monitoring no longer spends Birdeye on the `5s` fast path.
- S3 no longer depends on Birdeye `token/list`.
- S2 no longer depends on dual `20s` Birdeye `meme/list` loops.
- S1 still depends on Helius wallet events, not a new polling path.
- Jupiter steady-state usage stays inside:
  - Price bucket about `22 rpm`
  - Default bucket about `7 rpm`
- DEX Screener steady-state usage stays inside about `4 rpm`.
- Helius scheduled usage remains well below current Developer plan limits, and docs mention the April/May 2026 WSS metering change.
- No Prisma migration or SQL-view change lands unless an optional phase explicitly requires it.
- Docs are updated in the same pass as code.
- If any overview or API-usage response contract changes, run `trading_bot/dashboard` build before closing the work. Otherwise, skip dashboard edits.

## Sources

- Birdeye pricing page: https://bds.birdeye.so/pricing
- Birdeye pricing docs: https://docs.birdeye.so/docs/pricing
- Birdeye package access: https://docs.birdeye.so/docs/data-accessibility-by-packages
- Birdeye compute unit cost: https://docs.birdeye.so/docs/compute-unit-cost
- Birdeye batch token CU cost: https://docs.birdeye.so/docs/batch-token-cu-cost
- Helius plans: https://www.helius.dev/docs/billing/plans
- Helius rate limits: https://www.helius.dev/docs/billing/rate-limits
- Helius credits: https://www.helius.dev/docs/billing/credits
- Helius WebSocket FAQ: https://www.helius.dev/docs/faqs/websockets
- Jupiter API key setup: https://dev.jup.ag/portal/setup
- Jupiter rate limits: https://dev.jup.ag/portal/rate-limit
- Jupiter Price API: https://dev.jup.ag/docs/api-reference/price
- Jupiter Token information: https://dev.jup.ag/docs/tokens/token-information
- DEX Screener API reference: https://docs.dexscreener.com/api/reference
- PumpPortal realtime docs: https://pumpportal.fun/data-api/real-time/
- Meteora docs: https://docs.meteora.ag/
