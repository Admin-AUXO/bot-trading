# S3 Momentum

Source file: `trading_bot/backend/src/strategies/momentum.ts`

## Trigger

- interval scans of router-backed Jupiter momentum feeds
- DEX Screener prefilter before any paid Birdeye final-score call
- router-side seed market-cap sanity drops obvious large-cap mismatches before paid scoring

This is the only strategy with staged position growth built into entry logic.

## Workflow

1. pull momentum seeds through `MarketRouter.getMomentumSeeds()`
2. run DEX Screener batch prefilter and drop tokens with no cheap-side market confirmation
3. drop obvious large-cap router seeds before paid Birdeye scoring
4. reject on regime, quota, duplicate exposure, or risk-manager blockers
5. run final Birdeye overview, trade-data, security, and holder checks
6. buy tranche 1 only
7. wait for the configured delay
8. re-check follow-through before tranche 2
9. only then allow size increase through `riskManager.canIncreasePosition`

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

- position must still be valid
- price must be above entry
- buy pressure must still hold
- liquidity must still be above the floor
- market cap must still be under the ceiling
- holder participation must stay above the configured ratio
- volume retention must stay above the configured floor

## Safety Notes

- `RISK_OFF` blocks new momentum entries
- `CRITICAL` capital state still allows only S3 in `RiskManager`
- tranche 2 is a gated follow-through add, not blind DCA
- S3 hard-requires trade data for entry; quota starvation usually suppresses signals instead of weakening filters
- incomplete Birdeye trade payloads fail closed
- minimum 5-minute volume is enforced before the paid security and holder checks
- DEX Screener liquidity now hard-rejects sub-floor candidates before paid Birdeye calls
- paid tranche-1 Birdeye scoring short-circuits when `S3` has no remaining entry slots
- repeated rejected names now cool off for multiple scan cadences instead of being re-scored every loop
- tranche 2 uses `canIncreasePosition()`, so it obeys balance and safety checks without consuming a brand-new slot
- signal `source` now reflects the routed seed feed instead of pretending everything came from Birdeye `v3/token/list`
- exit pricing now comes from `MarketRouter.refreshExitContext()` on the `5s` loop
- fade exits still use Birdeye trade data, but only on a throttled slow path

## Exit Shape

- stop loss at `-10%`
- TP1 at `+20%`, selling `50%` of remaining size
- once TP1 is done, remaining size exits if profit retraces toward a minimal gain before TP2
- TP2 at `+40%`, selling `50%` of remaining size again
- trailing stop at `15%` after both partials
- fade exit if `current volume5m / entryVolume5m < 1.2` on two consecutive weak reads
- soft time-stop at `5m`
- hard time limit at `30m`

## Files Worth Reading

- `trading_bot/backend/src/services/birdeye.ts`
- `trading_bot/backend/src/services/dexscreener.ts`
- `trading_bot/backend/src/services/market-router.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`
