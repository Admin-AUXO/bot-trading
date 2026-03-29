# Lite/Starter Birdeye Routing Standalone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bot operational on `Birdeye Lite` and `Birdeye Starter` by removing fixed-cadence Birdeye waste, moving cheap discovery and price reads onto Jupiter and DEX Screener, and preserving Birdeye only for final paid scoring and conditional refreshes.

**Architecture:** Keep `Helius` as the event, confirmation, and wallet-truth plane. Move fast prices, token discovery seeds, and non-essential analytics snapshots to `Jupiter` and `DEX Screener`. Keep `Birdeye` for high-signal final scoring, meme metadata catch-up, and selective exit refreshes. Introduce a small `market-router` so strategies and the `ExitMonitor` request `seed`, `prefilter`, `final score`, and `exit refresh` instead of talking to providers directly.

**Tech Stack:** TypeScript, Node 24, Express, Prisma 7, PostgreSQL 16, Helius RPC/WSS, Birdeye REST, Jupiter REST, DEX Screener REST, optional PumpPortal WSS, optional Raydium and Meteora REST.

---

## Verified Provider Facts

Facts verified on **March 29, 2026**:

- Birdeye pricing page currently shows:
  - `Lite`: `1,500,000 CU/month`, `15 RPS`, `WebSocket Access: No`
  - `Starter`: `5,000,000 CU/month`, `15 RPS`, `WebSocket Access: No`
- Birdeye package-access docs confirm Lite/Starter access to the single-token endpoints already used in this repo, plus `/defi/multi_price`. Other multi/batch endpoints remain restricted unless explicitly listed.
- Birdeye CU docs list:
  - `/defi/v3/token/list` = `100 CU`
  - `/defi/v3/token/meme/list` = `100 CU`
  - `/defi/v2/tokens/new_listing` = `80 CU`
  - `/defi/token_trending` = `50 CU`
  - `/defi/token_overview` = `30 CU`
  - `/defi/v3/token/trade-data/single` = `15 CU`
  - `/defi/token_security` = `50 CU`
  - `/defi/v3/token/holder` = `50 CU`
  - `/defi/v3/token/meme/detail/single` = `30 CU`
  - `/defi/v2/tokens/top_traders` = `30 CU`
  - `/defi/multi_price` uses batch pricing and Birdeye does not publish the exact batch formula on the CU page.
- Helius Developer currently includes `10,000,000 credits/month`, `50 RPC req/s`, `10 DAS/Enhanced req/s`, and `150` concurrent standard WebSocket connections.
- Helius credit docs confirm:
  - standard RPC = `1 credit`
  - `getSignaturesForAddress` = `10 credits`
  - `getTransaction` = `10 credits`
  - `getTransactionsForAddress` = `100 credits`
- Jupiter current docs center on `https://api.jup.ag/` with `x-api-key` required, `Price API V3` at `/price/v3`, and `Tokens API V2` for `toptrending`, `toptraded`, and `recent`.
- Jupiter Free tier is `60 rpm` on the default bucket. Free users do **not** get a separate Price bucket.
- DEX Screener docs currently allow:
  - `/tokens/v1/{chainId}/{tokenAddresses}` up to `30` token addresses per request
  - pair and token endpoints at `300 rpm`
  - latest token-profile style endpoints at `60 rpm`
- PumpPortal realtime docs still require **one** shared WebSocket connection.
- Meteora docs currently list `30 RPS` for DLMM and `10 RPS` for DAMM v2.

## Budget Envelope

The repo already uses a `20%` Birdeye reserve.

| Plan | Monthly CU | Reserve | Usable Monthly CU | Approx Daily Budget |
| --- | ---: | ---: | ---: | ---: |
| Lite | 1,500,000 | 300,000 | 1,200,000 | 40,000/day |
| Starter | 5,000,000 | 1,000,000 | 4,000,000 | 133,333/day |

All calculations below use:

`daily usage = unit cost * calls per day`

or

`calls per day = 86,400 / interval_seconds`

Wrong. Because “we'll just slow it down later” is not math.

## Current Repo API Usage Calculations

### Birdeye: deterministic scheduled usage already in code

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

- about `35.1x` Lite daily budget
- about `10.5x` Starter daily budget

And that is before exits, backfills, or candidate-level final scoring.

### Birdeye: current exit-path and event-driven costs

