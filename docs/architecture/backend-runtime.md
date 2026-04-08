# Backend Runtime

The backend is assembled in one place. Start there before touching strategy, API, or lifecycle behavior.

## Primary Files

- `trading_bot/backend/src/index.ts`
- `trading_bot/backend/src/bootstrap/runtime.ts`
- `trading_bot/backend/src/bootstrap/intervals.ts`
- `trading_bot/backend/src/api/server.ts`

## Startup Order

1. Load env-backed config from `backend/src/config/index.ts`.
2. Build core runtime services in `bootstrap/runtime.ts`:
   `PositionTracker`, `RegimeDetector`, `ConfigProfileManager`, `RiskManager`, `ApiBudgetManager`.
3. Load profiles, resolve the active runtime scope, then load persisted risk/quota state.
4. Create shared provider clients:
   `HeliusService`, `BirdeyeService`, `JupiterService`, `DexScreenerService`, `MarketRouter`.
   Jupiter now reads `JUPITER_API_KEY`, `JUPITER_BASE_URL`, `JUPITER_PRICE_PATH`, and `JUPITER_SWAP_PATH` from `backend/src/config/index.ts`.
   LIVE swap execution signs Jupiter swap instructions locally, adds a rotating Sender tip transfer only when Sender endpoints are configured, and submits through ordered Helius Sender endpoints before falling back to generic RPC sending.
5. Pick the executor by `TRADE_MODE`:
   `TradeExecutor` for `LIVE`, `DryRunExecutor` for `DRY_RUN`.
6. Create `ExitMonitor`, `OutcomeTracker`, `MarketTickRecorder`, and strategies `S1`, `S2`, `S3`.
   `ExitMonitor`, `OutcomeTracker`, `MarketTickRecorder`, `S1` wallet-activity pricing, `S2` recent-seed discovery, and `S3` discovery now read routed price, breadth, or seed data through `MarketRouter`.
7. Load open positions for the active runtime lane and re-arm exit monitoring.
8. Start regime evaluation, reconcile wallet balance in `LIVE`, and start strategies.
9. Start the Express API server.
10. Register periodic intervals for regime updates, daily reset checks, risk/quota persistence, wallet scoring, daily stats aggregation, and would-have-won backfill.

## Runtime Invariants

- Runtime scope lives in `runtimeState.scope` and drives API/control truth.
- `DRY_RUN` still writes trades, positions, signals, and analytics rows; it just uses the dry-run executor.
- Signals should persist the first-seen time in `Signal.detectedAt`; entry and exit execution timing now rides in `Signal.metadata`, `Trade.metadata`, and `Position.entryLatencyMs`.
- Strategy position sizes come from `RiskManager`, not directly from config constants.
- S1 wallet scoring can bootstrap in the background when no elite wallets are cached; API startup must not wait on that remote scoring pass.
- Wallet-backed capital snapshots are refreshed from Helius + SOL spot in any mode when a wallet address is configured. That wallet view is separate from the dry-run risk ledger, which still tracks simulated spend and P&L in memory.
- Profile switching for the active mode pauses the bot, stops strategies, reloads scope/config, reloads open positions, and restarts the runtime.
- Failed runtime profile switches can leave the switch pause reason in place. Read the switch path before "simplifying" it.
- Wallet reconciliation exists only in `LIVE`.
- Risk persistence is `LIVE`-only. `DRY_RUN` runtime truth stays in memory for the process lifetime.

## Periodic Work

- Regime refresh: Jupiter SOL price + `MarketRouter` breadth sample
- Daily reset check: `RiskManager.checkDailyReset()`
- State persistence: risk state + quota state
- Quota sync: provider-reported Birdeye credits usage
- Wallet scoring: S1-only maintenance task, skipped when Helius non-essential budget should degrade
- S2 catch-up scan: plan-aware Birdeye `meme/list` recovery loop; `new_listing` fallback is now feature-flagged
- Stats aggregation: hourly daily-stats recompute
- Outcome price backfills: router-backed price refresh, no longer tied to Birdeye `multi_price`
- Exit fast path: router-backed price refresh every `5s`; Jupiter batch first, then throttled quote/Birdeye slow paths only when price data is missing
- Would-have-won backfill: DB-only recompute pass, no provider quota gate

## Timing Audit Notes

- S2 intentionally waits `entryDelayMinutes` before it even considers a buy after graduation detection.
- S3 can only discover a new candidate on its scan cadence, then schedules tranche 2 on its fixed follow-on delay.
- Exit decisions are bounded by the `5s` exit monitor batch interval on the fast path.
- S3 fade exits additionally require two weak reads and may wait on the Birdeye trade-data slow-path refresh interval when router prices are not enough.

## Jupiter Notes

- Quote and swap execution now target the env-backed `api.jup.ag` host instead of the legacy `quote-api.jup.ag` and `price.jup.ag` URLs.
- `JupiterService` exposes batch price reads through Price API V3 and token-category wrappers for `toptrending`, `toptraded`, and `recent`.
- Trade execution still calls `getQuote()` and `buildSwapTransaction()` through the same service surface; callers outside `JupiterService` should not build raw Jupiter URLs.

## Shutdown

Shutdown stops strategies, exit monitoring, regime detector, outcome tracker, market tick recorder, stats worker, provider connections, intervals, and DB access. State is persisted before exit.

## Change Rules

- If runtime scope behavior changes, update:
  `workflows/profiles-and-runtime-scope.md`
- If control/auth behavior changes, update:
  `workflows/control-and-auth.md`
- If provider budgeting changes, update:
  `workflows/quota-and-provider-budgets.md`
