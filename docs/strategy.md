# S2 Strategy

Purpose: describe the actual S2 lifecycle in code, including the parts that are easy to misread from the UI.

This repo runs one strategy: S2 graduation.

## Runtime Lanes

- Discovery lane: [`GraduationEngine.discover()`](../trading_bot/backend/src/engine/graduation-engine.ts)
- Evaluation lane: [`GraduationEngine.evaluateDueCandidates()`](../trading_bot/backend/src/engine/graduation-engine.ts)
- Exit lane: [`ExitEngine.run()`](../trading_bot/backend/src/engine/exit-engine.ts)
- Scheduler and manual triggers: [`BotRuntime`](../trading_bot/backend/src/engine/runtime.ts)

## Candidate Lifecycle

- Discovery writes new rows as `DISCOVERED`
- Evaluation only pulls candidates in `DISCOVERED`, `SKIPPED`, or `ERROR` whose `scheduledEvaluationAt <= now`
- Current code does not actively write `SKIPPED`; it is only part of the due-status allowlist
- Successful evaluation marks a candidate `ACCEPTED`, then `openDryRunPosition()` immediately moves it to `BOUGHT`
- Full exit updates linked candidates to `EXITED`

## Discovery Contract

- Discovery source is Birdeye graduated meme tokens
- Lookback window is `now - DISCOVERY_LOOKBACK_SECONDS`
- Discovery request size is `evaluationConcurrency * 20`
- Duplicate mints are ignored before insert
- Each new candidate gets:
  - `status = DISCOVERED`
  - `scheduledEvaluationAt = now + entryDelayMs`
  - raw discovery payload in `Candidate.metrics`
  - normalized discovery evidence in `TokenSnapshot` with `trigger = "discovery"`

## Evaluation Contract

Important nuance: capacity is fetched in parallel with the first Birdeye and Helius calls. A candidate that is going to fail risk capacity can still spend provider units before the reject is recorded.

Evaluation then applies these gates:

1. Capacity from `RiskEngine`
2. Graduated token confirmation
3. Graduation age `<= maxGraduationAgeSeconds`
4. Liquidity floor, market-cap ceiling, holder floor
5. Trade-data floor checks:
   - `volume5mUsd >= minVolume5mUsd`
   - `uniqueWallets5m >= minUniqueBuyers5m`
   - `buySellRatio >= minBuySellRatio`
   - `priceChange5mPercent > -maxNegativePriceChange5mPercent`
6. Mint authority and freeze authority must both be inactive
7. Holder concentration:
   - `top10Percent <= maxTop10HolderPercent`
   - `largestHolderPercent <= maxSingleHolderPercent`
8. Deep security only when either condition is true:
   - `liquidityUsd >= securityCheckMinLiquidityUsd`
   - `volume5mUsd >= minVolume5mUsd * securityCheckVolumeMultiplier`
9. Deep security rejects on fake token, honeypot, freezeable token, mintable token, or transfer fee above `maxTransferFeePercent`
10. Entry price must still be available

Persistence on evaluation:

- Reject path writes `Candidate.status = REJECTED`, `rejectReason`, updated denormalized filter state, and `TokenSnapshot` with `trigger = "evaluation_reject"`
- Accept path writes `TokenSnapshot` with `trigger = "evaluation_accept"`, then updates the candidate and opens a dry-run position

## Risk And Entry Contract

- Entry sizing comes from [`RiskEngine`](../trading_bot/backend/src/engine/risk-engine.ts), not from ad hoc math in strategy code
- `LIVE` is always blocked with the explicit reason that no swap-routing adapter exists
- Capacity also blocks on:
  - `pauseReason` being set
  - `maxOpenPositions` reached
  - no dry-run capital left
- `ExecutionEngine.openDryRunPosition()` rechecks capacity inside a transaction, decrements `BotState.cashUsd`, creates the `Position`, creates the `BUY` fill, updates the candidate, and writes a `trade_buy` snapshot

Pause semantics matter:

- `pause` does not stop the scheduler loops
- Due candidates evaluated while paused are rejected with the pause reason because risk capacity fails
- `resume` only clears `pauseReason`; it does not resurrect candidates already rejected during the pause

## Exit Contract

`ExitEngine.run()` prices every open position through Birdeye, updates the running peak, and then applies exits in this order:

1. stop loss before any partials
2. TP1 partial sell using `tp1SellFraction`
3. TP2 partial sell using `tp2SellFraction`
4. post-TP1 retrace full close before TP2
5. trailing stop only after TP2
6. time stop after `timeStopMinutes` if return is below `timeStopMinReturnPercent`
7. hard time limit after `timeLimitMinutes`

Every sell writes a `SELL` fill, updates remaining size and TP flags, increments `BotState.cashUsd` and `realizedPnlUsd`, and writes a `trade_sell` snapshot.

## Settings That Change Behavior

- `cadence.discoveryIntervalMs`
- `cadence.evaluationIntervalMs`
- `cadence.exitIntervalMs`
- `cadence.entryDelayMs`
- `cadence.evaluationConcurrency`
- `capital.*`
- `filters.*`
- `exits.*`