| Path | Current behavior | Calculation | Daily CU |
| --- | --- | --- | ---: |
| `ExitMonitor` `/defi/multi_price` with `1` token | every `5s` | current repo estimator `5 * (86400 / 5)` | 86,400 |
| `ExitMonitor` `/defi/multi_price` with `3` tokens | every `5s` | current repo estimator `13 * (86400 / 5)` | 224,640 |
| `ExitMonitor` `/defi/multi_price` with `5` tokens | every `5s` | current repo estimator `19 * (86400 / 5)` | 328,320 |
| `S3` fade checks via `/defi/v3/token/trade-data/single` | every `5s`, per position | `15 * (86400 / 5)` | 259,200 per S3 position |

The repo's current `multi_price` batch estimator is an internal planning assumption because Birdeye does not publish the exact batch CU formula on the public CU page.

### Birdeye: current per-candidate final scoring cost

| Flow | Calls | Total CU |
| --- | --- | ---: |
| `S1` final score | `overview + trade-data + security + holders` | 145 |
| `S2` final score | `meme-detail + overview + trade-data + security + holders` | 175 |
| `S3` final score | `overview + trade-data + security + holders` | 145 |
| optional adders | `pair overview + exit liquidity` | `+50` |

### Helius: scheduled and per-event usage

| Path | Current behavior | Calculation | Credits |
| --- | --- | --- | ---: |
| wallet reconcile in `LIVE` | every `60s` | `1 * (86400 / 60)` | 1,440/day |
| S1 wallet event detection | per event | `getSignaturesForAddressIncremental 10 + getTransaction 10` | 20/event |
| S2 creator/token lookback | per candidate | `getSignaturesForAddress 10 + getSignaturesForAddress 10` | 20/candidate |
| daily wallet scoring worst case | once/day | `500 wallets * getTransactionsForAddress 100` | 50,000/day |
| trade-confirm polling fallback | per trade worst case | `15 polls * 1` | 15/trade |

Helius is not the blocking provider. The math still belongs in the plan so nobody accidentally burns it by multiplying wallet scoring or creator lookbacks.

### Jupiter and DEX Screener: target scheduled rate calculations

These are request-rate calculations, not credit costs.

Assumed target cadence:

- `Jupiter /price/v3` exit batch: every `5s`
- `Jupiter Tokens toptrending` seed: every `20s`
- `Jupiter Tokens toptraded` seed: every `20s`
- `Jupiter Tokens recent` seed: every `60s`
- `Jupiter` backfill price snapshots: worst-case `10` requests/minute combined
- `DEX Screener /tokens/v1` S3 prefilter: every `20s`
- `DEX Screener /tokens/v1` S2 prefilter: every `60s`

| Provider path | Cadence | Requests/day | Avg rpm | Public limit |
| --- | --- | ---: | ---: | ---: |
| Jupiter `Price API V3` exit batch | `5s` | 17,280 | 12 | 60 rpm free |
| Jupiter Tokens `toptrending` | `20s` | 4,320 | 3 | 60 rpm free |
| Jupiter Tokens `toptraded` | `20s` | 4,320 | 3 | 60 rpm free |
| Jupiter Tokens `recent` | `60s` | 1,440 | 1 | 60 rpm free |
| Jupiter backfill prices worst case | `10 req/min` | 14,400 | 10 | 60 rpm free |
| **Jupiter scheduled subtotal** |  | **41,760** | **29** | **60 rpm free** |
| DEX Screener S3 batch prefilter | `20s` | 4,320 | 3 | 300 rpm |
| DEX Screener S2 batch prefilter | `60s` | 1,440 | 1 | 300 rpm |
| **DEX scheduled subtotal** |  | **5,760** | **4** | **300 rpm** |

That means the target design fits comfortably inside Jupiter Free's `60 rpm` and DEX Screener's `300 rpm`, even before paying for higher Jupiter tiers.

## Target Birdeye Operating Model

### Lite target

Scheduled Birdeye use is capped to:

| Usage | Cadence | Daily CU |
| --- | --- | ---: |
| `S2` catch-up `meme/list` near + just | every `30m` | 9,600 |
| S1 daily wallet-scoring seed | daily | 230 |
| regime / market tick / backfills / exit fast path | none on Birdeye | 0 |
| **Scheduled subtotal** |  | **9,830** |

Remaining Birdeye budget for event-driven work:

- `40,000 - 9,830 = 30,170 CU/day`
- raw ceiling at `145 CU` per S1/S3 final score: `208`
- raw ceiling at `175 CU` per S2 final score: `172`

