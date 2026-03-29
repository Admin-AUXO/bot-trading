# Birdeye Lite/Starter Multi-Provider Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework backend market-data routing so the bot runs safely on `Birdeye Lite` or `Birdeye Starter`, with static config-based switching, Helius-led exits, and free-provider prefilters that reduce Birdeye CU burn without weakening final signal quality.

**Architecture:** Keep `Helius` as the always-on event/execution plane and `Birdeye` as the paid market-intelligence plane. Insert a new `watchlist -> free prefilter -> Birdeye staged scoring -> Jupiter execute/exit -> Helius confirm` flow so strategies stop spending Birdeye on obvious trash. The selected Birdeye plan lives in static config, not `ConfigProfile`, because provider quota/capability is process-wide, not per-strategy profile state.

**Tech Stack:** TypeScript, Express, Prisma 7, PostgreSQL 16, Helius RPC/WSS, Birdeye REST, Jupiter REST, DEX Screener REST, PumpPortal WSS, Raydium REST, Meteora REST.

---

## Provider Catalog

### Birdeye paid core

Plan constraints:

- `Lite`: `1.5M CU/month`, `15 RPS`, no websocket, same Lite/Starter access table, reserve target `10%`
- `Starter`: `5M CU/month`, `15 RPS`, no websocket, reserve target `10%`
- Lite/Starter can use `multiple price`, but other `multiple/batch` APIs are Business+ only

Daily usable budget:

- `Lite`, 30-day month: `45,000 CU/day`
- `Lite`, 31-day month: `43,548 CU/day`
- `Starter`, 30-day month: `150,000 CU/day`
- `Starter`, 31-day month: `145,161 CU/day`

Endpoints to keep:

| Endpoint | Cost | Useful fields | Purpose |
|---|---:|---|---|
| `/defi/v3/token/meme/list` | 100 | token address, symbol, source, graduation progress, creator, reserves | S2 candidate seed |
| `/defi/v3/token/list` | 100 | token address, liquidity, volume, market-cap style list ranking | S3 paid sweep |
| `/defi/token_trending` | 50 | trending token set | shared regime/background signal |
| `/defi/token_overview` | 30 | price, priceChange5m/1h, volume5m/1h, liquidity, marketCap, holder count, buy/sell percentages | mid-cost scoring |
| `/defi/v3/token/trade-data/single` | 15 | volume5m, buy volume, trade count, buy count, unique wallets | buy-pressure and participation |
| `/defi/v3/pair/overview/single` | 20 | pair address, dex/pool state, price/liquidity context | best-pool confirmation |
| `/defi/v3/token/exit-liquidity` | 30 | exit-capacity estimate | final capacity check before entry and large exits |
| `/defi/token_security` | 50 | top-10 concentration, freezeable, mint authority, transfer fee, mutable metadata | finalist-only safety |
| `/defi/v3/token/holder` | 50 | top holders and percentages | finalist-only concentration |
| `/defi/multi_price` | batch | price, 24h delta, liquidity, update time | non-hot-path snapshots only |

Birdeye response normalization already exists in [birdeye.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/services/birdeye.ts). Keep strategies consuming normalized `TokenOverview`, `TradeData`, `TokenSecurity`, and `TokenHolder`.

### Helius execution/event core

Plan constraints:

- `Developer`: `10M credits/month`
- `50 req/s` standard RPC
- `10 req/s` DAS/Enhanced
- `150` concurrent websocket connections

Endpoints/capabilities to rely on:

| Capability | Useful methods / APIs | Useful fields | Purpose |
|---|---|---|---|
| account/event streaming | standard WSS `accountSubscribe`, `logsSubscribe`, `signatureSubscribe`, `programSubscribe` | account deltas, signatures, logs, slot timing | S1 triggers, exits, confirmations |
| historical account activity | `getSignaturesForAddress`, `getTransaction`, `getTransactionsForAddress` | signatures, parsed instructions, swap history | wallet scoring, creator/token lookbacks |
| asset/account data | DAS `getAssetsByOwner`, standard token mint/account reads | mint metadata, owner assets, token accounts | safety/off-chain enrichment |
| wallet attribution | Wallet API `wallet balances/history/transfers/funded by` | wallet identity/funding/history | targeted wallet analysis only |
| execution support | Priority Fee API, staked RPC, send/confirm flow | fee estimates, blockhashes, confirmation state | trade executor and exit path |

