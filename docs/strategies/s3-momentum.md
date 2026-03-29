# S3 Momentum

Source file: `trading_bot/backend/src/strategies/momentum.ts`

## What Triggers It

- interval scans of Birdeye token lists ranked by short-window volume change

This is the only strategy with staged position growth built into the entry logic.

## Workflow

1. Scan top momentum candidates.
2. Reject on regime, quota, duplicate exposure, or risk-manager blockers.
3. Run momentum and token-quality filters.
4. Buy tranche 1 only.
5. Wait for the configured delay.
6. Re-check follow-through before tranche 2.
7. Only then allow size increase through `riskManager.canIncreasePosition`.

## Main Filters

- minimum 5-minute volume
- volume spike versus recent history
- minimum liquidity
- maximum market cap
- minimum holder count
- minimum buy pressure
- wash-trading ratio under threshold
- maximum already-pumped percent
- top-holder concentration limits

## Tranche 2 Rules

- existing position must still be valid
- price must be above entry
- fresh buy pressure must still hold
- liquidity must still be above the floor
- market cap must still be under the ceiling
- holder participation must stay above the configured ratio
- volume retention must stay above the configured floor

## Important Safety Notes

- `RISK_OFF` blocks new momentum entries
- `CRITICAL` capital level still allows only S3 in `RiskManager`, so this strategy carries special capital-state importance
- tranche 2 is not a blind DCA path; it is a gated follow-through add
- S3 hard-requires trade data for entry; quota starvation usually suppresses signals instead of weakening filters
- tranche 2 uses `canIncreasePosition()`, so it obeys balance and safety checks but is not the same path as opening a brand-new slot

## Exit Shape

- stop loss at `-10%`
- TP1 at `+20%`, selling `50%` of remaining size
- TP2 at `+40%`, selling `50%` of remaining size again
- trailing stop at `15%` after both partials
- fade exit if `current volume5m / entryVolume5m < 1.2`
- soft time-stop at `5m`
- hard time limit at `30m`

## Files Worth Reading Before Changes

- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
