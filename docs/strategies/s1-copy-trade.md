# S1 Copy Trade

Source file: `trading_bot/backend/src/strategies/copy-trade.ts`

## What Triggers It

- Helius websocket subscription to elite-wallet activity
- Only wallet buys can create entry candidates
- Wallet-scoring maintenance runs separately on an interval and refreshes the elite-wallet set

## Workflow

1. Ensure elite wallets exist; trigger scoring/bootstrap if they do not.
2. Receive wallet activity from Helius.
3. Record wallet activity for analytics with router-backed price capture.
4. Run DEX Screener sanity before any paid Birdeye score.
5. Fetch final token context through Birdeye.
6. Reject on regime, duplicate exposure, or risk-manager blockers.
7. Reject on token-quality filters.
8. Size via `riskManager.getPositionSize("S1_COPY")`.
9. Execute buy and start exit monitoring.

## Main Filters

- live source-transaction freshness cap before any paid enrichment
- minimum liquidity
- maximum market cap
- minimum buy pressure
- minimum unique buyers in the recent window
- minimum buy/sell ratio in the recent window
- maximum top-10 holder concentration
- maximum single-holder concentration
- no freezeable token
- no active mint authority
- no transfer-fee token
- wash-trading ratio under threshold

## Important Safety Notes

- `RISK_OFF` blocks new copy entries
- duplicate signatures and already-held tokens are skipped
- startup and elite-wallet refresh now prime a per-wallet signature waterline so S1 does not replay pre-existing history on reconnect
- wallet-scoring is quota-degradable and can be skipped when Helius non-essential budget is stressed
- `CHOPPY` hard-pauses S1 even when other strategies can still trade
- wallet-activity price capture now goes through `MarketRouter.refreshExitContext()`, so S1 analytics no longer call Birdeye `multi_price` for every copied buy
- DEX Screener prefilter is a cheap trash filter, not a replacement for Birdeye security, holder, or wash-trading checks
- `LIVE` now hard-rejects copied buys if the source transaction timestamp is missing or older than the configured freshness cap
- `LIVE` now hard-rejects tokens when Birdeye trade data is missing instead of weakening the wash-trading check
- `DRY_RUN` still allows missing Birdeye trade data to pass the wash-trading gate so analytics can keep observing candidates
- paid Birdeye entry scoring now short-circuits when `S1` has no remaining entry slots, and concurrent webhook candidates only consume as many paid evaluations as there are slots left
- open-position exit pricing now comes from `MarketRouter.refreshExitContext()` on the `5s` loop, so S1 exits no longer depend on Birdeye `multi_price`
- daily wallet scoring still pays for Birdeye top-trader discovery and Helius archival history; those costs are unchanged by the entry-path refactor

## Exit Shape

- stop loss at `-20%`
- TP1 at `+30%`, selling `50%` of remaining size
- once TP1 is done, the remaining size is protected and will exit if profit retraces to a low single-digit gain before TP2
- TP2 at `+60%`, selling `50%` of remaining size again
- trailing stop at `20%` after both partials
- time-stop at `120m`; no separate hard time-limit field for S1

## Files Worth Reading Before Changes

- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
