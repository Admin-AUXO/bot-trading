---
name: strategy-pack-authoring
description: Use when creating, editing, versioning, or grading a StrategyPack — filters, exits, sort column, capital modifier, adaptive axes. Pack is the contract.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Strategy Pack Authoring

## Use when

- creating a new `StrategyPack` row or new version of an existing pack
- editing pack filters, exits, sort column/order, capital modifier, or adaptive axes
- grading a `StrategyRun` or applying `PackGradingService` tuning deltas
- importing / exporting packs between file and DB

## Read first

- `draft_strategy_packs_v2.md` — the 10 packs + adaptive engine spec
- `draft_backend_plan.md` — `StrategyPackService` / `PackGradingService` contracts
- `draft_database_plan.md` — `StrategyPack`, `StrategyPackVersion`, `StrategyRun`, `StrategyRunGrade` shape
- `notes/reference/strategy.md` — strategy contract (graduation, evaluation, exit)

## Rules

- Pack is the contract: filters + exits + sort column + capital modifier + adaptive axes live on the pack row. No hidden constants.
- 4 filters apart from graduation and time. Adding a 5th requires naming the failure mode it addresses.
- Sort column is per-pack (it shapes the Birdeye meme-list query under budget). Adaptive axes cannot change it.
- Runners and scalps use different exit tables — MC-tiered base for runners with wide TP2; tight SL / TP1 for scalps.
- Capital modifier is per-pack, bounded inside `RiskEngine.canOpenPosition`. Adaptive sizing only multiplies downward.
- Pack `status=LIVE` requires `grade ∈ {A, B}` — enforced at API, not UI.
- Every edit creates a new `StrategyPackVersion`. No destructive updates.
- Publish is two-step: `DRAFT → TESTING` → `TESTING → LIVE` via an explicit `TradingSession.start`.

## Failure modes

- Adding filters without naming the failure mode they address → brittle, backtest-flattering, live-poor pack.
- Editing a LIVE pack in place → no rollback path. Always clone → draft → promote.
- Changing sort column adaptively → breaks the meme-list budget model.
- Skipping sandbox → GRADED without 48 h sandbox at ≥10 triggered candidates.
