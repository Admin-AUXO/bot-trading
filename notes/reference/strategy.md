---
type: reference
status: active
area: strategy
date: 2026-04-10
source_files:
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/engine/research-dry-run-engine.ts
  - trading_bot/backend/src/engine/exit-engine.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/engine/risk-engine.ts
graph_checked:
next_action:
---

# S2 Strategy

Purpose: describe the actual S2 lifecycle in code, including the parts that are easy to misread from the UI.

This repo runs one strategy: S2 graduation.

## Runtime Lanes

- Live discovery lane: [`GraduationEngine.discover()`](../../trading_bot/backend/src/engine/graduation-engine.ts)
- Live evaluation lane: [`GraduationEngine.evaluateDueCandidates()`](../../trading_bot/backend/src/engine/graduation-engine.ts)
- Live exit lane: [`ExitEngine.run()`](../../trading_bot/backend/src/engine/exit-engine.ts)
- Bounded research dry-run lane: [`ResearchDryRunEngine`](../../trading_bot/backend/src/engine/research-dry-run-engine.ts)
- Scheduler and manual triggers: [`BotRuntime`](../../trading_bot/backend/src/engine/runtime.ts)

Runtime pacing matters now:

- discovery runs faster during configured US hours and slower off-hours
- evaluation runs at the active pace while the queue exists, then backs off to the idle pace when the queue is empty
- exit checks stay on their own cadence
- Birdeye spend is lane-budgeted across discovery, evaluation, security, and reserve instead of assuming the month will sort itself out
- `LIVE` owns the recurring discovery, evaluation, and exit loops
- `DRY_RUN` no longer runs those loops at all; it waits for a manual research run, then only keeps the research polling timer alive until the bounded run completes or times out

## Live Candidate Lifecycle

- Discovery writes new rows as `DISCOVERED`
- Evaluation only pulls candidates in `DISCOVERED`, `SKIPPED`, or `ERROR` whose `scheduledEvaluationAt <= now`
- Capacity pressure and manual pause now actively write `SKIPPED` and reschedule candidates instead of burning them permanently
- Successful evaluation marks a candidate `ACCEPTED`, then `ExecutionEngine.openPosition()` immediately moves it to `BOUGHT`
- Full exit updates linked candidates to `EXITED`

## Discovery Contract

- Discovery source is Birdeye graduated meme tokens
- `DISCOVERY_SOURCES="all"` pulls all Birdeye meme-list venues in one scan by default
- `TRADABLE_SOURCES="pump_dot_fun"` keeps non-pump venues in paper-only mode unless you explicitly widen it
- Discovery is budget-aware. If the projected Birdeye discovery lane would outrun the monthly Lite pacing target, the loop skips that sweep instead of spending through the cap.
- Lookback window is `now - DISCOVERY_LOOKBACK_SECONDS`
- Live discovery request size is `evaluationConcurrency * 20`
- Duplicate mints are ignored before insert
- Each new candidate gets:
  - `status = DISCOVERED`
  - `scheduledEvaluationAt = now + entryDelayMs`
  - raw discovery payload in `Candidate.metrics`
  - normalized discovery evidence in `TokenSnapshot` with `trigger = "discovery"`

## Research Dry-Run Contract

- `DRY_RUN` is a bounded research lane, not a rolling paper bot
- Research starts only from the manual `run-research-dry-run` control
- Discovery is one Birdeye meme-list page with `source=all`, capped by `research.discoveryLimit`
- Research discovery does not dedupe against operational `Candidate` history; repeated runs on the same mint are allowed and isolated by `ResearchRun`
- The page is cheap-scored first across all discovered names
- Full deep evaluation only runs on the top `research.fullEvaluationLimit`
- Research stores both `liveTradable` and `researchTradable` on each `ResearchToken`
- Research mock entries ignore desk cash, `maxOpenPositions`, daily-loss guards, and consecutive-loss guards
- Research mock sizing is fixed by `research.fixedPositionSizeUsd`
- Research mock entries are capped by `research.maxMockPositions`
- Provider spend is capped per run with `research.birdeyeUnitCap` and `research.heliusUnitCap`
- Research polling cadence is `research.pollIntervalMs`
- Research max run window is `research.maxRunDurationMs`
- When the run window expires, any still-open research positions force-close using their last seen cached price
- Research rows live in dedicated `ResearchRun`, `ResearchToken`, `ResearchPosition`, and `ResearchFill` tables instead of polluting the operational candidate and position lifecycle

## Evaluation Contract

Important nuance: evaluation now checks capacity before spending provider units, due candidates are ranked by a freshness, liquidity, and momentum priority score instead of raw FIFO order, and the lane is Birdeye-budget aware before it spends detail, trade-data, or security units. Ranked candidates are then processed one by one rather than blasting all provider calls in parallel, because Lite-plan burst discipline matters more than theoretical loop throughput on a `$100` desk.

Evaluation then applies these gates:

1. Graduated token confirmation
2. Graduation age `<= maxGraduationAgeSeconds`
3. Cheap filter pass:
   - catastrophic misses still reject immediately
   - single soft misses are tolerated
   - two soft weaknesses reject the candidate before deep security spend
4. Cheap filter dimensions:
   - liquidity floor and market-cap ceiling
   - holder floor
   - `volume5mUsd`
   - `uniqueWallets5m`
   - `buySellRatio`
   - `priceChange5mPercent`
