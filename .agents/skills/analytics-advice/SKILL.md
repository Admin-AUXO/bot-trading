---
name: "analytics-advice"
description: "Workflow for evaluating trading outcomes, regime performance, strategy metrics, and actionable analytics improvements without overfitting."
---

# Analytics Advice

Use this skill for metrics and performance interpretation.

## Goals
- Separate descriptive analysis from proposed strategy changes.
- Prefer repeatable metrics over anecdotes.
- Highlight sample-size limits and data quality caveats.
- Frame recommendations as testable hypotheses.
- Check that historical metrics come from immutable records or snapshots rather than mutable runtime singleton state.
- Verify sign conventions, aggregate-row keys, and filter propagation before trusting reported expectancy or date-range slices.
- Include provider-cost pressure when it changes what can be scanned or executed in production; quota-blind recommendations are incomplete.
- Prefer endpoint-, purpose-, and scope-level evidence from `ApiUsageDaily` and `ApiEndpointDaily` when data spend or latency is part of the argument.

## Preferred Inputs
- Trade outcomes, daily stats, regime snapshots, and strategy comparisons.
- Historical context from DB or reports.
- Current strategy constraints from repo docs.
