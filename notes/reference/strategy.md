---
type: reference
status: active
area: strategy
date: 2026-04-12
source_files:
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/engine/exit-engine.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/engine/risk-engine.ts
  - trading_bot/backend/src/services/shared-token-facts.ts
  - trading_bot/backend/src/services/strategy-exit.ts
  - trading_bot/backend/src/services/strategy-presets.ts
  - trading_bot/backend/src/services/helius-migration-watcher.ts
graph_checked: 2026-04-12
next_action:
---

# Graduation Strategy

Purpose: describe the actual graduation-trading lifecycle in code, including the parts that are easy to misread from the UI.

This repo runs one graduation-trading thesis, with two selectable runtime presets:

- `FIRST_MINUTE_POSTGRAD_CONTINUATION`
- `LATE_CURVE_MIGRATION_SNIPE`

`LIVE` and `DRY_RUN` can point at different presets through `settings.strategy.*`.

Use graduation language in repo-facing docs. Keep the preset ids below unchanged because code, env validation, and persisted data already depend on them.

## Runtime Lanes

- Live discovery lane: [`GraduationEngine.discover()`](../../trading_bot/backend/src/engine/graduation-engine.ts)
- Live evaluation lane: [`GraduationEngine.evaluateDueCandidates()`](../../trading_bot/backend/src/engine/graduation-engine.ts)
- Live exit lane: [`ExitEngine.run()`](../../trading_bot/backend/src/engine/exit-engine.ts)
- Scheduler and manual triggers: [`BotRuntime`](../../trading_bot/backend/src/engine/runtime.ts)

Runtime pacing matters now:

- discovery runs faster during configured US hours and slower off-hours
- evaluation runs at the active pace while the queue exists, then backs off to the idle pace when the queue is empty
- exit checks stay on their own cadence
- Birdeye spend is lane-budgeted across discovery, evaluation, security, and reserve instead of assuming the month will sort itself out
- `LIVE` owns the recurring discovery, evaluation, and exit loops
- A backend boot into `LIVE` now starts in a startup hold. Exit protection can still arm, but discovery and evaluation do not begin until the operator explicitly resumes from the dashboard.
- `DRY_RUN` is now just a safe non-live runtime mode inside the app; repo-supported dry-run discovery experiments live in `trading_bot/backend/scripts/discovery-lab.ts`

## Live Candidate Lifecycle

- Discovery writes new rows as `DISCOVERED`
- Evaluation only pulls candidates in `DISCOVERED`, `SKIPPED`, or `ERROR` whose `scheduledEvaluationAt <= now`
- Capacity pressure and manual pause now actively write `SKIPPED` and reschedule candidates instead of burning them permanently
- Successful evaluation marks a candidate `ACCEPTED`, then `ExecutionEngine.openPosition()` immediately moves it to `BOUGHT`
- Full exit updates linked candidates to `EXITED`
- Candidates are no longer globally one-mint-and-done. The runtime now dedupes only active candidate rows so the same mint can be revisited later under a different preset or after the previous lifecycle is finished.
- Each candidate and position now records `strategyPresetId`, and live or research entries persist the preset-specific discovery recipe name used to find the token.

## Discovery Contract

- Discovery recipe depends on the active preset:
  - `FIRST_MINUTE_POSTGRAD_CONTINUATION`: graduated names ranked by `trade_1m_count` inside the first ten minutes after graduation
  - `LATE_CURVE_MIGRATION_SNIPE`: near-graduation names ranked by `trade_1m_count` once progress is at least `98.5%`
- `DISCOVERY_SOURCES="pump_dot_fun"` keeps live discovery aligned with the current pump-only tradable desk by default
- You can still widen discovery with `DISCOVERY_SOURCES="all"` or a venue list when the desk is intentionally researching or papering non-pump venues
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
  - a shared discovery cache write into `SharedTokenFact` so later evaluation and the other preset can reuse the same Birdeye baseline instead of re-paying for it immediately

## Evaluation Contract

Important nuance: evaluation now checks capacity before spending provider units, due candidates are ranked by a freshness, liquidity, and momentum priority score instead of raw FIFO order, and the lane is Birdeye-budget aware before it spends detail, trade-data, or security units. Fresh `SharedTokenFact` rows now collapse those cache reads into one lookup per mint, and projected Birdeye spend only charges stale detail, trade-data, or security reads instead of pretending cached facts still cost live units. Ranked candidates are then processed one by one rather than blasting all provider calls in parallel, because Lite-plan burst discipline matters more than theoretical loop throughput on a `$100` desk.

