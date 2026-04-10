---
name: "code-review-findings"
description: "Use for code review when the goal is finding correctness, regression, security, or verification gaps and reporting only concrete, high-signal issues."
---

# Code Review Findings

Use this skill when the task is review, not implementation.

## Review Order

- Correctness and behavior regressions.
- Security and safety risks.
- Missing tests or missing verification.
- Maintainability issues that materially increase bug risk.
- Repo-specific hotspots:
  - unauthenticated write routes
  - dashboard proxy mistakes
  - schema or SQL view drift
  - analytics claims built from mutable current state instead of history

## Output Rules

- Lead with findings, not summary.
- Include file references and the concrete failure mode.
- Ignore style unless it creates bug risk.
- If no bug is found, say that plainly and state residual risk.
