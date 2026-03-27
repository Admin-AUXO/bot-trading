---
name: "code-review-findings"
description: "Owner-minded code review workflow that prioritizes correctness, regressions, security, and missing tests, with concrete evidence and minimal noise."
---

# Code Review Findings

Use this skill for reviews.

## Review Order
- Correctness and behavior regressions.
- Security and safety risks.
- Missing tests or missing verification.
- Maintainability issues that materially increase bug risk.

## Output Rules
- Lead with findings, not summary.
- Include file references and the failure mode.
- Avoid style-only feedback unless it masks a real defect.
- State residual risks if no concrete bug is found.
