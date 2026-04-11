---
name: "analytics-advice"
description: "Use for evidence-based analysis of trading outcomes, candidate funnels, position performance, and telemetry-backed recommendations."
---

# Analytics Advice

## Use When

- the task is analytical first
- you need evidence-backed recommendations
- the answer should come from repo data, not narrative instinct

## Read First

- `notes/README.md`
- `notes/reference/prisma-and-views.md`
- `notes/reference/strategy.md`

## Rules

- Start from realized data or persisted evidence tables.
- Separate description from recommendation.
- Call out sample-size limits, missing telemetry, bad denominators, and mutable-current-state traps.
- Treat provider spend or latency as real only when the repo stores evidence for it.

## Deliverable

- what the data supports
- what is still too thin to claim
- the smallest useful next test
