---
type: session
status: active
area: dashboard
date: 2026-04-11
source_files:
  - trading_bot/dashboard/app
  - trading_bot/dashboard/components
  - trading_bot/dashboard/lib
  - notes/reference/dashboard-operator-ui.md
  - notes/reference/api-surface.md
  - notes/investigations/2026-04-10-dashboard-control-desk-audit.md
graph_checked: 2026-04-11
next_action: Re-run browser checks on row-level actions and Grafana pivots once the runtime has real candidate and position rows again.
---

# Session - Dashboard Workstream Summary

## Findings / Decisions

- The Next.js dashboard is now a dense operator desk, not a soft overview surface.
- `/` is command-first: exposure plus queue summary stay above the fold, then pinned items and ranked interventions.
- `/candidates` and `/positions` are triage workbenches with sticky rails, denser tables, URL-backed filters, and inline `Open`, `Pin`, `Grafana`, and `Copy` actions.
- `/telemetry` is a fault console and `/research` is visually sandboxed from live operations.
- The control-plane path stays behind the dashboard proxy. Browser-facing writes still go through `dashboard/app/api/[...path]/route.ts`.

## What Changed

- Settings flow now follows `Draft -> Validate -> Dry run -> Promote`.
- Table and detail-page flows preserve list state when operators bounce between lists and entity pages.
- Pinned items moved to one shared provider instead of row-level listener sprawl.
- Shared UI primitives, spacing, typography, and dashboard copy were tightened around the operator-desk contract in `notes/reference/dashboard-operator-ui.md`.
- Dashboard-side Grafana links now belong to the dedicated dashboard compose env instead of inheriting the whole backend env file.

## What I Verified

- `cd trading_bot/dashboard && npm run build`
- Route responses for `/`, `/settings`, `/candidates`, `/positions`, `/telemetry`, and `/research`
- Browser checks for homepage, settings, workbenches, telemetry, and research
- Pinned-item persistence across refresh and route changes

## Remaining Risks

- Real-row browser checks are still pending because the current runtime window has no candidate or position rows.
- Candidate and position Grafana pivots still need one end-to-end pass with live entity data.
- If the settings workflow changes again, the visible step rail needs another browser check, not just a route smoke test.

## Durable Notes Updated

- `notes/reference/dashboard-operator-ui.md`
- `notes/reference/api-surface.md`
- `notes/investigations/2026-04-10-dashboard-control-desk-audit.md`
