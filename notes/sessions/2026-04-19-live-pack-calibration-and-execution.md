---
type: session
status: active
area: backend + strategy + execution + docker
date: 2026-04-19
source_files:
  - trading_bot/backend/.env
  - trading_bot/backend/.env.example
  - trading_bot/backend/src/config/env.ts
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/birdeye-client.ts
  - trading_bot/backend/src/services/execution/quote-builder.ts
  - trading_bot/backend/src/services/execution/swap-builder.ts
  - trading_bot/backend/src/services/live-trade-executor.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/services/session/trading-session-service.ts
  - trading_bot/backend/src/services/token-snapshot-recorder.ts
  - trading_bot/backend/.local/discovery-lab/packs/early-postgrad-10m-liquidity-tape.json
  - trading_bot/backend/.local/discovery-lab/packs/early-postgrad-7m-recent-live.json
  - trading_bot/backend/.local/discovery-lab/packs/early-postgrad-2m-open-burst.json
  - trading_bot/backend/.local/discovery-lab/packs/early-pregrad-95-trade1m-watch.json
  - trading_bot/backend/.local/discovery-lab/packs/early-pregrad-97-5-trade1m-live.json
  - trading_bot/backend/Dockerfile
  - trading_bot/backend/.dockerignore
graph_checked: 2026-04-19
---

# Session - Live Pack Calibration And Execution

## Outcome So Far

- The active live set is now intentionally narrowed to `3` post-grad packs and `2` pre-grad packs, with only those custom pack drafts kept in the Docker image.
- The best fresh evidence still comes from the post-grad lanes. Pre-grad `95%+` / `97.5%+` recipes are useful as scouts but are not producing winners in the current market.
- The live workflow friction has been reduced enough that a session can be started, resumed, evaluated, and manually entered without a graded/deployable-run dependency.
- The remaining live-entry blocker was not pack quality or wallet funding anymore. It was a malformed Jupiter `/swap` payload in `swap-builder.ts`.
- That bug is now fixed locally and verified outside Docker: the exact fresh winner now produces a valid Jupiter swap transaction for the current live wallet.

## Best 5 Pack Set

### Post-grad
- `early-postgrad-10m-liquidity-tape`
  - Strategy lane: continuation / quality post-grad
  - Best evidence-based thresholds at this stage:
    - `minLiquidityUsd=14000`
    - `minBuySellRatio=0.98`
    - `maxSingleHolderPercent=23`
    - `maxTop10HolderPercent=40`
    - `minHolders=45`
    - `minVolume5mUsd=2500`
    - `minUniqueBuyers5m=15`
    - `maxMarketCapUsd=1200000`
    - `maxGraduationAgeSeconds=600`
    - `maxNegativePriceChange5mPercent=8`
- `early-postgrad-7m-recent-live`
  - Strategy lane: freshest-tape scalp / early continuation
  - Sort preference: recency
  - This produced the strongest fresh winner in the clean reset batch.
- `early-postgrad-2m-open-burst`
  - Strategy lane: earliest burst scalp
  - Useful as a fast tape lane, but still more volatile than the 7m lane.

### Pre-grad
- `early-pregrad-95-trade1m-watch`
  - Strategy lane: broad migration scout
  - Keep as research / optional live scout only.
- `early-pregrad-97-5-trade1m-live`
  - Strategy lane: tighter migration scout
  - Still not producing winners in the observed market; reserve-only until signal quality improves.

## Fresh Batch After Clearing Old Runs

- Old `DiscoveryLabRun` rows were deleted before the fresh batch.
- Fresh batch result:
  - `early-postgrad-10m-liquidity-tape`: `1` winner
  - `early-postgrad-2m-open-burst`: `1` winner
  - `early-postgrad-7m-recent-live`: `1` winner
  - both pre-grad packs: `0` winners
- All three post-grad packs converged on the same winner:
  - mint: `4JBeo37fKhEsTXp6PtAYktYRnDAa8DcXZaZ4tTuPpump`
  - symbol: `Tardi` / `TARDI`
  - indicative metrics from the winning pass:
    - `liquidityUsd ~= 16816.39`
    - `volume5mUsd ~= 4566.57`
    - `buySellRatio ~= 10.2955`
    - `marketCapUsd ~= 45492.05`
- The active live session currently points at:
  - session id: `cmo5yl9ze000907plih7eyo7h`
  - run id: `8222d380-1c1d-4909-80ef-9b72ef049ca8`
  - pack: `early-postgrad-7m-recent-live`

## Key Live Workflow Fixes

- `trading-session-service.ts`
  - LIVE session start now clears pause and arms loops immediately instead of leaving the operator stuck in startup hold after switching to live.
- `graduation-engine.ts` + `runtime.ts`
  - Operator `evaluate-now` now bypasses the normal entry delay queue so winning tokens can be tested immediately.
- `birdeye-client.ts`
  - Live custom pack recipes now resolve `now`, `now-...`, and `now+...` style recipe params the same way the discovery lab does.
