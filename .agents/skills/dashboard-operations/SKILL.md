---
name: "dashboard-operations"
description: "Use for dashboard engineering work: data fetching, route wiring, API integration, table behavior, and safe frontend changes."
---

# Dashboard Operations

## Use When

- the problem is data flow, route behavior, filtering, or UI correctness
- the task is not primarily visual polish

## Read First

- `notes/README.md`
- `notes/reference/tech-stack.md`
- `notes/reference/api-surface.md`

## Rules

- Trace data from fetch helper to route to backend source before editing UI code.
- Keep browser-facing writes on the dashboard proxy.
- Keep query keys, request params, and backend filters aligned.
- Preserve the existing operator-desk role; do not pull historical analytics back out of Grafana just because it is convenient.

## Deliverable

- root cause or requested change
- files touched
- verification result
