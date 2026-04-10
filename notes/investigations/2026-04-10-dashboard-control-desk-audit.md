---
type: investigation
status: open
area: dashboard
date: 2026-04-10
source_files:
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/engine/risk-engine.ts
  - trading_bot/backend/src/engine/research-dry-run-engine.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/services/provider-budget-service.ts
  - trading_bot/backend/prisma/views/create_views.sql
graph_checked: 2026-04-10
next_action: Refactor shell and overview around a stable control-desk contract, then split operator endpoints from reporting views.
---

# Investigation - Dashboard Control Desk Audit

## Trigger

Audit the Next.js dashboard and the backend surfaces that feed it, then plan how to turn the UI into a dark, modern control desk while moving heavier analytics to Grafana.

## Evidence

- Repo docs define the dashboard as the operator shell and recommend Grafana for heavier analytics.
- Live dashboard reviewed in browser on `http://127.0.0.1:3100` with backend healthy on `http://127.0.0.1:3101/health`.
- The shell duplicates status in the sidebar, sticky header, and footer.
- The overview page changes identity based on `tradeMode`, so `/` becomes a research page in `DRY_RUN`.
- Most pages use the same pattern:
  hero copy -> stat cards -> raw evidence tables -> long empty states.
- Backend `GET /api/status` returns a broad mixed snapshot instead of a desk-specific contract.
- Backend reporting views are useful for analysis and Grafana, but they are too generic for primary operator workflows.

## Hypotheses

- The dashboard feels cluttered because it is mixing three jobs:
  control desk, evidence inspection, and analytics/reporting.
- The shell feels verbose because the same runtime truth is repeated across multiple layout bands.
- The frontend over-explains because the backend does not expose page-shaped operator contracts, so the UI compensates with prose and generic tables.

## Findings

### Dashboard

- The shell is carrying repeated runtime state across the sidebar, top header, and footer instead of one clear command surface.
- `/` is not a stable command center. In `DRY_RUN`, it becomes a research explainer with research notes, config snapshot, and run comparison.
- `Candidates`, `Positions`, and `Telemetry` are row-dump pages. They expose evidence, but not workflows.
- `Settings` is a form wall with read-only cadence fields occupying high-value space.
- `PageHero`, `StatCard`, `DataTable`, and related primitives bias the app toward large narrative panels instead of dense operator tooling.

### Backend

- `GET /api/status` returns `latestCandidates`, `latestFills`, `providerSummary`, `providerBudget`, and research status in one mixed snapshot.
- Control routes return only `{ ok: true }`, forcing the frontend to refresh to discover the new effective state.
- Candidate, position, fill, snapshot, and payload routes are mostly raw storage reads with `limit`, not task-shaped operator endpoints.
- SQL views are already suitable for Grafana:
  daily funnels, provider history, endpoint efficiency, reject reasons, trigger mix, position performance.
- Risk and config services already calculate valuable desk state:
  live readiness, pause reason, daily loss guard, consecutive losses, max-open cap, and validated settings constraints.
- Research is already isolated at the backend and should remain off the main control desk.

## Decision

Plan the redesign around a strict split:

- Dashboard = control desk plus drill-down evidence
- Grafana = historical analytics, trend analysis, and dense reporting

Do not redesign the current UI by polishing the existing page pattern. Replace the information architecture first.

## Proposed Shell

### Header

- Replace the current tall sticky header with a compact command bar.
- Show only:
  mode, health, blocker, last sync, and global actions.
- Global actions:
  pause or resume, discover now, evaluate now, exit check now, run research dry run.

### Sidebar

- Compress to icon + label + status badge.
- Remove nav subtitles.
- Remove lane notes.
- Keep at most one small runtime status block.

### Footer

- Remove it or collapse it to one thin connection/status line.

## Proposed Pages

### `/`

Purpose: stable control desk in both `LIVE` and `DRY_RUN`.

Keep:

- mode and readiness
- blocker and guardrails
- open exposure
- queued work
- provider pressure
- latest actions and failures
- one compact event stream

Remove from `/`:

- research notes
- config snapshot
- run comparison
- long explanatory prose
- heavy charts that belong in Grafana

### `/candidates`

Purpose: operator workbench for queue and rejects.

Keep one dense table with tabs or segments:

- queued
- promoted
- rejected
- errors

Add row detail drawer:

- summary
- latest normalized filter state
- snapshot history
- raw provider payload

Do not keep three equal-weight tables on the page by default.

### `/positions`

Purpose: live and recent book management.

Split into:

- open book
- closed book

Primary emphasis:

- open risk first
- exit reason and fill trail in drill-down

Move long-horizon performance trends to Grafana.

### `/research`

Purpose: isolated dry-run review only.

Keep:

- run picker
- run summary
- token shortlist
- mock positions
- comparison vs previous run

Do not duplicate research state on `/`.

### `/telemetry`

Purpose: diagnostics only.

Keep:

- provider health
- endpoint failures
- budget pressure
- stale timestamps
- config drift or ingest issues

Move to Grafana:

- provider daily history
- endpoint efficiency history
- reject trends
- snapshot trigger trends
- long-range candidate funnel views

### `/settings`

Purpose: safe runtime control, not config archaeology.

Regroup into tabs or sections:

- Capital
- Entry
- Exit
- Research
- Advanced

Keep read-only cadence and low-frequency config under `Advanced`.
Add a sticky save bar, validation summary, and dirty diff summary.

## Backend Support Needed

### Keep

- `GET /api/status` as a broad compatibility route for now
- `GET /api/views/:name` for Grafana and deep reporting
- dedicated research routes

### Add

- desk-specific operator snapshot endpoint
- action endpoints that return updated effective state
- page-shaped endpoints:
  candidate queue, candidate detail, open positions, closed positions, diagnostics summary
- backend metadata for editable vs read-only settings groups

### Avoid

- making the new control desk depend on generic reporting views
- pushing more analytics into the shell just because the data is already queryable

## Grafana Split

Good Grafana candidates:

- `v_candidate_funnel_daily`
- `v_position_performance`
- `v_api_provider_daily`
- `v_api_endpoint_efficiency`
- `v_candidate_reject_reason_daily`
- `v_snapshot_trigger_daily`
- `v_position_exit_reason_daily`

Keep the dashboard focused on current state, actions, blockers, and drill-down evidence.

## Next Action

1. Refactor shell and overview first.
2. Introduce a stable operator contract from the backend.
3. Rebuild candidates and positions around workflows and drill-down.
4. Strip telemetry to diagnostics.
5. Rebuild settings around grouped safety-critical controls.

## Linked Notes

- [Reference Index](../reference/index.md)
- [API Surface](../reference/api-surface.md)
- [Prisma And Views](../reference/prisma-and-views.md)
- [Tech Stack](../reference/tech-stack.md)
