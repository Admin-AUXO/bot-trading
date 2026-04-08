# S2 Graduation

Source file: `trading_bot/backend/src/strategies/graduation.ts`

## What Triggers It

- interval scans over Jupiter `recent` seeds plus DEX Screener prefilter
- plan-aware Birdeye `meme/list` catch-up to recover what cheap discovery misses
- optional `new_listing` fallback only when `S2_ENABLE_NEW_LISTING_FALLBACK=true`
- router-side seed market-cap sanity drops obvious large-cap mismatches before paid `meme/detail`

This strategy does not buy immediately on first sight. It stages candidates, waits, then re-checks them.

## Workflow

1. Pull `recent` seeds through `MarketRouter`.
2. Run DEX Screener prefilter and only spend Birdeye `meme/detail` on shortlisted recent tokens.
3. Drop obvious large-cap recent seeds before paid `meme/detail` when the cheap seed market cap is already far above the configured S2 ceiling.
4. Use Birdeye `meme/list` catch-up on the plan-aware cadence to recover missed near-grad and fresh-grad tokens.
5. Track pending graduation events and persist analytics records.
6. After the configured delay, re-check the token.
7. Run cheap liquidity, market-cap, holder-count, and live trade-data checks before Helius anti-bot history and Birdeye holder/security enrichment.
8. Size from `RiskManager`.
9. Execute buy and attach the opened position back to the graduation event.

## Main Filters

- live graduation-age cap at actual entry time
- minimum liquidity
- maximum market cap
- minimum unique holders
- maximum top-10 holder concentration
- maximum single-holder concentration
- minimum unique buyers in the recent window
- minimum buy/sell ratio
- maximum bot-like transaction count in 60 seconds
- maximum serial deploys by the creator over the lookback window
- security checks from Birdeye
- DEX Screener presence and liquidity still re-check the token before delayed paid entry enrichment, so dead pairs fail before Birdeye overview/trade/security spend

## Important Safety Notes

- the entry delay is part of the strategy, not a UI artifact
- creator and token-transaction lookbacks are there to reduce serial-launch spam
- this strategy still uses the same risk-manager gates as the others
- cheap discovery is allowed to miss progress changes; the Birdeye catch-up loop exists to close that gap without keeping paid scans on a `20s` cadence
- when `S2` is already full, the catch-up loop, fallback loop, and delayed entry re-checks now stop spending Birdeye CU until capacity returns
- concurrent paid `meme/detail`, overview, and entry-filter evaluations are capped to the remaining `S2` slot count instead of fanning out blindly
- recent-seed DEX liquidity now gates paid `meme/detail`, so obviously thin pairs do not spend Birdeye detail credits
- `S2_ENABLE_NEW_LISTING_FALLBACK` is now the explicit feature flag for the old Birdeye `new_listing` sweep, and it defaults off
- `LIVE` now hard-rejects entries if the graduation timestamp is missing or older than the configured age cap at execution time
- `LIVE` now hard-rejects entries when Birdeye trade data is missing
- `DRY_RUN` still soft-fails missing trade data so analytics can keep observing candidates
- once a position is open, the `5s` exit loop now uses router-backed prices instead of Birdeye `multi_price`
- delayed-entry signals and opened positions now persist the holder count and buy-pressure fields already fetched during scoring instead of dropping that context on the floor

## Exit Shape

- stop loss at `-25%`
- TP1 at `1.6x` price, selling `50%` of remaining size
- once TP1 is done, the remaining size is protected and will exit if profit retraces materially before TP2
- TP2 at `2.4x` price, selling `25%` of remaining size
- trailing stop at `25%` after both partials
- soft time-stop at `15m`
- hard time limit at `120m`

## Files Worth Reading Before Changes

- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/prisma/schema.prisma` for `GraduationEvent`
