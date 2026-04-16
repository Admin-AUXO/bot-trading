# 2026-04-16: Meme Coin Schema Evolution Plan

## Status
**COMPLETE** - Schema, views, and code fully migrated

## Context
Analyzed existing 687-line Prisma schema for the meme coin trading bot. Identified significant redundancies:
- TokenMetrics vs TokenSnapshot (near-duplicate tables)
- Candidate vs TokenMetrics (same metrics stored in multiple places)
- Over-denormalized volume timeframes (1m, 5m, 30m, 1h, 24h for most fields)
- Pre-computed columns stored instead of derived at query time

## Changes Implemented

### 1. Schema Optimization

**Unified TokenMetrics** (was: TokenMetrics + TokenSnapshot)
- Single time-series fact table for all token metrics
- `trigger` field distinguishes discovery vs entry vs exit vs scheduled captures
- All time windows stored as 1m granularity; larger windows derived in views
- Scores stored here, not duplicated in Candidate

**Streamlined Candidate**
- Removed all redundant metric columns (price, liquidity, volume, holders)
- Now references TokenMetrics via `latestMetricsId` FK
- Stores only pipeline state and timing
- Computed values (staleness, age, ratios) derived at query time

**Leaner Position**
- Entry context captured once (no historical snapshots in table)
- Current state updated; historical via TokenMetrics snapshots
- P&L computed from entry vs current, not stored

**Consolidated Discovery Lab**
- Run, Query, Token tables simplified
- Analysis results (passed, grade, scores) stored directly
- Winner tracking embedded in run token record

### 2. Views (SQL)

**Removed Redundancy:**
- `v_token_metrics_latest` - Latest per mint+trigger
- `v_token_metrics_aggregation` - Hourly rollups
- `v_candidate_lifecycle` - Timing/staleness
- `v_candidate_with_metrics` - Joined view (no duplicate columns)
- `v_position_monitor` - Alert priority computed
- `v_fill_performance` - P&L derived from entry context

### 3. API Field Mapping

**Birdeye API → Schema:**

| Birdeye Endpoint | Schema Table | Notes |
|------------------|--------------|-------|
| `/defi/v3/token-meta-data` | TokenMetrics.metadata | Raw JSON |
| `/defi/token/overview` | TokenMetrics | price, mktcap, fdv |
| `/defi/v3/token-market-data` | TokenMetrics | volume, holders, trades |
| `/defi/v3/token-trade-data` | TokenMetrics | buys, sells, trades |
| `/defi/token/security` | TokenMetrics.security fields | honeypot, freezeable |
| `/defi/v3/meme-list` | DiscoveryLabRunToken | Source + metrics |
| `/defi/v3/meme-detail` | SharedTokenFact | Pool + bonding |

**Helius API → Schema:**

| Helius Endpoint | Schema Table | Notes |
|-----------------|--------------|-------|
| `getAsset` | SharedTokenFact | Metadata cache |
| `getTokenHolders` | TokenMetrics | Holder distribution |
| `parseTransactions` | Fill | Execution verification |
| `getPriorityFeeEstimate` | Fill metadata | Latency tracking |

### 4. API Gaps Identified

**Missing from Birdeye:**
- Pool address → Add to SharedTokenFact when available
- Bonding curve reserves → Store in TokenMetrics.metadata as JSON

**Missing from Helius:**
- Jupiter quote response → Store in Fill.metadata
- Complete swap instruction → Store in Fill.metadata

## Column Count Comparison

| Table | Before | After | Reduction |
|-------|--------|-------|-----------|
| Candidate | ~85 | ~35 | 59% |
| Position | ~70 | ~45 | 36% |
| TokenMetrics | ~80 | ~45 | 44% |
| TokenSnapshot | ~75 | (removed) | 100% |
| **Total** | ~310 | ~125 | **60%** |

## Performance Implications

**Writes:** ~40% fewer columns to populate per candidate/position
**Reads:** Views do join work; dashboard queries may need optimization
**Storage:** TokenMetrics only stores 1m windows; larger derived at query time

## Rollout Path

1. [x] Update schema.prisma
2. [x] Update create_views.sql
3. [x] Run `npm run db:generate` to regenerate Prisma client
4. [x] Test views with `npm run db:setup`
5. [x] Update backend services that write to simplified tables
6. [x] Typecheck passes

## Files Modified

**Schema:**
- `trading_bot/backend/prisma/schema.prisma` - Unified schema with relation fields

**Views:**
- `trading_bot/backend/prisma/views/create_views.sql` - 14 optimized views

**Code:**
- `trading_bot/backend/src/utils/json.ts` - toJsonValue null handling
- `trading_bot/backend/src/services/discovery-lab-service.ts` - thesis type fix
- `trading_bot/backend/src/services/discovery-lab-manual-entry.ts` - entryScore
- `trading_bot/backend/src/services/operator-desk.ts` - latestMetrics relation
- `trading_bot/backend/src/engine/graduation-engine.ts` - latestMetrics relation

**Docs:**
- `notes/decisions/2026-04-16-meme-coin-schema-evolution.md` - This document

## Related

- `notes/reference/prisma-and-views.md` - General Prisma patterns
- `trading_bot/backend/prisma/schema.prisma` - Current schema
- `trading_bot/backend/prisma/views/create_views.sql` - Current views
