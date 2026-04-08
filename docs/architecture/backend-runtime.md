# Backend Runtime

The backend is assembled in one place. Start here before touching strategy, API, or lifecycle behavior.

## Primary Files

- `trading_bot/backend/src/index.ts`
- `trading_bot/backend/src/bootstrap/runtime.ts`
- `trading_bot/backend/src/bootstrap/intervals.ts`
- `trading_bot/backend/src/api/server.ts`

## Startup Order

1. Load env-backed config from `backend/src/config/index.ts`.
2. Build core services in `bootstrap/runtime.ts`:
   `PositionTracker`, `RegimeDetector`, `ConfigProfileManager`, `RiskManager`, `ApiBudgetManager`.
3. Load profiles, resolve runtime scope, then load persisted risk/quota state.
4. Build provider clients:
   `HeliusService`, `BirdeyeService`, `JupiterService`, `DexScreenerService`, `MarketRouter`.
5. Pick the executor by `TRADE_MODE`:
   `TradeExecutor` for `LIVE`, `DryRunExecutor` for `DRY_RUN`.
6. Build `ExitMonitor`, `OutcomeTracker`, `MarketTickRecorder`, and strategies `S1`, `S2`, `S3`.
7. Reload open positions for the active runtime lane and re-arm exits.
8. Start regime evaluation, reconcile wallet capital when a wallet is configured, and start strategies.
9. Start the Express API server.
10. Register periodic intervals for resets, quota sync, persistence, wallet reconciliation, wallet scoring, stats aggregation, and backfills.

## Runtime Invariants

- Runtime scope lives in `runtimeState.scope` and drives API/control truth.
- `DRY_RUN` still writes trades, positions, signals, and analytics rows.
- `Signal.detectedAt` is first-seen time. Execution timing now lives in `Signal.metadata`, `Trade.metadata`, and `Position.entryLatencyMs`.
- Position sizing comes from `RiskManager`, not config constants.
- S1 wallet scoring can bootstrap in the background; API startup must not block on it.
- Wallet-backed capital snapshots are separate from the dry-run in-memory risk ledger.
- Profile switching for the active mode pauses the bot, reloads scope/config, reloads open positions, and restarts runtime services.
- Wallet reconciliation runs when a wallet is configured; `LIVE` also persists wallet balance.
- Risk persistence is `LIVE`-only. `DRY_RUN` runtime truth stays in memory for the process lifetime.

## Periodic Work

- regime refresh: Jupiter SOL price plus `MarketRouter` breadth sample
- daily reset check: `RiskManager.checkDailyReset()`
- state persistence: risk state and quota state
- quota sync: provider-reported Birdeye usage
- wallet reconciliation: conditional on `SOLANA_PUBLIC_KEY`
- wallet scoring: S1 maintenance task, skipped when Helius non-essential work should degrade
- S2 catch-up scan: plan-aware Birdeye recovery loop
- stats aggregation: hourly daily-stats recompute
- outcome price backfills: router-backed price refresh
- exit monitor batch: router-backed refresh on the configured batch interval
- would-have-won backfill: DB-only recompute pass

## Timing Notes

- S2 waits `entryDelayMinutes` after graduation detection before it can buy.
- S3 only finds new candidates on its scan cadence, then schedules tranche 2 on a fixed follow-on delay.
- Exit decisions are bounded by the exit-monitor batch interval (`5s` in current config).

## Jupiter Notes

- Quotes and swaps now target the env-backed `api.jup.ag` host.
- `JupiterService` exposes batch price reads through Price API V3 and category wrappers for `toptrending`, `toptraded`, and `recent`.
- Trade execution still goes through `JupiterService`; callers should not build raw Jupiter URLs.

## Shutdown

Shutdown stops strategies, exit monitoring, regime detector, outcome tracker, market tick recorder, stats worker, Helius connections, intervals, and DB access. State is persisted before exit.

## Change Rules

- runtime scope changes -> update `workflows/profiles-and-runtime-scope.md`
- control/auth changes -> update `workflows/control-and-auth.md`
- provider budgeting changes -> update `workflows/quota-and-provider-budgets.md`
