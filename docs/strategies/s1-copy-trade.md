# S1 Copy Trade

Source file: `trading_bot/backend/src/strategies/copy-trade.ts`

## What Triggers It

- Helius websocket subscription to elite-wallet activity
- Only wallet buys can create entry candidates
- Wallet-scoring maintenance runs separately on an interval and refreshes the elite-wallet set

## Workflow

1. Ensure elite wallets exist; trigger scoring/bootstrap if they do not.
2. Receive wallet activity from Helius.
3. Record wallet activity for analytics.
4. Fetch token context through Birdeye.
5. Reject on regime, duplicate exposure, or risk-manager blockers.
6. Reject on token-quality filters.
7. Size via `riskManager.getPositionSize("S1_COPY")`.
8. Execute buy and start exit monitoring.

## Main Filters

- minimum liquidity
- maximum market cap
- minimum buy pressure
- maximum top-10 holder concentration
- maximum single-holder concentration
- no freezeable token
- no active mint authority
- no transfer-fee token
- wash-trading ratio under threshold

## Important Safety Notes

- `RISK_OFF` blocks new copy entries
- duplicate signatures and already-held tokens are skipped
- wallet-scoring is quota-degradable and can be skipped when Helius non-essential budget is stressed
- `CHOPPY` hard-pauses S1 even when other strategies can still trade
- missing Birdeye trade data weakens the wash-trading check instead of hard-rejecting the token

## Exit Shape

- stop loss at `-20%`
- TP1 at `+30%`, selling `50%` of remaining size
- TP2 at `+60%`, selling `50%` of remaining size again
- trailing stop at `20%` after both partials
- time-stop at `120m`; no separate hard time-limit field for S1

## Files Worth Reading Before Changes

- `trading_bot/backend/src/services/helius.ts`
- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
