# Strategy Overview

The bot has three entry strategies. They share the same safety spine and differ mainly in how they source candidates.

## Shared Execution Path

1. discover candidate
2. fetch market and security context through shared services
3. reject on regime, quota, duplicate exposure, or risk-manager blockers
4. size from `RiskManager`
5. buy through the executor interface
6. hand the open position to `ExitMonitor`

## Shared Safety Rules

- Position sizing comes from `RiskManager`, not raw config constants.
- Existing holdings, open-position limits, gas reserve, loss limits, and pause reasons block entries.
- Paid Birdeye evaluation is gated by remaining global and per-strategy slot capacity.
- The executor is the final duplicate-exposure gate.
- Manual entries may bypass entry filters, but once filled they still attach to `ExitMonitor`.
- Provider traffic must flow through shared services so quota accounting stays intact.
- Discovery and cheap prefilter data should converge through `backend/src/services/market-router.ts`.
- `DRY_RUN` and `LIVE` use the same strategy logic; only the executor changes.
- Partial exits are fractions of remaining token balance, not fractions of original size.

## Strategy Roles

- `S1_COPY`: reacts to elite-wallet buys from Helius websocket activity, then runs cheap router sanity before Birdeye scoring
- `S2_GRADUATION`: scans Jupiter recent seeds plus DEX prefilter, uses Birdeye catch-up for misses, then enters after a delay
- `S3_MOMENTUM`: scans routed Jupiter momentum feeds with DEX prefilter and can stage a second tranche only if follow-through holds

## Enablement And Capital State

- each strategy has an `enabled` flag in runtime config and profile overrides
- disabled strategies do not start their scan or subscription loops
- `RISK_OFF` blocks all new entries
- `HALT` blocks all new entries
- `CRITICAL` allows only `S3`
- `CHOPPY` reduces size and hard-pauses `S1`
- global max open positions default to `5`
- per-strategy caps default to `S1=2`, `S2=2`, `S3=3`

## Source Files

- `trading_bot/backend/src/strategies/copy-trade.ts`
- `trading_bot/backend/src/strategies/graduation.ts`
- `trading_bot/backend/src/strategies/momentum.ts`
- `trading_bot/backend/src/core/risk-manager.ts`
- `trading_bot/backend/src/core/exit-monitor.ts`

## Read Next

- `s1-copy-trade.md`
- `s2-graduation.md`
- `s3-momentum.md`
