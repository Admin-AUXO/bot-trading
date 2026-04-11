---
type: session
status: open
area: strategy/providers/runtime
date: 2026-04-11
source_files:
  - trading_bot/backend/src/config/env.ts
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/.env.example
  - resources/birdeye_meme_list.md
  - notes/reference/strategy.md
  - notes/reference/prisma-and-views.md
graph_checked: 2026-04-11
next_action: Keep holder-concentration guardrails intact for now; if more throughput is needed, inspect fresh pump-only dry runs for recurring reject reasons before relaxing another threshold.
---

# Session - Entry Discovery Optimization Handoff

## Context

The user asked for three things at once:

1. Check the live Postgres state.
2. Improve entry config so the bot finds better tradable tokens.
3. Improve how the repo uses Birdeye meme-list discovery, while respecting that the endpoint costs `100` compute units per call.

This work happened immediately after the earlier dry-run failure fix.

## What Changed

- Fixed research discovery starvation by widening the environment default discovery lookback:
  `DISCOVERY_LOOKBACK_SECONDS` now defaults to `3600` in `backend/src/config/env.ts` and `backend/.env.example`
- Widened the matching strategy age gate default:
  `MAX_GRADUATION_AGE_SECONDS` now defaults to `3600` in `backend/src/config/env.ts` and `backend/.env.example`
- Changed research discovery to query tradable sources instead of hardcoding `source=all`:
  `GraduationEngine.getResearchDiscoveryTokens()` now calls `fetchDiscoveryTokens(..., "tradable")`
- Promoted the active runtime settings change for the running bot:
  `filters.maxGraduationAgeSeconds` moved from `180` to `3600`
- Rebuilt and restarted the backend container after the code changes

## What I Verified

- Postgres state before the strategy tweak:
  `Candidate=0`
  `ResearchToken=0`
  `ResearchRun=3`
  `ResearchPosition=0`
  `RawApiPayload=2`
- Active runtime settings before promotion were still too narrow:
  `filters.maxGraduationAgeSeconds=180`
- Direct Birdeye meme-list probes showed the actual choke point:
  `all`, `180s`, current floors -> `0` tokens
  `all`, `900s`, current floors -> `1` token
  `pump_dot_fun`, `900s`, current floors -> `1` token
  `pump_dot_fun`, `3600s`, current floors -> `3` tokens
  `all`, `3600s`, current floors -> `7` tokens, but only `2` were `pump_dot_fun`
- That last result matters:
  `source=all` widened the pool, but most of the extra names were `meteora_dynamic_bonding_curve`, which are paper-only under the current tradable-source contract
- The new promoted dry run completed successfully:
  run id `cmntoyei7000207o7dpt6akcq`
  `totalDiscovered=2`
  `totalShortlisted=2`
  `totalEvaluated=2`
  `liveTradablePassed=0`
  `researchTradablePassed=0`
  `birdeyeCalls=3`
  `birdeyeUnitsUsed=130`
  `heliusCalls=2`
  `heliusUnitsUsed=2`

## Current Diagnosis

The repo no longer has a discovery-window problem as the primary blocker.

The current blocker moved downstream into evaluation:

- `MarsCoin`
  `strategyRejectReason = buy/sell ratio collapsed`
  observed `buySellRatio = 1.094`
  current floor `minBuySellRatio = 1.7`
- `DoubleT`
  `strategyRejectReason = unique buyers far below floor`
  observed `uniqueWallets5m = 17`
  current floor `minUniqueBuyers5m = 50`

Other useful context from the same run:

- Both names were already `liveTradable=true`
- Holder count, liquidity, and 5m volume were not the main discovery bottlenecks anymore
- `DoubleT` also sat right on the edge of the 5m volume floor in detailed trade data, so if unique-buyer pressure is lowered too aggressively it may still fail on a second soft weakness

## CU Warning

Birdeye meme-list is expensive:

- The endpoint costs `100` CU per call
- The direct shell probes used during this investigation are not recorded in the app's `ApiEvent` table, but they still burn real Birdeye credits
- Do not spray hypothesis-free probes at this endpoint
- Use one targeted query per question, then inspect the returned candidate set deeply before trying another shape

## Recommended Next Steps

1. Keep the new discovery baseline:
   `DISCOVERY_LOOKBACK_SECONDS=3600`
   `filters.maxGraduationAgeSeconds=3600`
   research discovery using tradable sources
2. Do the next filter experiments through the runtime draft flow, one variable at a time
3. After each experiment, run exactly one bounded research dry run and inspect `ResearchToken.strategyRejectReason` before changing anything else
4. Only update `notes/reference/strategy.md` after the final filter set is chosen, not while the thresholds are still moving

## Filter Experiments To Try Next

### First experiment

- Lower `filters.minBuySellRatio` from `1.7` to `1.3`

Why:

- In code, buy/sell ratio is a catastrophic reject only when it drops below `minBuySellRatio * 0.7`
- At the current `1.7` floor, catastrophic cutoff is `1.19`
- `MarsCoin` at `1.094` gets killed immediately
- At `1.3`, catastrophic cutoff becomes `0.91`, so `MarsCoin` should move from a hard fail to at worst a soft issue

### Second experiment

- Lower `filters.minUniqueBuyers5m` from `50` to `25`

Why:

- In code, unique buyers become catastrophic below `minUniqueBuyers5m * 0.65`
- At `50`, catastrophic cutoff is `32.5`
- `DoubleT` at `17` gets killed immediately
- At `25`, catastrophic cutoff becomes `16.25`, so `DoubleT` should downgrade from a hard fail to a soft issue

### Third experiment only if needed

- Lower `filters.minVolume5mUsd` from `2000` to `1500`

Why:

