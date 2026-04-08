# S1 Copy Trade

Source file: `trading_bot/backend/src/strategies/copy-trade.ts`

## Trigger

- Helius websocket subscription to elite-wallet activity
- only wallet buys create entry candidates
- wallet scoring maintenance runs separately and refreshes the elite-wallet set

## Workflow

1. ensure elite wallets exist; bootstrap scoring if they do not
2. receive wallet activity from Helius
3. record wallet activity for analytics with router-backed price capture
4. run DEX Screener sanity before any paid Birdeye score
5. fetch final token context through Birdeye
6. reject on regime, duplicate exposure, or risk-manager blockers
7. reject on token-quality filters
8. size via `riskManager.getPositionSize("S1_COPY")`
9. execute buy and start exit monitoring

## Main Filters

- live source-transaction freshness cap
- minimum liquidity
- maximum market cap
- minimum buy pressure
- minimum unique buyers
- minimum buy/sell ratio
- maximum top-10 holder concentration
- maximum single-holder concentration
- no freezeable token
- no active mint authority
- no transfer-fee token
- wash-trading ratio under threshold

## Safety Notes

- if `S1` is disabled, it does not open the Helius subscription path or run daily wallet scoring
- `RISK_OFF` blocks new copy entries
- duplicate signatures and already-held tokens are skipped
- startup and elite-wallet refresh prime a per-wallet signature waterline to avoid replay
- wallet scoring is quota-degradable under Helius pressure
- `CHOPPY` hard-pauses S1 even when other strategies can still trade
- DEX Screener prefilter is cheap trash filtering, not a replacement for Birdeye security checks
- `LIVE` hard-rejects copied buys if the source timestamp is missing or too old
- `LIVE` hard-rejects tokens when Birdeye trade data is missing
- `DRY_RUN` still allows missing Birdeye trade data so analytics can observe candidates
- paid Birdeye scoring short-circuits when `S1` has no remaining entry slots
- exit pricing now comes from `MarketRouter.refreshExitContext()` on the `5s` loop

## Exit Shape

- stop loss at `-20%`
- TP1 at `+30%`, selling `50%` of remaining size
- once TP1 is done, remaining size exits if profit retraces to a low single-digit gain before TP2
- TP2 at `+60%`, selling `50%` of remaining size again
- trailing stop at `20%` after both partials
- time-stop at `120m`

## Files Worth Reading

- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