### Starter target

Scheduled Birdeye use is capped to:

| Usage | Cadence | Daily CU |
| --- | --- | ---: |
| `S2` catch-up `meme/list` near + just | every `10m` | 28,800 |
| S1 daily wallet-scoring seed | daily | 230 |
| regime / market tick / backfills / exit fast path | none on Birdeye | 0 |
| **Scheduled subtotal** |  | **29,030** |

Remaining Birdeye budget for event-driven work:

- `133,333 - 29,030 = 104,303 CU/day`
- raw ceiling at `145 CU` per S1/S3 final score: `719`
- raw ceiling at `175 CU` per S2 final score: `596`

These raw ceilings are not a license to spend all of it. They are the upper bound before conditional exit refreshes and bursty days are considered.

## Design Rules

- Do not use Birdeye WebSockets on Lite or Starter. Pricing page says `No`.
- Remove Birdeye from all fixed-cadence fast paths:
  - exit prices
  - regime trending samples
  - market tick recorder
  - outcome backfills
  - S3 seed discovery
- Use Birdeye only for:
  - final paid scoring
  - `S2` meme catch-up cadence
  - selective exit refreshes when Jupiter or DEX data is insufficient
- Keep Helius as the only event and confirmation plane.
- Keep all provider calls inside shared services.
- Do not add new Prisma enums or SQL views in the base implementation.
- Do not fake `DEX Screener` calls as `BIRDEYE` in quota tables.

## Implementation Tasks

### Task 1: Add provider plan capabilities and budget math

**Files:**

- Create: `trading_bot/backend/src/config/provider-plan.ts`
- Modify: `trading_bot/backend/src/config/index.ts`
- Modify: `trading_bot/backend/src/core/api-budget-manager.ts`
- Modify: `trading_bot/backend/src/workers/stats-aggregator.ts`
- Modify: `trading_bot/backend/.env.example`
- Modify: `docs/workflows/quota-and-provider-budgets.md`

- [ ] Add `BIRDEYE_PLAN=LITE|STARTER` config and derive monthly CU, reserve, target scheduled budget, and catch-up cadences from one helper.
- [ ] Keep the existing config shape mostly intact. Do not create a giant provider-config tree for sport.
- [ ] Make `ApiBudgetManager` and `stats-aggregator` use the same plan helper so daily remaining math cannot drift.
- [ ] Document the pricing-page fact that Lite and Starter have `WebSocket Access: No`.
- [ ] Add the explicit daily usage tables from this plan into the quota docs so operator expectations match runtime behavior.
- [ ] Run: `npm run typecheck`

### Task 2: Modernize Jupiter configuration and add current token/price APIs

**Files:**

- Modify: `trading_bot/backend/src/config/index.ts`
- Modify: `trading_bot/backend/src/services/jupiter.ts`
- Modify: `trading_bot/backend/src/core/trade-executor.ts`
- Modify: `trading_bot/backend/.env.example`
- Modify: `docs/architecture/backend-runtime.md`

- [ ] Add explicit Jupiter config for:
  - `JUPITER_API_KEY`
  - `JUPITER_BASE_URL=https://api.jup.ag`
  - `JUPITER_PRICE_PATH=/price/v3`
  - `JUPITER_SWAP_PATH=/swap/v1`
