---
name: "dashboard-operations"
description: "General dashboard workflow for data fetching, UI wiring, query debugging, browser verification, and safe frontend implementation in the existing product style."
---

# Dashboard Operations

Use this skill for non-specialist dashboard changes.

## Required Pre-Read
- `docs/README.md`
- `docs/dashboard/overview.md`
- `docs/dashboard/pages.md`
- `docs/workflows/control-and-auth.md`
- `docs/workflows/profiles-and-runtime-scope.md`
- `docs/workflows/quota-and-provider-budgets.md` when quota UI or budget semantics matter

## Goals
- Respect the existing design system and product conventions.
- Focus on data flow, hooks, charts, filters, and state wiring.
- Verify visible behavior in a browser when feasible.
- Keep changes scoped and readable.
- Keep query keys, URL params, and backend filters aligned for `days`, `mode`, `configProfile`, and `tradeSource` where those filters matter.
- Keep active runtime scope separate from analysis filters. `use-dashboard-shell.ts` owns chrome/runtime truth; `use-dashboard-filters.ts` owns page-level lane inspection.
- Treat `/quota` service totals as global provider budgets. Only endpoint drill-downs should narrow by lane metadata, and only when that metadata exists.
- Centralize control-plane auth in the dashboard proxy rather than scattering token handling through callers.
- When using `useSearchParams`, `useQueryState`, or similar client-side search-param hooks at page level, put the client subtree behind the required Suspense boundary.
- If dashboard behavior, scope labeling, auth flow, or page features change, update the matching docs in the same pass.

## Preferred Tools
- `filesystem` for local code inspection.
- `serena` for component, hook, and symbol navigation in the Codex-managed project session; use the CLI only for explicit `project index` or `project health-check` refreshes.
- `chrome_devtools` for console, network, and rendering checks.
- `browsermcp` for interaction-heavy flows.
- `context7` for framework-specific behavior.

## Output Shape
- Root cause or requested change.
- Files touched.
- Verification result.
