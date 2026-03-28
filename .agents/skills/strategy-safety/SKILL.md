---
name: "strategy-safety"
description: "Trading strategy workflow focused on entry and exit logic, position sizing, risk controls, and implementation changes that preserve safety and explainability."
---

# Strategy Safety

Use this skill for strategy changes.

## Goals
- Protect capital before chasing upside.
- Make strategy logic explainable from signal to exit.
- Validate interactions with risk limits, regime rules, and execution paths.
- Avoid changes that rely on hidden assumptions or unverified data quality.
- Ensure manual entry or override paths obey the same reserve, sizing, and capital checks as automated entries.
- Never let quota throttling disable exits, execution completion, or wallet reconciliation; degrade non-essential scans, scoring, and backfills first.
- New provider-heavy logic must flow through the shared services so essentiality, purpose, caching, and batching remain visible to the budget manager.

## Review Order
- Entry conditions.
- Position sizing.
- Exit behavior and tranches.
- Operational safety and failure modes.