- [ ] Remove hardcoded `quote-api.jup.ag/v6` and `price.jup.ag/v6/price`.
- [ ] Add `getPricesUsd(mints: string[])` for batch exit and backfill reads.
- [ ] Add `getTopTrendingTokens`, `getTopTradedTokens`, and `getRecentTokens` wrappers for seed discovery.
- [ ] Keep the existing quote and execution interface stable for callers outside the new router.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/core/trade-executor.test.ts`
- [ ] Run: `npm run typecheck`

### Task 3: Move scheduled non-essential Birdeye reads to Jupiter

**Files:**

- Modify: `trading_bot/backend/src/bootstrap/intervals.ts`
- Modify: `trading_bot/backend/src/services/market-tick-recorder.ts`
- Modify: `trading_bot/backend/src/services/outcome-tracker.ts`
- Modify: `trading_bot/backend/src/core/regime-detector.ts`
- Modify: `docs/workflows/quota-and-provider-budgets.md`
- Modify: `docs/architecture/backend-runtime.md`

- [ ] Replace runtime regime trending samples from Birdeye with Jupiter token-category data or equivalent free-side routing data.
- [ ] Replace market tick recorder trending reads from Birdeye with Jupiter-backed or router-backed counts.
- [ ] Replace `OutcomeTracker` price backfills from Birdeye `multi_price` with Jupiter `Price API V3` batch reads.
- [ ] Keep these jobs non-essential and skippable under quota pressure.
- [ ] Verify the planned Jupiter steady-state usage remains within the `29 rpm` target envelope from this plan.
- [ ] Run: `npm run typecheck`

### Task 4: Introduce DEX Screener and the market-router

**Files:**

- Create: `trading_bot/backend/src/services/dexscreener.ts`
- Create: `trading_bot/backend/src/services/market-router.ts`
- Modify: `trading_bot/backend/src/utils/types.ts`
- Modify: `trading_bot/backend/src/bootstrap/runtime.ts`
- Modify: `docs/strategies/overview.md`

- [ ] Add provider-agnostic router models for:
  - `SeedCandidate`
  - `PrefilterResult`
  - `FinalScore`
  - `ExitRefresh`
- [ ] Implement DEX Screener batching through `/tokens/v1/solana/{tokenAddresses}` with up to `30` addresses per request.
- [ ] Use `/token-pairs/v1/solana/{tokenAddress}` only when pair-age or pair-specific detail is required.
- [ ] Keep DEX failures soft and do not route them into bot pause reasons.
- [ ] Do not add a new Prisma service enum for DEX in this phase. Keep DEX telemetry in service-local logs or counters only.
- [ ] Create: `trading_bot/backend/src/services/market-router.test.ts`
- [ ] Run: `node --env-file=.env.example --test --import tsx src/services/market-router.test.ts`
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

- [ ] Replace `Birdeye multi_price` in the `5s` loop with Jupiter batch prices.
- [ ] Replace unconditional `S3` `trade-data` polling in the `5s` loop with plan-aware conditional refreshes.
- [ ] Use `market-router.refreshExitContext()` so fallback order is:
  - Jupiter batch price
  - Jupiter quote-derived price when needed
  - Birdeye only on slow or high-risk refresh paths
- [ ] Keep Helius as the confirmation source for landed exits.
- [ ] Prove the monitor no longer burns `86,400-328,320 CU/day` on price polling and `259,200 CU/day` per S3 position on fade checks.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/core/exit-monitor.test.ts`
- [ ] Run: `node --env-file=.env.example --test --import tsx src/core/trade-executor.test.ts`
- [ ] Run: `npm run typecheck`

### Task 6: Refactor S3 discovery onto Jupiter + DEX, keep Birdeye for final score only

**Files:**

- Modify: `trading_bot/backend/src/strategies/momentum.ts`
- Modify: `trading_bot/backend/src/strategies/momentum.test.ts`
- Modify: `docs/strategies/s3-momentum.md`

- [ ] Seed `S3` from Jupiter `toptrending` and `toptraded` categories instead of Birdeye `token/list`.
- [ ] Run DEX Screener batched prefilter before any paid Birdeye call.
- [ ] Keep Birdeye `overview + trade-data + security + holders` for final go/no-go only.
- [ ] Preserve current `20s` strategy responsiveness using Jupiter and DEX, not Birdeye.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/strategies/momentum.test.ts`
- [ ] Run: `npm run typecheck`

### Task 7: Refactor S2 into cheap seed + paid catch-up

**Files:**

- Modify: `trading_bot/backend/src/strategies/graduation.ts`
- Modify: `trading_bot/backend/src/strategies/graduation.test.ts`
- Modify: `docs/strategies/s2-graduation.md`

- [ ] Seed `S2` from Jupiter `recent` and DEX Screener pair data for cheap continuous discovery.
- [ ] Keep Birdeye `meme/list` only as plan-aware catch-up:
  - Lite: every `30m`
  - Starter: every `10m`
- [ ] Keep Birdeye `meme/detail`, `overview`, `trade-data`, `security`, and `holders` for shortlisted candidates only.
- [ ] Keep Helius creator and token lookbacks intact at `20 credits` per shortlisted candidate.
- [ ] Delete or disable Birdeye `new_listing` fallback once the cheap seed path is proven.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/strategies/graduation.test.ts`
- [ ] Run: `npm run typecheck`

### Task 8: Refactor S1 to add cheap sanity before paid scoring

**Files:**

