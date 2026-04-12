---
type: session
status: closed
area: strategy/runtime
date: 2026-04-11
source_files:
  - trading_bot/backend/src/services/strategy-presets.ts
  - trading_bot/backend/src/engine/graduation-engine.ts
  - trading_bot/backend/src/engine/research-dry-run-engine.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/shared-token-facts.ts
  - trading_bot/backend/src/services/helius-migration-watcher.ts
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/dashboard/components/settings-client.tsx
graph_checked: 2026-04-11
next_action: Populate `HELIUS_MIGRATION_WATCH_PROGRAM_IDS` with trusted program ids before expecting the continuation watcher to fire live discovery nudges.
---

# Session - Strategy Presets, Shared Facts, And Helius Watcher

## What Changed

- added two runtime-selectable S2 presets:
  - `FIRST_MINUTE_POSTGRAD_CONTINUATION`
  - `LATE_CURVE_MIGRATION_SNIPE`
- split preset selection by mode:
  - `settings.strategy.livePresetId`
  - `settings.strategy.dryRunPresetId`
- added `settings.strategy.heliusWatcherEnabled`
- made live discovery and bounded research discovery use the preset-specific Birdeye recipe instead of one global discovery shape
- made evaluation apply preset-specific filter and exit overrides on top of the base desk settings
- tagged candidates, live positions, research runs, research tokens, and research positions with `strategyPresetId`
- removed the old one-mint lifetime trap by dropping the global unique constraint on `Candidate.mint`
- changed discovery dedupe to skip only active candidates, so a mint can be revisited later under another preset

## Shared Fact Cache

- added `SharedTokenFact`
- cache now persists and reuses:
  - Birdeye detail
  - Birdeye trade data
  - Birdeye token security
  - Helius mint authorities
  - Helius holder concentration
- cache is shared across live evaluation and research evaluation so both presets stop paying full provider cost for the same mint in the same window

## Helius Watcher

- added a configurable Helius `logsSubscribe` watcher using the standard unified WSS endpoint
- watcher does **not** hard-code pump migration program ids
- live runtime only reacts when all of these are true:
  - `TRADE_MODE=LIVE`
  - `settings.strategy.heliusWatcherEnabled=true`
  - the active live preset is the continuation preset
  - `HELIUS_MIGRATION_WATCH_PROGRAM_IDS` is populated
- on signal, the runtime records an operator event, stores the signature in `SharedTokenFactMigrationSignal`, and triggers an immediate discovery sweep

## Default Stance

- `LIVE` default preset:
  `FIRST_MINUTE_POSTGRAD_CONTINUATION`
- `DRY_RUN` default preset:
  `LATE_CURVE_MIGRATION_SNIPE`

The point is obvious: keep the live lane on the safer continuation path while the research lane keeps interrogating the dirtier pre-grad edge.

## Verification

```bash
cd trading_bot/backend
npm run db:generate
npm run typecheck
DATABASE_URL='postgresql://botuser:botpass@127.0.0.1:56432/trading_bot' npm run db:setup

cd trading_bot/dashboard
npm run build
```