Correct Helius accounting before rollout:

- `getSignaturesForAddress`: `10` credits, not `1`
- `getTransaction`: `10` credits, not `1`

### Jupiter free sidecar

Constraints:

- Free tier `60 req/min`
- Developer docs now center on `api.jup.ag`; current repo still uses old `quote-api.jup.ag/v6` and `price.jup.ag/v6/price`

Endpoints:

| Endpoint | Response fields to use | Purpose |
|---|---|---|
| `/tokens/v2/search?query=` | token metadata, verification status, organic score, holder count, market cap, trading metrics | cheap trust/prefilter |
| `/tokens/v2/toporganicscore/{interval}` | ranked mint list by organic score | S2/S3 watchlist seed |
| `/tokens/v2/toptraded/{interval}` | top traded mint list | S3 watchlist seed |
| `/tokens/v2/toptrending/{interval}` | trending mint list | S3 and regime sidecar |
| `/tokens/v2/recent` | recent first-pool mints | launch discovery |
| `/price/v3?ids=` | `usdPrice`, `blockId`, `decimals`, `priceChange24h` | price sanity and non-Birdeye snapshots |
| `/swap/v1/quote` | `outAmount`, `otherAmountThreshold`, `slippageBps`, `priceImpactPct`, `routePlan[].swapInfo.label`, `contextSlot`, `timeTaken` | exit pricing, route sanity, venue detection |
| `/trigger/v2` | single/OCO/OTOCO trigger orders | future managed exits |

Use Jupiter for:

- all fast exit quotes
- route venue detection (`routePlan[].swapInfo.label`)
- low-cost early candidate quality (`organic score`, `verification`, `recent`)

### DEX Screener free sidecar

Constraints:

- `300 req/min` on pair/token endpoints
- `60 req/min` on profiles/boost/community endpoints

Endpoints:

| Endpoint | Response fields to use | Purpose |
|---|---|---|
| `/tokens/v1/{chainId}/{tokenAddresses}` | `dexId`, `pairAddress`, `priceUsd`, `txns`, `volume`, `priceChange`, `liquidity`, `fdv`, `marketCap`, `pairCreatedAt`, `info`, `boosts` | batch prefilter for known watchlist |
| `/token-pairs/v1/{chainId}/{tokenAddress}` | same pair object per pool | detect best pool and cheap liquidity |
| `/latest/dex/search?q=` | pair search by symbol/address | fallback lookup |
| `/token-boosts/latest/v1` | token address, boost amount | optional hype flag |
| `/token-boosts/top/v1` | token address, total boost | optional hype flag |

Use DEX Screener for:

- cheap pool/liquidity/FDV prefilter
- coarse volume and price-change checks between expensive Birdeye pulls
- pool discovery before Raydium/Meteora confirmation

### PumpPortal free watchlist feed

Constraints:

- one websocket connection only
- do not spam connections
- official docs do not publish a stable event schema
- bonding-curve feed is free; PumpSwap streaming requires API key and message billing

Methods:

| Method | Use |
|---|---|
| `subscribeNewToken` | launch watchlist seed |
| `subscribeTokenTrade` | token trade activity on watched launches |
| `subscribeAccountTrade` | wallet trade sidecar if needed |
| `subscribeMigration` | S2 graduation seed for pump migrations |

Integration rule:

- persist raw payload JSON and extract only defensive fields (`tokenAddress`, `signature`, `wallet`, `eventType`, `timestamp`, `poolHint`) because the docs show subscription methods and limits but not a stable payload contract

### Raydium and Meteora protocol sidecars

Raydium:

- Public REST APIs are for monitoring/data, not real-time pool creation
- Response envelope is wrapped in `{ id, success, data }`
- Use:
  - `/pools/info/mint`
  - `/pools/info/list-v2`
  - `/pools/line/liquidity`

Meteora:

- `DLMM`: `30 RPS`
- `DAMM v2`: `10 RPS`
- Use:
  - `GET /pools`
  - `GET /pools/{address}`
  - `GET /pools/{address}/ohlcv`
  - `GET /pools/{address}/volume/history`

Use Raydium/Meteora only when:

- Jupiter route labels or DEX Screener pairs show that venue
- a shortlisted token needs protocol-specific pool confirmation

## Normalized Internal Types

Add provider-agnostic DTOs in a new `market-data` module so strategies stop talking directly in provider dialects:

