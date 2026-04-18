---
name: adaptive-thresholds
description: Use when touching AdaptiveThresholdService, mutator axes, or the evaluator/exit-engine seams where mutations apply. Mutate down, not up.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Adaptive Thresholds

## Use when

- implementing or editing `AdaptiveThresholdService`
- adding / removing mutator axes (session, perf, drawdown, consec, exposure, entry-score floor)
- wiring mutations at the evaluator seam (before `scoreEntrySignal`) or the exit-plan build seam
- adding `liveMutators` inside `exit-engine.ts`
- debugging `AdaptiveThresholdLog` rows

## Read first

- `draft_strategy_packs_v2.md` §C — axes, composition rules, MC-tiered exit base, graduation-age taper
- `draft_backend_plan.md` §3 — hook points
- `draft_database_plan.md` §1 — `AdaptiveThresholdLog` schema
- `notes/reference/strategy.md` — evaluation + exit contract

## Rules

- Composition: `sessionMult × perfMult × drawdownMult × consecMult × exposureMult → filterMult`. Every axis multiplies; no axis replaces.
- Mutate **down**, not up: in negative regimes multipliers compose to ≤1; in positive regimes they may rise but only within `RiskEngine.canOpenPosition` bounds.
- Adaptive axes mutate baseline filters/exits only — they cannot change a pack's sort column, capital modifier, or filter identity.
- Every mutation writes an `AdaptiveThresholdLog` row with `axis`, `originalValue`, `mutatedValue`, `reasonCode`, `ctxJson`. No silent mutations.
- `liveMutators` in the exit engine stay behind `settings.exits.liveMutators.enabled`. Each mutator requires 30 paper exits at neutral-or-better PnL before live.
- Risk engine is authoritative — adaptive sizing downstream of `canOpenPosition` never widens bounds.

## Failure modes

- Mutator that widens risk under drawdown.
- Non-bounded perfMult that keeps compounding without a ceiling.
- Missing `AdaptiveThresholdLog` row → dashboard telemetry breaks.
- Mutating sort column or capital modifier from the adaptive path → pack identity loss.
- Shipping an exit-engine mutator without paper-exit verification.
