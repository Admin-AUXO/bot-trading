---
name: "dashboard-operations"
description: "General dashboard workflow for data fetching, UI wiring, query debugging, browser verification, and safe frontend implementation in the existing product style."
---

# Dashboard Operations

Use this skill for non-specialist dashboard changes.

## Goals
- Respect the existing design system and product conventions.
- Focus on data flow, hooks, charts, filters, and state wiring.
- Verify visible behavior in a browser when feasible.
- Keep changes scoped and readable.
- Keep query keys, URL params, and backend filters aligned for `days`, `mode`, `configProfile`, and `tradeSource` where those filters matter.
- Centralize control-plane auth in the dashboard proxy rather than scattering token handling through callers.
- When using `useSearchParams`, `useQueryState`, or similar client-side search-param hooks at page level, put the client subtree behind the required Suspense boundary.

## Preferred Tools
- `filesystem` for local code inspection.
- `serena` for component, hook, and symbol navigation.
- `chrome_devtools` for console, network, and rendering checks.
- `browsermcp` for interaction-heavy flows.
- `context7` for framework-specific behavior.

## Output Shape
- Root cause or requested change.
- Files touched.
- Verification result.