```ts
type DiscoveryCandidate = {
  tokenAddress: string;
  symbol?: string;
  sourceProvider: "BIRDEYE" | "JUPITER" | "DEXSCREENER" | "PUMPPORTAL";
  sourceType: string;
  poolAddress?: string;
  dexId?: string;
  liquidityUsd?: number;
  volume5m?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  organicScore?: number;
  verified?: boolean;
  launchedAt?: Date;
  metadata?: Record<string, unknown>;
};

type MarketScore = {
  priceUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  volume5m?: number;
  volume1h?: number;
  buyVolume5m?: number;
  tradeCount5m?: number;
  uniqueWallets5m?: number;
  buyPressure?: number;
  holders?: number;
  top10HolderPct?: number;
  freezeable?: boolean;
  mintAuthority?: boolean;
  transferFeeEnabled?: boolean;
  mutableMetadata?: boolean;
  exitLiquidityUsd?: number;
  bestPairAddress?: string;
  bestDex?: string;
  raw?: Record<string, unknown>;
};

type ExecutionQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  slippageBps: number;
  routeLabels: string[];
  contextSlot?: number;
  quoteLatencyMs?: number;
};
```

## Plan Switching Design

Do not store Birdeye plan in `ConfigProfile.settings`. Store it in static runtime config.

Modify [index.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/config/index.ts):

```ts
providers: {
  birdeye: {
    plan: "LITE" as "LITE" | "STARTER",
    reservePct: 0.10,
    softLimitPct: 70,
    hardLimitPct: 100,
    monthlyIncludedCu: {
      LITE: 1_500_000,
      STARTER: 5_000_000,
    },
    preset: {
      LITE: {
        activeHoursUtc: [13, 17],
        s2ScanMsActive: 300_000,
        s2ScanMsIdle: 900_000,
        s3ScanMsActive: 120_000,
        s3ScanMsIdle: 600_000,
        trendingMs: 1_800_000,
        finalBirdeyeSecurity: "FINALISTS_ONLY",
      },
      STARTER: {
        activeHoursUtc: [13, 23],
        s2ScanMsActive: 120_000,
        s2ScanMsIdle: 600_000,
        s3ScanMsActive: 60_000,
        s3ScanMsIdle: 300_000,
        trendingMs: 600_000,
        finalBirdeyeSecurity: "FINALISTS_AND_RECHECKS",
      },
    },
  },
  routing: {
    useJupiterExitQuotes: true,
    useDexScreenerPrefilter: true,
    usePumpPortalWatchlist: true,
    useRaydiumPoolConfirm: true,
    useMeteoraPoolConfirm: true,
  },
}
```

Rules:

- strategies read derived capability flags, not raw plan strings
- `ApiBudgetManager` owns daily budget math
- free providers never become hard quota blockers
- only `HELIUS` and `BIRDEYE` can pause the bot

## Strategy Workflow Mapping

### S1 Copy Trade

Current file: [copy-trade.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/strategies/copy-trade.ts)

New flow:

1. Helius wallet event arrives
2. Parse transaction and record wallet activity
3. Free prefilter:
   - Jupiter token search/category lookup for verification/organic score
   - DEX Screener pair lookup for liquidity/FDV/pool age
4. Birdeye staged scoring:
   - always: `token_overview`, `trade-data`, `pair overview`, `exit-liquidity`
   - cached finalist-only: `token_security`, `holder`
5. On-chain safety supplement from Helius mint/account reads
6. Execute with Jupiter
7. Confirm/reconcile with Helius

Plan differences:

- `Lite`: cache Birdeye scoring aggressively per token, skip repeated security/holder fetches for 6h-24h
- `Starter`: shorter TTLs and more generous rechecks for still-open positions

### S2 Graduation

Current file: [graduation.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/strategies/graduation.ts)

New flow:

1. Seed candidate watchlist from:
   - PumpPortal `subscribeMigration`
   - PumpPortal `subscribeNewToken`
   - Birdeye `meme/list` paid sweep on plan cadence
   - Jupiter `recent` as low-cost supplement
2. Cheap prefilter:
   - DEX Screener token/pair lookup
   - Jupiter token search/category
3. Stage candidate in DB and wait configured delay
4. Re-score with Birdeye:
   - `token_overview`
   - `trade-data`
   - `pair overview`
   - `exit-liquidity`
   - finalist-only `token_security` and `holder`