- `runtime-config.ts`
  - `winnerCohorts.avgWinnerScore` validation now accepts values above `1`, which mattered for real winning run payloads.
- `token-snapshot-recorder.ts`
  - Removed Prisma-incompatible fields that were causing noisy snapshot logging failures.

## Quote Asset Findings

- Wallet balances observed during this session:
  - `SOL ~= 0.186034162`
  - `USDC ~= 0.684022`
  - `USDT ~= 80.84`
- `USDT` was preferred when possible because it was funded, but for the fresh winner Jupiter could not route:
  - `USDT -> Tardi`: `NO_ROUTES_FOUND`
  - `USDC -> Tardi`: `NO_ROUTES_FOUND`
- `SOL -> Tardi` did have a route.
- Because of that, the live quote mint was switched to native SOL and `live-trade-executor.ts` was upgraded to support non-stable quote assets correctly:
  - convert USD budget into quote-asset raw units using live quote USD price
  - compute USD accounting from quote asset price on buy/sell
  - treat native SOL balance as wallet lamports rather than token-account balance

## Quote / Swap Execution Learnings

- `quote-builder.ts`
  - Pump-style winners were failing under the tighter quote path unless the bot retried with wider routing.
  - Current behavior retries the quote with `maxAccounts=40` and no DEX allowlist if the initial route is missing.
- `swap-builder.ts`
  - The previous Jupiter `/swap` body used:
    - `prioritizationFeeLamports.computeBudget.microLamports`
  - Jupiter rejected that with:
    - `422 Failed to deserialize the JSON body into the target type: data did not match any variant of untagged enum PrioritizationFeeLamports`
  - The fix is to send:
    - `computeUnitPriceMicroLamports`
  - After this change, the exact live winner route now builds a valid signed Jupiter transaction locally.
- Swap staleness window was also relaxed from `800ms` to `2500ms` to reduce quote aging failures between quote and swap build.

## Exact Failure Chain Seen During Live Entry Attempts

1. LIVE startup hold blocked the entry until the session was resumed.
2. Quote funding logic initially failed because native SOL was not being treated as wallet lamports.
3. Quote lookup then failed because the route needed wider `maxAccounts` / routing fallback.
4. Swap build still failed because the Jupiter `/swap` body used the wrong fee payload shape.
5. After the final local fix, the same route now produces `gotSwap: true` in direct verification.

## Runtime Cadence / Settings State

- Runtime config observed on the active live stack:
  - discovery interval: `15000ms`
  - off-hours discovery interval: `30000ms`
  - evaluation interval: `5000ms`
  - idle evaluation interval: `5000ms`
  - exit interval: `15000ms`
  - entry delay: `5000ms`
  - concurrency: `4`
- These faster values are appropriate for the current early post-grad workflow and materially reduce friction between winner detection and entry.

## Docker / Image State

- Backend Docker config was adjusted so `.local` custom pack drafts are included in the image.
- The intended Docker state is that only the `5` new custom packs remain available in the container.
- `db-setup` is now being hardened so it repairs legacy `NULL updatedAt` rows before Prisma runs. The immediate failure that surfaced was `OperatorEvent.updatedAt`, but the durable fix is generic across public tables with an `updatedAt` column.
- The durable `db-setup` fix lives in `backend/scripts/db-repair-updated-at.mjs`, is wired into `db:setup` and `db:setup:dangerous`, and required the migrator Docker stage to copy `backend/scripts/` so the repair command exists inside the `db-setup` image at runtime.
- Before the next container restart/rebuild, the requested workflow is:
  1. commit and push the local tree to `main`
  2. then refresh Docker
  3. then retry live entry on the active winner lane

## Immediate Next Steps

1. Commit and push the current local tree, including this note.
2. Refresh the backend container so the fixed `swap-builder.ts` lands in Docker.
3. Resume the active session if startup hold returns after restart.
4. Retry manual entry for mint `4JBeo37fKhEsTXp6PtAYktYRnDAa8DcXZaZ4tTuPpump` from run `8222d380-1c1d-4909-80ef-9b72ef049ca8`.
5. If the buy lands, monitor the fill and position lifecycle, then capture realized PnL and exit behavior.

## Handy Commands

```bash
curl -sSf http://127.0.0.1:3101/api/status | jq '{tradeMode: .botState.tradeMode, pauseReason: .botState.pauseReason, entryGate: .entryGate, currentSession: .currentSession}'
```

```bash
curl -sSf -X PATCH http://127.0.0.1:3101/api/operator/sessions/cmo5yl9ze000907plih7eyo7h \
  -H 'Content-Type: application/json' \
  --data '{"action":"resume"}'
```

```bash
curl -sS -X POST http://127.0.0.1:3101/api/operator/runs/8222d380-1c1d-4909-80ef-9b72ef049ca8/manual-entry \
  -H 'Content-Type: application/json' \
  --data '{"mint":"4JBeo37fKhEsTXp6PtAYktYRnDAa8DcXZaZ4tTuPpump","positionSizeUsd":10}'
```