- Modify: `trading_bot/backend/src/strategies/copy-trade.ts`
- Modify: `trading_bot/backend/src/strategies/copy-trade.test.ts`
- Modify: `docs/strategies/s1-copy-trade.md`

- [ ] Preserve the Helius wallet-trigger path.
- [ ] Keep the per-wallet-event Helius cost at `20 credits/event` and document it.
- [ ] Add a DEX Screener sanity check before Birdeye final scoring.
- [ ] Keep S1 final paid score at the current `145 CU` shape unless there is a safety reason to add pair or exit-liquidity checks.
- [ ] Leave daily wallet scoring cadence unchanged, but document its worst-case `50,000 credits/day` Helius cost.
- [ ] Run: `node --env-file=.env.example --test --import tsx src/strategies/copy-trade.test.ts`
- [ ] Run: `npm run typecheck`

### Task 9: Optional PumpPortal watchlist phase

Only do this after Tasks 1 through 8 land and telemetry shows `S2` near-grad discovery still needs cheaper eventing.

**Files:**

- Create: `trading_bot/backend/src/services/pumpportal.ts`
- Optional Create: `trading_bot/backend/src/core/watchlist-store.ts`
- Optional Modify: `trading_bot/backend/prisma/schema.prisma`
- Optional Modify: `trading_bot/backend/prisma/views/create_views.sql`
- Optional Modify: `docs/data/prisma-and-views.md`

- [ ] Add one shared PumpPortal WebSocket client.
- [ ] Honor the one-connection rule.
- [ ] Only add persistence if in-memory watchlists prove too lossy across restarts.

### Task 10: Optional venue confirmation phase

Only do this if Jupiter route labels show repeated Raydium or Meteora concentration that justifies direct venue reads.

**Files:**

- Optional Create: `trading_bot/backend/src/services/raydium.ts`
- Optional Create: `trading_bot/backend/src/services/meteora.ts`
- Optional Modify: `trading_bot/backend/src/services/market-router.ts`

- [ ] Add read-only confirmation wrappers for pool detail.
- [ ] Keep them off the hot path unless a route already points there.

## Verification Checklist

- Lite and Starter still use a `20%` Birdeye reserve.
- Lite and Starter treat Birdeye WebSockets as unavailable.
- Scheduled Birdeye usage falls from `1,405,670 CU/day` fixed baseline to:
  - Lite about `9,830 CU/day`
  - Starter about `29,030 CU/day`
- Exit monitoring no longer consumes Birdeye on the `5s` fast path.
- `S3` no longer depends on Birdeye `token/list`.
- `S2` no longer depends on dual `20s` Birdeye `meme/list` loops.
- Regime sampling, market ticks, and outcome backfills no longer consume Birdeye.
- Jupiter scheduled usage stays inside the planned `29 rpm` envelope.
- DEX Screener scheduled usage stays inside the planned `4 rpm` envelope.
- Helius scheduled usage remains well below the Developer plan monthly budget and RPS limits.
- No schema or SQL view changes land unless an optional phase is actually required.
- Docs are updated in the same pass as code.

## Sources

- Birdeye pricing: https://bds.birdeye.so/pricing
- Birdeye package access: https://docs.birdeye.so/docs/data-accessibility-by-packages
- Birdeye CU costs: https://docs.birdeye.so/docs/compute-unit-cost
- Birdeye rate limits: https://docs.birdeye.so/docs/rate-limiting
- Helius plans: https://www.helius.dev/docs/billing/plans
- Helius credits: https://www.helius.dev/docs/billing/credits
- Helius rate limits: https://www.helius.dev/docs/billing/rate-limits
- Helius WebSockets: https://www.helius.dev/docs/rpc/websocket
- Jupiter API setup: https://dev.jup.ag/docs/api-setup
- Jupiter rate limits: https://dev.jup.ag/portal/rate-limit
- Jupiter Price API V3: https://dev.jup.ag/docs/price
- Jupiter Tokens API V2: https://dev.jup.ag/docs/tokens/token-information
- Jupiter Swap quote reference: https://dev.jup.ag/api-reference/swap/v1/quote
- DEX Screener API reference: https://docs.dexscreener.com/api/reference
- PumpPortal realtime: https://pumpportal.fun/data-api/real-time/
- Meteora DLMM overview: https://docs.meteora.ag/api-reference/dlmm/overview
- Meteora DAMM v2 overview: https://docs.meteora.ag/api-reference/damm-v2/overview