5. Helius creator/token lookback for serial-launch and creator behavior
6. Execute with Jupiter and monitor via Helius

Plan differences:

- `Lite`: treat Birdeye `meme/list` as periodic catch-up only; watchlist should mostly come from PumpPortal/Jupiter/DEX Screener
- `Starter`: keep periodic `meme/list` as the primary paid discovery input during active hours

### S3 Momentum

Current file: [momentum.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/strategies/momentum.ts)

New flow:

1. Seed candidate watchlist from:
   - Jupiter `toptrending` / `toptraded` / `toporganicscore`
   - DEX Screener token boosts and pool activity
   - PumpPortal trade stream for fresh launches
   - Birdeye `token/list` paid sweep on plan cadence
2. Cheap prefilter:
   - DEX Screener liquidity/FDV/marketCap/priceChange
   - Jupiter verification/organic-score filters
3. Mandatory Birdeye trade-intelligence:
   - `token_overview`
   - `trade-data`
   - `pair overview`
   - `exit-liquidity`
4. Finalist-only concentration/safety:
   - Helius on-chain authority facts
   - Birdeye `holder` and `token_security` only if candidate survives to final pass
5. Tranche 2 re-check:
   - Jupiter quote for fresh route/impact
   - DEX Screener medium-cadence volume/liquidity refresh
   - Birdeye `trade-data` on slower cadence per plan

Plan differences:

- `Lite`: event/watchlist-driven first, Birdeye sweep second
- `Starter`: can keep paid sweep as a regular active-hours feed

### Shared Exit Monitoring

Current file: [exit-monitor.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/core/exit-monitor.ts)

Replace current Birdeye-heavy loop with:

1. Helius account/token balance subscriptions for position truth
2. Jupiter quote as fast price/route source
3. Helius confirmation/signature tracking for landed exits
4. DEX Screener medium-cadence pair snapshot for coarse momentum fade context
5. Birdeye `exit-liquidity` only:
   - on entry
   - on large position refresh
   - on low-liquidity warning
6. Birdeye `trade-data` for S3 fade logic on slower cadence:
   - `Lite`: `180s`
   - `Starter`: `60s`

## Database Adjustments

Required:

1. Extend `ApiService` enum in [schema.prisma](/A:/Trading%20Setup/bot-trading/trading_bot/backend/prisma/schema.prisma):
   - `DEXSCREENER`
   - `PUMPPORTAL`
   - `RAYDIUM`
   - `METEORA`

2. Add `WatchlistCandidate` model:

```prisma
model WatchlistCandidate {
  id             String   @id @default(cuid())
  strategy       Strategy?
  tokenAddress   String
  tokenSymbol    String   @default("")
  sourceProvider ApiService
  sourceType     String
  poolAddress    String?
  dexId          String?
  priority       Decimal? @db.Decimal(8, 4)
  status         String
  firstSeenAt    DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  expiresAt      DateTime?
  metadata       Json?
  rawPayload     Json?

  @@index([status, lastSeenAt])
  @@index([strategy, status, lastSeenAt])
  @@index([tokenAddress, lastSeenAt])
}
```

3. Add `ProviderState` model if stream resume/cursors must survive restarts:

```prisma
model ProviderState {
  id          String   @id @default(cuid())
  provider    ApiService
  scopeKey    String
  cursor      String?
  metadata    Json?
  updatedAt   DateTime @updatedAt

  @@unique([provider, scopeKey])
}
```

Recommended, not required in phase 1:

- keep extra pool-specific fields inside `metadata`/`rawPayload`
- avoid exploding `Signal` and `TokenSnapshot` columns until real dashboards need normalized pool analytics
- if dashboards later need provider-by-provider pool analytics, add a dedicated `PoolSnapshot` model then

View/doc updates required if schema changes land:

- [create_views.sql](/A:/Trading%20Setup/bot-trading/trading_bot/backend/prisma/views/create_views.sql)
- [prisma-and-views.md](/A:/Trading%20Setup/bot-trading/docs/data/prisma-and-views.md)
- [quota-and-provider-budgets.md](/A:/Trading%20Setup/bot-trading/docs/workflows/quota-and-provider-budgets.md)

## File Plan

Create:

- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/pumpportal.ts`
- `trading_bot/backend/src/services/raydium.ts`
- `trading_bot/backend/src/services/meteora.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/watchlist-store.ts`
- `trading_bot/backend/src/core/provider-state-store.ts`
- `trading_bot/backend/src/utils/market-data-types.ts`

Modify:

- [index.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/config/index.ts)
- [api-budget-manager.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/core/api-budget-manager.ts)
- [helius.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/services/helius.ts)
- [birdeye.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/services/birdeye.ts)
- [jupiter.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/services/jupiter.ts)
- [copy-trade.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/strategies/copy-trade.ts)
- [graduation.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/strategies/graduation.ts)
- [momentum.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/strategies/momentum.ts)
- [exit-monitor.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/core/exit-monitor.ts)
- [intervals.ts](/A:/Trading%20Setup/bot-trading/trading_bot/backend/src/bootstrap/intervals.ts)
- [schema.prisma](/A:/Trading%20Setup/bot-trading/trading_bot/backend/prisma/schema.prisma)

Tests to add/update:

- provider service contract tests
- budget/preset tests
- strategy tests for Lite vs Starter routing
- exit-monitor tests that prove Birdeye is no longer in the fast path

## Rollout Tasks

### Task 1: Add provider-plan capabilities and fix Helius accounting

**Files:**

- Modify: `trading_bot/backend/src/config/index.ts`
- Modify: `trading_bot/backend/src/services/helius.ts`
- Test: `trading_bot/backend/src/services/helius.test.ts`

- [ ] Add `birdeye.plan`, plan presets, and derived capability helpers
- [ ] Correct Helius credit costs for `getSignaturesForAddress` and `getTransaction`
- [ ] Add tests for daily budget math for both Birdeye plans
- [ ] Run: `npm test -- --runInBand trading_bot/backend/src/services/helius.test.ts`

### Task 2: Add free-provider service wrappers and normalized market types

**Files:**

- Create: `trading_bot/backend/src/utils/market-data-types.ts`
- Create: `trading_bot/backend/src/services/dexscreener.ts`
- Create: `trading_bot/backend/src/services/pumpportal.ts`
- Create: `trading_bot/backend/src/services/raydium.ts`
- Create: `trading_bot/backend/src/services/meteora.ts`
- Modify: `trading_bot/backend/src/services/jupiter.ts`
- Test: `trading_bot/backend/src/services/*.test.ts`

- [ ] Implement thin wrappers with timeout, cache, logging, and normalized DTO output
- [ ] Update Jupiter service toward current documented endpoints while preserving quote/execution behavior
- [ ] Add defensive payload parsing for PumpPortal raw events
- [ ] Run service tests and targeted smoke tests

### Task 3: Add watchlist persistence and telemetry

**Files:**

- Modify: `trading_bot/backend/prisma/schema.prisma`
- Create: `trading_bot/backend/src/core/watchlist-store.ts`
- Create: `trading_bot/backend/src/core/provider-state-store.ts`
- Modify: `trading_bot/backend/prisma/views/create_views.sql`
- Test: `trading_bot/backend/src/core/watchlist-store.test.ts`

- [ ] Add new Prisma models and enums
- [ ] Run: `npm run db:setup`
- [ ] Regenerate Prisma client
- [ ] Add stores for watchlist candidate lifecycle and provider cursor state

### Task 4: Insert market-router layer and staged scoring

**Files:**

- Create: `trading_bot/backend/src/services/market-router.ts`
- Modify: `trading_bot/backend/src/services/birdeye.ts`
- Modify: `trading_bot/backend/src/core/api-budget-manager.ts`
- Test: `trading_bot/backend/src/services/market-router.test.ts`

- [ ] Build routing functions for `prefilterCandidate`, `scoreCandidate`, `refreshExitContext`
- [ ] Enforce plan-specific Birdeye stage rules
- [ ] Add per-purpose caps so non-essential scans degrade before exits

### Task 5: Refactor S1 around staged scoring

**Files:**

- Modify: `trading_bot/backend/src/strategies/copy-trade.ts`
- Test: `trading_bot/backend/src/strategies/copy-trade.test.ts`

- [ ] Split current filter path into free prefilter and Birdeye final score
- [ ] Cache per-token safety/holder results
- [ ] Verify elite-wallet trade path still enters only on wallet buys

### Task 6: Refactor S2 around watchlists and delayed rechecks

**Files:**

- Modify: `trading_bot/backend/src/strategies/graduation.ts`
- Modify: `trading_bot/backend/src/bootstrap/intervals.ts`
- Test: `trading_bot/backend/src/strategies/graduation.test.ts`

- [ ] Replace constant dual paid sweeps with plan-aware paid sweep plus free watchlist seeds
- [ ] Persist staged candidates and recheck using delayed final scoring
- [ ] Keep Helius creator/token lookbacks intact

### Task 7: Refactor S3 around watchlists and plan-aware paid cadence

**Files:**

- Modify: `trading_bot/backend/src/strategies/momentum.ts`
- Test: `trading_bot/backend/src/strategies/momentum.test.ts`

- [ ] Add Jupiter/DEX Screener/PumpPortal seeds before Birdeye
- [ ] Keep Birdeye `trade-data` mandatory for final entry
- [ ] Use plan-specific cadence for tranche-2 rechecks

### Task 8: Move exits off Birdeye fast polling

**Files:**

- Modify: `trading_bot/backend/src/core/exit-monitor.ts`
- Modify: `trading_bot/backend/src/core/trade-executor.ts`
- Test: `trading_bot/backend/src/core/exit-monitor.test.ts`

- [ ] Use Helius subscriptions and Jupiter quotes in the fast loop
- [ ] Keep Birdeye exit-liquidity and trade-data only on slow/conditional refresh
- [ ] Prove open-position monitoring no longer burns Birdeye every 5 seconds

### Task 9: Update docs and verify both paid presets

**Files:**

- Modify: `docs/workflows/quota-and-provider-budgets.md`
- Modify: `docs/strategies/s1-copy-trade.md`
- Modify: `docs/strategies/s2-graduation.md`
- Modify: `docs/strategies/s3-momentum.md`
- Modify: `docs/data/prisma-and-views.md`

- [ ] Document Lite and Starter preset behavior
- [ ] Document free-provider fallback and failure policy
- [ ] Run targeted backend tests
- [ ] Run `npm run build` or equivalent backend typecheck/build path

## Verification Checklist

- `Birdeye Lite` daily budget stays under `45k` in 30-day simulation with reserve intact
- `Birdeye Starter` daily budget stays under `150k` in 30-day simulation with reserve intact
- exit loop shows no fast-path Birdeye dependency
- S3 still hard-requires Birdeye trade data for final entry
- quota pause still only comes from `HELIUS` or `BIRDEYE`
- provider telemetry includes new free services without treating them as hard budget blockers
- docs and SQL views match schema changes

## Sources

- Birdeye pricing: https://bds.birdeye.so/pricing
- Birdeye package access: https://docs.birdeye.so/docs/data-accessibility-by-packages
- Birdeye CU cost: https://docs.birdeye.so/docs/compute-unit-cost
- Birdeye rate limiting: https://docs.birdeye.so/docs/rate-limiting
- Helius plans: https://www.helius.dev/docs/billing/plans
- Helius credits: https://www.helius.dev/docs/billing/credits
- Helius rate limits: https://www.helius.dev/docs/billing/rate-limits
- Helius websocket guide: https://www.helius.dev/docs/rpc/websocket
- Helius event listening: https://www.helius.dev/docs/event-listening
- Helius transaction optimization: https://www.helius.dev/docs/sending-transactions/optimizing-transactions
- Jupiter docs: https://dev.jup.ag/get-started
- Jupiter tokens: https://dev.jup.ag/docs/tokens/token-information
- Jupiter price: https://dev.jup.ag/docs/price
- Jupiter quote: https://dev.jup.ag/api-reference/swap/v1/quote
- Jupiter trigger: https://dev.jup.ag/docs/trigger
- Jupiter rate limits: https://dev.jup.ag/portal/rate-limit
- DEX Screener API reference: https://docs.dexscreener.com/api/reference
- PumpPortal realtime data: https://pumpportal.fun/data-api/real-time/
- PumpPortal PumpSwap data: https://pumpportal.fun/data-api/pump-swap/
- PumpPortal FAQ: https://pumpportal.fun/FAQ/
- Raydium API docs: https://docs.raydium.io/raydium/for-developers/api
- Raydium Swagger: https://api-v3.raydium.io/docs/
- Meteora DLMM overview: https://docs.meteora.ag/api-reference/dlmm/overview
- Meteora DAMM v2 overview: https://docs.meteora.ag/api-reference/damm-v2/overview

