# S3 Momentum

Source file: `trading_bot/backend/src/strategies/momentum.ts`

## What Triggers It

- interval scans of router-backed Jupiter momentum feeds
- DEX Screener prefilter before any paid Birdeye final-score call

This is the only strategy with staged position growth built into the entry logic.

## Workflow

1. Pull momentum seeds through `MarketRouter.getMomentumSeeds()`.
2. Run DEX Screener batch prefilter and drop tokens with no cheap-side market confirmation.
3. Reject on regime, quota, duplicate exposure, or risk-manager blockers.
4. Run final Birdeye overview, trade-data, security, and holder checks.
5. Buy tranche 1 only.
6. Wait for the configured delay.
7. Re-check follow-through before tranche 2.
8. Only then allow size increase through `riskManager.canIncreasePosition`.

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
- signal `source` now reflects the routed seed feed (`JUPITER_TOP_TRENDING` or `JUPITER_TOP_TRADED`) instead of pretending everything came from Birdeye `v3/token/list`
- exit pricing now comes from `MarketRouter.refreshExitContext()` on the `5s` loop instead of Birdeye `multi_price`
- fade exits still use Birdeye trade data, but only on a throttled slow path; refresh cadence is plan-aware (`STARTER` `60s`, `LITE` `180s`)

## Exit Shape

- stop loss at `-10%`
- TP1 at `+20%`, selling `50%` of remaining size
- TP2 at `+40%`, selling `50%` of remaining size again
- trailing stop at `15%` after both partials
- fade exit if `current volume5m / entryVolume5m < 1.2`, using throttled slow-path trade-data refresh instead of per-batch polling
- soft time-stop at `5m`
- hard time limit at `30m`

## Files Worth Reading Before Changes

- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
