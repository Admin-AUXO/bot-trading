---
name: "strategy-safety"
description: "Use for strategy changes that touch discovery gates, evaluation logic, risk capacity, position sizing, pause behavior, or exits and need safety-first reasoning."
---

# Strategy Safety

Use this skill for strategy changes.

## Read First

- `docs/README.md`
- `docs/strategy.md`
- `docs/prisma-and-views.md` when evidence or snapshots matter

## Workflow

- Protect capital before chasing upside.
- Make strategy logic explainable from discovery signal to exit.
- Validate interactions with `RiskEngine`, `ExecutionEngine`, `ExitEngine`, and pause/resume behavior.
- Avoid changes that rely on hidden assumptions or unverified provider data.
- Keep provider-heavy logic inside shared services.
- Persist evidence when timing, thresholds, or rejection reasons change.
- Remember that `LIVE` is still intentionally blocked; do not document or imply real execution support that does not exist.
- Update `docs/strategy.md` in the same pass when strategy behavior changes.

## Review Order

- Discovery and evaluation gates.
- Position sizing and capacity.
- Exit behavior and partials.
- Operational safety and failure modes.
