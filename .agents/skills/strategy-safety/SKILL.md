---
name: "strategy-safety"
description: "Trading strategy workflow focused on entry and exit logic, position sizing, risk controls, and implementation changes that preserve safety and explainability."
---

# Strategy Safety

Use this skill for strategy changes.

## Required Pre-Read
- `docs/README.md`
- `docs/strategies/overview.md`
- the relevant file in `docs/strategies/`
- `docs/workflows/quota-and-provider-budgets.md` when provider usage or degradation behavior matters
- `docs/workflows/profiles-and-runtime-scope.md` when runtime lane or control behavior matters

## Goals
- Protect capital before chasing upside.
- Make strategy logic explainable from signal to exit.
- Validate interactions with risk limits, regime rules, and execution paths.
- Avoid changes that rely on hidden assumptions or unverified data quality.
- Ensure manual entry or override paths obey the same reserve, sizing, and capital checks as automated entries.
- Never let quota throttling disable exits, execution completion, or wallet reconciliation; degrade non-essential scans, scoring, and backfills first.
- New provider-heavy logic must flow through the shared services so essentiality, purpose, caching, and batching remain visible to the budget manager.
- Timing changes must stay explainable from detection to signal to execution. Prefer persisting that evidence in existing signal/trade metadata rather than relying on logs or operator memory.
- If a strategy intentionally waits, scans on cadence, or requires multi-read exit confirmation, document that timing budget as part of the safety story.
- If entry, exit, tranche, or safety behavior changes, update the corresponding strategy docs in the same pass.

## Review Order
- Entry conditions.
- Position sizing.
- Exit behavior and tranches.
- Operational safety and failure modes.
