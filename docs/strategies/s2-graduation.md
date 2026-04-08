# S2 Graduation

Source file: `trading_bot/backend/src/strategies/graduation.ts`

## Trigger

- interval scans over Jupiter `recent` seeds plus DEX Screener prefilter
- plan-aware Birdeye `meme/list` catch-up to recover what cheap discovery misses
- optional `new_listing` fallback only when `S2_ENABLE_NEW_LISTING_FALLBACK=true`
- router-side seed market-cap sanity drops obvious large-cap mismatches before paid `meme/detail`

S2 does not buy on first sight. It stages candidates, waits, then re-checks them.

## Workflow

1. pull `recent` seeds through `MarketRouter`
2. run DEX Screener prefilter and only spend Birdeye `meme/detail` on shortlisted recent tokens
3. drop obvious large-cap seeds before paid detail calls
4. use Birdeye `meme/list` catch-up on the plan-aware cadence
5. track pending graduation events and persist analytics records
6. after the configured delay, re-check the token
7. run cheap liquidity, market-cap, holder-count, and live trade-data checks before Helius and Birdeye enrichment
8. size from `RiskManager`
9. execute buy and attach the opened position back to the graduation event

## Main Filters

- live graduation-age cap at entry time
- minimum liquidity
- maximum market cap
- minimum unique holders
- maximum top-10 holder concentration
- maximum single-holder concentration
- minimum unique buyers
- minimum buy/sell ratio
- maximum bot-like transaction count in `60s`
- maximum serial deploys by the creator over the lookback window
- Birdeye security checks

## Safety Notes

- the entry delay is part of the strategy, not a UI artifact
- creator and token-transaction lookbacks reduce serial-launch spam
- S2 uses the same risk-manager gates as the other strategies
- cheap discovery is allowed to miss progress changes; Birdeye catch-up closes that gap
- when `S2` is full, catch-up, fallback, and delayed re-checks stop spending Birdeye CU
- concurrent paid evaluations are capped to remaining `S2` slot count
- recent-seed DEX liquidity now gates paid `meme/detail`
- `S2_ENABLE_NEW_LISTING_FALLBACK` is the explicit flag for the old `new_listing` sweep
- `LIVE` hard-rejects entries if the graduation timestamp is missing or too old
- `LIVE` hard-rejects entries when Birdeye trade data is missing
- `DRY_RUN` still soft-fails missing trade data so analytics can observe candidates
- once a position is open, the `5s` exit loop uses router-backed prices instead of Birdeye `multi_price`

## Exit Shape

- stop loss at `-25%`
- TP1 at `1.6x` price, selling `50%` of remaining size
- once TP1 is done, remaining size exits if profit retraces materially before TP2
- TP2 at `2.4x` price, selling `25%` of remaining size
- trailing stop at `25%` after both partials
- soft time-stop at `15m`
- hard time limit at `120m`

## Files Worth Reading

- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/prisma/schema.prisma`
