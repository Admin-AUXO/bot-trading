---
name: "analytics-advice"
description: "Use for evidence-based analysis of trading outcomes, candidate funnels, position performance, and telemetry-backed recommendations without drifting into unsupported strategy claims."
---

# Analytics Advice

Use this skill when the task is analytical first: explain what happened, quantify it, and turn it into testable follow-up instead of hand-waving.

Do not use this skill for direct strategy rewrites. Use `strategy-safety` when the task is changing entry, sizing, or exit logic.

## Read First

- `docs/README.md`
- `docs/prisma-and-views.md`
- `docs/strategy.md`

## Workflow

- Start from repo-owned evidence tables or views, not from current singleton state.
- Separate descriptive findings from recommendations.
- Check sign conventions, denominators, filters, and sampling windows before trusting any edge number.
- Call out sample-size limits, missing telemetry, and survivorship bias.
- Treat provider cost or latency as real only when `ApiEvent`, `RawApiPayload`, or code paths support the claim.
- Convert recommendations into hypotheses that can be tested with current data or a small code change.

## Preferred Evidence

- Positions and fills for realized outcomes.
- Candidates and token snapshots for entry-gate behavior.
- `ApiEvent` and `RawApiPayload` when spend, failures, or latency matter.

## Output

- What the data supports.
- What is still too thin to claim.
- The smallest useful next test or metric refinement.
