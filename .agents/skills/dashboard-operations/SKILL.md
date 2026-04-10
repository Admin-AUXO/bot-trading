---
name: "dashboard-operations"
description: "Use for dashboard engineering work: data fetching, page wiring, API integration, table/chart behavior, and safe frontend changes in the existing product style."
---

# Dashboard Operations

Use this skill for dashboard implementation work that is more about data flow and UI behavior than about visual polish.

Do not use this skill for primarily visual refinement. Use `dashboard-ui-ux` for layout, hierarchy, and interaction polish.

## Read First

- `docs/README.md`
- `docs/tech-stack.md`
- `docs/api-surface.md`

## Workflow

- Respect the current product style and page structure.
- Match changes to the live route surface: `/`, `/candidates`, `/positions`, `/telemetry`, `/settings`.
- Trace page data flow from fetch helper to route to backend source before editing UI code.
- Keep browser-facing writes on the dashboard proxy.
- Keep overview pages operational; move heavy forensic detail to dedicated pages instead of bloating the shell.
- Verify visible behavior in a browser when feasible.
- If auth flow, page features, or route contracts change, update the matching docs in the same pass.

## Output

- Requested change or root cause.
- Files touched.
- Verification result.