5. Mint authority and freeze authority must both be inactive
6. Holder concentration:
   - `top10Percent <= maxTop10HolderPercent`
   - `largestHolderPercent <= maxSingleHolderPercent`
7. Deep security on every cheap-filter survivor
8. Deep security rejects on fake token, honeypot, freezeable token, mintable token, or transfer fee above `maxTransferFeePercent`
9. Entry price must still be available
10. Accepted candidates persist `entryScore` plus the derived exit profile (`scalp`, `balanced`, or `runner`) into position metadata

Scoring contract:

- ranking weight is `35%` momentum, `35%` structure, `30%` liquidity and exitability
- accepted candidates persist the same score family the runtime used to prioritize them
- score also drives both adaptive position sizing and exit-profile selection

Persistence on evaluation:

- Reject path writes `Candidate.status = REJECTED`, `rejectReason`, updated denormalized filter state, and `TokenSnapshot` with `trigger = "evaluation_reject"`
- Retryable capacity failures and budget-pacing deferrals write `Candidate.status = SKIPPED` with a new `scheduledEvaluationAt`
- Non-retryable runtime failures write `Candidate.status = ERROR` with a new `scheduledEvaluationAt`
- Candidates from non-tradable venues can still clear the filter stack, but they are persisted as paper-only rejects with `TokenSnapshot.trigger = "evaluation_paper"`
- Accept path writes `TokenSnapshot` with `trigger = "evaluation_accept"`, then updates the candidate and opens a position in `LIVE`
- Research deep evaluation uses the same filter stack, score, and exit-profile derivation, but persists the result onto `ResearchToken` instead of mutating `Candidate`

## Risk And Entry Contract

- Entry sizing comes from [`RiskEngine`](../../trading_bot/backend/src/engine/risk-engine.ts), not from ad hoc math in strategy code
- Entry size is adaptive, not fixed. The desk treats `capital.positionSizeUsd` as the standard cap, scales down toward the `$10-15` floor when score or exposure is weak, and only stretches toward `$30` on high-score setups when exposure is still light.
- Capacity calculation still blocks on cash and slot count, but the approved ticket size now depends on `entryScore` and current exposure instead of blindly using one constant ticket for every graduate.
- `LIVE` is allowed only when the trading wallet and live-routing env are valid
- Capacity also blocks on:
  - `pauseReason` being set
  - `maxOpenPositions` reached
  - no quote capital left in the bot’s internal capital model
  - `DAILY_LOSS_LIMIT_USD` breached for the current trading day
  - `MAX_CONSECUTIVE_LOSSES` breached for the current trading day
- `ExecutionEngine` serializes wallet-affecting actions so overlapping manual triggers and scheduler loops cannot open or close simultaneously
- `LIVE` buys execute onchain first, then persist the fill, `txSignature`, position, and cash update; if persistence fails after a live trade lands, the bot pauses itself for manual intervention
- Research mock buys are written to dedicated research tables and never touch `BotState.cashUsd` or `BotState.realizedPnlUsd`

Pause semantics matter:

- `pause` does not stop the scheduler loops
- Due candidates evaluated while paused are rescheduled as `SKIPPED`
- `resume` clears `pauseReason`, and rescheduled candidates can become due again automatically

## Exit Contract

`ExitEngine.run()` prices live open positions through Birdeye `/defi/multi_price`, updates the running peak, and then applies exits in this order:

1. stop loss before any partials
2. TP1 partial sell using `tp1SellFraction`
3. TP2 partial sell using `tp2SellFraction`
4. post-TP1 retrace full close before TP2
5. trailing stop only after TP2
6. time stop after `timeStopMinutes` if return is below `timeStopMinReturnPercent`
7. hard time limit after `timeLimitMinutes`

Every sell writes a `SELL` fill, updates remaining size and TP flags, increments `BotState.cashUsd` and `realizedPnlUsd`, and writes a `trade_sell` snapshot. Live sells also persist the onchain `txSignature`, and the exit lane tracks in-flight position ids so overlapping checks do not double-trigger the same close. Research mock exits use the shared exit-plan helper, write `ResearchFill` rows instead of `Fill`, and never mutate the operational desk singleton.

Exit tuning is now score-aware:

- lower-score entries get the scalp profile: earlier TP1, tighter time-stop, tighter trailing logic
- mid-score entries use the balanced profile
- higher-score entries get the runner profile: smaller early trims, wider trail, and more time to work
- the derived exit plan is stored in `Position.metadata.exitPlan` and used by the exit lane instead of treating every name the same

Profile thresholds in code:

- `entryScore < 0.62` -> `scalp`
- `0.62 <= entryScore < 0.82` -> `balanced`
- `entryScore >= 0.82` -> `runner`

## Settings That Change Behavior

- `cadence.discoveryIntervalMs`
- `cadence.offHoursDiscoveryIntervalMs`
- `cadence.evaluationIntervalMs`
- `cadence.idleEvaluationIntervalMs`
- `cadence.exitIntervalMs`
- `cadence.entryDelayMs`
- `cadence.evaluationConcurrency`
- `capital.*`
- `research.*`
- `filters.*`
- `exits.*`

Runtime cadence nuance:

- `discoveryIntervalMs` is the US-hours discovery pace
- `offHoursDiscoveryIntervalMs` is the slower off-hours discovery pace
- `evaluationIntervalMs` is used while candidates are queued
- `idleEvaluationIntervalMs` is used when the queue is empty
