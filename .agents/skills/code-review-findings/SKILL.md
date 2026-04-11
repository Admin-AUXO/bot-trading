---
name: "code-review-findings"
description: "Use for code review when the goal is concrete correctness, regression, security, or verification findings."
---

# Code Review Findings

## Use When

- the user wants review, not implementation

## Review Order

- correctness and behavior regressions
- security and safety gaps
- missing tests or missing verification
- maintainability issues that materially raise bug risk

## Repo Hotspots

- unauthenticated write paths
- dashboard proxy drift
- schema or SQL-view drift
- analytics claims built from mutable current state instead of history

## Deliverable

- lead with findings
- include file references and failure mode
- ignore style unless it creates bug risk
