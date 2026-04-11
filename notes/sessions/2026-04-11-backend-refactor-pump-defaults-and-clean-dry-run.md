---
type: session
status: closed
area: backend/strategy/runtime
date: 2026-04-11
source_files:
  - trading_bot/backend/.env.example
  - trading_bot/backend/src/config/env.ts
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/services/birdeye-client.ts
  - trading_bot/backend/src/services/shared-token-facts.ts
  - trading_bot/backend/src/services/strategy-exit.ts
  - trading_bot/backend/src/services/strategy-presets.ts
  - notes/reference/strategy.md
  - notes/reference/prisma-and-views.md
graph_checked: 2026-04-11
next_action: Re-run the bounded dry run in another live pump window before changing thresholds again; this clean run proved the path is healthy, not that the market is generous.
---

# Session - Backend Refactor, Pump Defaults, And Clean Dry Run

## Context

The user asked for backend cleanup, performance work, entry and exit tuning, a pump-only default source stance, a clean database reset, one more dry run, and matching Obsidian updates.

## What Changed

- switched the repo defaults back to the pump-only desk:
  `DISCOVERY_SOURCES="pump_dot_fun"`
  `TRADABLE_SOURCES="pump_dot_fun"`
- removed the redundant Birdeye `getGraduatedMemeTokens()` wrapper and kept one `getMemeTokens()` path
- refactored `SharedTokenFactsService` to read all fresh cached facts for a mint in one row fetch instead of one DB query per fact type
- updated `GraduationEngine.evaluateCandidate()` to:
  - project Birdeye evaluation and security spend from actual cache freshness instead of charging cached reads like live provider calls
  - reuse the one-row shared-fact bundle across detail, trade, security, and Helius reads
  - precompute candidate ranking scores once per loop instead of recomputing inside the sort comparator
- tuned preset filters:
  - continuation preset market-cap cap tightened from `10m` to `5m`
  - late-curve preset market-cap cap tightened from `8m` to `7m`
- fixed score-aware exit shaping so the fast-turn presets behave in the right order again:
  `scalp` now has the shortest time-stop and hard-limit
  `balanced` stays in the middle
  `runner` keeps the longest window
- slightly widened the preset base exit windows so the fast-turn presets are no longer absurdly cramped before score shaping:
  continuation base `4m / 8m`
  late-curve base `3m / 6m`

## What I Verified

```bash
cd /Users/rukaiyahyusuf/Downloads/bot-trading/trading_bot/backend
npm run db:generate
npm run typecheck
npm run build

cd /Users/rukaiyahyusuf/Downloads/bot-trading
$(git rev-parse --show-toplevel)/.codex/scripts/graphify-rebuild.sh

cd /Users/rukaiyahyusuf/Downloads/bot-trading/trading_bot
docker compose stop bot dashboard
docker exec trading-postgres psql -U botuser -d trading_bot ...
docker compose up -d --build bot dashboard
```

- database reset succeeded:
  `Candidate=0`
  `Position=0`
  `ResearchRun=0`
  `ApiEvent=0`
- rebuilt backend came back healthy and served the new `settings.strategy.*` contract
- fresh bounded dry run completed successfully after the reset:
  run id `cmnu27m1a000007pxhmhdzdbq`
  `status=COMPLETED`
  `totalDiscovered=0`
  `totalEvaluated=0`
  `totalStrategyPassed=0`
  `birdeyeCalls=1`
  `birdeyeUnitsUsed=100`
  `heliusCalls=0`
  `heliusUnitsUsed=0`
  `errorMessage=null`

## Risks / Unknowns

- the clean run proved the dry-run path, budget math, and reset procedure are healthy; it did **not** prove the tuned presets will open positions in the current market window
- entry and exit tuning was validated structurally, not through a position lifecycle, because this pump-only window returned zero discovery names on the clean run
- there are still broader in-progress worktree changes outside this note’s file set; do not assume this session was the only author in the tree

## Next Action

Run the same bounded dry run in another live pump window. If it still returns zero names repeatedly, inspect discovery recipe throughput first before loosening concentration controls or weakening the fast-turn exits.

## Durable Notes Updated

- `notes/reference/strategy.md`
- `notes/reference/prisma-and-views.md`
- `notes/sessions/index.md`
- `notes/sessions/2026-04-11-backend-refactor-pump-defaults-and-clean-dry-run.md`