Evaluation then applies these gates:

1. Strategy-mode confirmation
  - continuation preset requires confirmed graduation
  - migration-snipe preset requires a pre-grad token still under the curve and already above the late-progress floor
2. Graduation age `<= maxGraduationAgeSeconds` for the continuation preset only
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
11. Shared facts are reused when still fresh:
  - Birdeye detail
  - Birdeye trade data
  - Birdeye token security
  - Helius mint authorities
  - Helius holder concentration
  - cache freshness now reduces projected Birdeye lane burn before evaluation asks for budget permission

Scoring contract:

- ranking weight is `35%` momentum, `35%` structure, `30%` liquidity and exitability
- accepted candidates persist the same score family the runtime used to prioritize them
- score also drives both adaptive position sizing and exit-profile selection
- preset-specific entry ceilings matter:
  continuation now keeps a `5,000,000` market-cap cap
  late-curve research now keeps a `7,000,000` market-cap cap

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
- Live execution metadata now records a timing bundle for each onchain buy or sell, including quote, swap-build, sender-build, broadcast-and-confirm, and settlement-read latency so operator review can compare entry and exit execution speed by fill reason.
- Live fill metadata now also stores quoted-vs-actual execution output and `executionSlippageBps`, and manual discovery-lab entries persist report-age timing (`discoveryLabReportAgeMsAtEntry`, `discoveryLabRunAgeMsAtEntry`) so fill analytics can separate execution latency from stale-decision delay.
- Discovery-lab results can now promote a pass-grade token into a manual entry in either runtime mode. That path creates a linked `Candidate`, opens the `Position` through the same execution engine the automatic lane uses, stores the manual entry origin plus discovery-lab context in metadata, and keeps the position inside the normal open-position counts and workbench.
- Research mock buys are written to dedicated research tables and never touch `BotState.cashUsd` or `BotState.realizedPnlUsd`
- The continuation preset can optionally arm a Helius `logsSubscribe` watcher. When a watched migration program emits a signal and the preset is active in `LIVE`, the runtime immediately runs another discovery sweep instead of waiting for the next scheduled loop.

Pause semantics matter:

- `pause` does not stop the scheduler loops
- Due candidates evaluated while paused are rescheduled as `SKIPPED`
- `resume` clears `pauseReason`, and rescheduled candidates can become due again automatically
- The startup hold is a special pause reason for `LIVE` boots. It exists to prevent automatic live trading after a restart, and the first dashboard resume is what arms live discovery and evaluation.

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

Manual discovery-lab entries use the same exit-plan contract as automatic buys. After a manual entry lands, the runtime immediately refreshes exit monitoring so the new position is priced and managed without waiting for the next scheduled sweep.

Exit tuning is now score-aware:

- lower-score entries get the scalp profile: earlier TP1, tighter time-stop, tighter trailing logic
- mid-score entries use the balanced profile
- higher-score entries get the runner profile: smaller early trims, wider trail, and more time to work
- the derived exit plan is stored in `Position.metadata.exitPlan` and used by the exit lane instead of treating every name the same
- preset-specific exit bases are applied before score shaping, so the late-curve snipe stays shorter and more defensive while the continuation preset gets slightly more room without giving up the `2x` cash-out target
- profile timing is monotonic again even under the fast-turn presets:
  scalp time-stop and hard-limit stay shorter than balanced
  runner stays longer than both
- Discovery-lab run completion now computes a calibrated live strategy pack (`strategy.liveStrategy`). Exit overrides and capital modifier now derive from winner score, winner 5m volume, and winner time-since-graduation freshness; this is the primary operator path for live-strategy tuning.
- Runtime uses the calibrated pack when `strategy.liveStrategy.enabled` is true:
  - discovery recipes and sources come from the calibrated pack
  - filters and exits are overlaid from calibrated overrides
  - planned live ticket size is multiplied by `capitalModifierPercent / 100`

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
- `strategy.*`
- `research.*`
- `filters.*`
- `exits.*`

Runtime cadence nuance:

- `discoveryIntervalMs` is the US-hours discovery pace
- `offHoursDiscoveryIntervalMs` is the slower off-hours discovery pace
- `evaluationIntervalMs` is used while candidates are queued
- `idleEvaluationIntervalMs` is used when the queue is empty
