---
name: "strategy-safety"
description: "Use for strategy changes that touch discovery gates, evaluation logic, risk capacity, position sizing, pause behavior, or exits."
---

# Strategy Safety

## Use When

- the task changes strategy, sizing, risk, or exit behavior

## Read First

- `notes/README.md`
- `notes/reference/strategy.md`
- `notes/reference/prisma-and-views.md` when evidence or snapshots matter

## Rules

- Protect capital first.
- Validate the full path from discovery signal to exit behavior.
- Treat manual overrides as first-class risk surfaces.
- Keep provider-heavy logic inside shared services.
- Persist evidence when thresholds or rejection reasons change.
- Update `notes/reference/strategy.md` when the strategy contract changes.