- `DoubleT` was very close to the current floor in deep trade data
- This should be a follow-up experiment, not the first move
- Liquidity and raw discovery flow already improved without relaxing this threshold, so do not touch it unless token-level evidence still shows volume as the remaining blocker

## Research Questions For The Next Agent

- Is `buySellRatio` the right momentum proxy for pump graduates, or is it too fragile during the immediate post-graduation churn window?
- Should the discovery query use `min_last_trade_unix_time` or `min_recent_listing_time` instead of relying only on a widened `min_graduated_time` window?
- Does `sort_by=last_trade_unix_time` meaningfully improve the quality mix once the lookback window is `3600s+`, or does the later cheap-score ranking already make that unnecessary?
- Should `source=all` remain the live discovery default while `TRADABLE_SOURCES` stays `pump_dot_fun`, or is that just paying CU to manufacture paper-only work?
- Why are successful direct meme-list runs not showing up in `RawApiPayload` while failed ones do? Confirm whether this is expected retention behavior, a capture flag interaction, or a bug

## Commands / Queries Worth Reusing

- Current control state:
  `curl -sS 'http://127.0.0.1:3100/api/settings/control'`
- Promote a draft after validation:
  `POST /api/settings/draft`
  `POST /api/settings/dry-run`
  `POST /api/settings/promote`
- Launch one bounded research cycle:
  `curl -sS -X POST http://127.0.0.1:3100/api/control/run-research-dry-run`
- Inspect latest run summaries:
  `curl -sS 'http://127.0.0.1:3101/api/research-runs?limit=5'`
- Inspect token-level outcomes for one run:
  `curl -sS 'http://127.0.0.1:3101/api/research-runs/<run-id>/tokens'`
- Inspect persisted research-token rejects directly:
  `docker exec trading-postgres psql -U botuser -d trading_bot -P pager=off -c "select symbol, source, \"strategyRejectReason\", \"cheapScore\" from \"ResearchToken\" where \"runId\" = '<run-id>' order by symbol;"`

## Risks / Unknowns

- The current handoff stops before trying the buy/sell-ratio and unique-buyer threshold experiments
- No docs were updated yet for the new `3600s` baseline or tradable-source research discovery, because the final filter set is still unsettled
- Direct Birdeye sampling already burned real CU outside the app telemetry, so the next agent should avoid broad exploratory query matrices

## 2026-04-11 Follow-Up

### What Changed

- Lowered the repo default live discovery source to `DISCOVERY_SOURCES="pump_dot_fun"` in:
  `trading_bot/backend/src/config/env.ts`
  `trading_bot/backend/.env.example`
- Lowered the repo default trade filters to:
  `MIN_BUY_SELL_RATIO=1.3`
  `MIN_UNIQUE_BUYERS_5M=25`
- Promoted the same runtime settings through the control flow:
  `filters.minBuySellRatio=1.3`
  `filters.minUniqueBuyers5m=25`
- Fixed the repo Postgres MCP DSN in `.codex/config.toml` to the actual Compose bind:
  `postgresql://botuser:botpass@127.0.0.1:56432/trading_bot`
- Tightened Compose Postgres exposure to localhost-only in `trading_bot/docker-compose.yml`:
  `127.0.0.1:${POSTGRES_PORT:-56432}:5432`
- Updated the Docker and strategy reference notes so they match the current runtime contract
- Rebuilt the Compose stack after the config and Compose changes

### Online Research And Live Probe Findings

- Birdeye official docs on 2026-04-11 confirmed that `GET /defi/v3/token/meme/list` supports:
  `source`
  `sort_by=last_trade_unix_time`
  `min_last_trade_unix_time`
  `min_recent_listing_time`
  `min_holder`
  `min_volume_5m_usd`
- Birdeye’s 2026-02-10 changelog confirms 1m, 5m, and 30m intervals were added to meme-list sorting and filtering
- Targeted live probes with the current desk floors showed:
  `source=all`, `graduated_time`, 1h lookback -> `8` names
  `source=pump_dot_fun`, `graduated_time`, 1h lookback -> `2` names
  `source=pump_dot_fun`, `last_trade_unix_time`, same floors -> `1` name
- Conclusion:
  switching live discovery to `pump_dot_fun` reduces paper-only noise for a pump-only tradable desk
  `last_trade_unix_time` did not improve throughput enough to justify a code-path change in this pass

### Verification

- Draft review passed:
  `changedPaths=["filters.minUniqueBuyers5m","filters.minBuySellRatio"]`
  `safeToPromote=true`
- Promoted runtime settings are active after rebuild:
  `filters.minBuySellRatio=1.3`
  `filters.minUniqueBuyers5m=25`
- Latest bounded research run:
  run id `cmntpi2gg000007mtlqa6sjvs`
  `totalDiscovered=1`
  `totalShortlisted=1`
  `totalEvaluated=1`
  `totalStrategyPassed=0`
  `birdeyeUnitsUsed=115`
  `heliusUnitsUsed=2`
- Token-level result:
  `MOTHER`
  `strategyRejectReason = top10 concentration far too high`
  `top10HolderPercent = 47.26`
  `largestHolderPercent = 27.40`
  `buySellRatio = 1.04`
  `uniqueWallets5m = 77`

### Updated Diagnosis

- The relaxed momentum and participation filters are no longer the immediate blocker on the latest pump-only run
- The remaining blocker moved to holder concentration, which is a materially different risk class than weak short-window flow
- Do not relax `maxTop10HolderPercent` or `maxSingleHolderPercent` without a separate safety review and repeated evidence that concentration rejects are dominating otherwise-healthy names

## Durable Notes Updated

- `notes/sessions/index.md`
- `notes/sessions/2026-04-11-entry-discovery-optimization-handoff.md`
