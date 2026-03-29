# S2 Graduation

Source file: `trading_bot/backend/src/strategies/graduation.ts`

## What Triggers It

- interval scans over Birdeye meme-list data
- fallback scans over fresh listings when the normal source misses

This strategy does not buy immediately on first sight. It stages candidates, waits, then re-checks them.

## Workflow

1. Scan near-graduation candidates.
2. Track pending graduation events and persist analytics records.
3. After the configured delay, re-check the token.
4. Run token-quality and anti-bot filters.
5. Size from `RiskManager`.
6. Execute buy and attach the opened position back to the graduation event.

## Main Filters

- minimum liquidity
- maximum market cap
- maximum top-10 holder concentration
- maximum single-holder concentration
- minimum unique buyers in the recent window
- minimum buy/sell ratio
- maximum bot-like transaction count in 60 seconds
- maximum serial deploys by the creator over the lookback window
- security checks from Birdeye

## Important Safety Notes

- the entry delay is part of the strategy, not a UI artifact
- creator and token-transaction lookbacks are there to reduce serial-launch spam
- this strategy still uses the same risk-manager gates as the others
- `minUniqueHolders` exists in config but is not currently enforced in strategy code
- Birdeye trade-data checks are soft-fail here; missing trade data can remove some reject paths instead of forcing a reject

## Exit Shape

- stop loss at `-25%`
- TP1 at `2x` price, selling `50%` of remaining size
- TP2 at `3.5x` price, selling `25%` of remaining size
- trailing stop at `25%` after both partials
- soft time-stop at `15m`
- hard time limit at `120m`

## Files Worth Reading Before Changes

- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/prisma/schema.prisma` for `GraduationEvent`
