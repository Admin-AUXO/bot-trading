---
type: decision
status: active
area: grafana
date: 2026-04-11
source_files:
  - notes/investigations/2026-04-10-dashboard-control-desk-audit.md
  - notes/reference/api-surface.md
  - notes/reference/prisma-and-views.md
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/prisma/views/create_views.sql
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/dashboard/lib/grafana.ts
  - trading_bot/docker-compose.yml
  - trading_bot/grafana/scripts/build-dashboards.mjs
  - trading_bot/grafana/provisioning/datasources/postgres.yaml
  - trading_bot/grafana/provisioning/dashboards/providers.yaml
graph_checked: 2026-04-11
next_action: Bring the local Grafana service up again and browser-check the regenerated dashboards plus the candidate and position deep links against real entity rows.
---

# Decision - Grafana Dashboard Plan

## Problem

Grafana planning was too vague. The repo had outbound deep links, but not a clear contract for what each dashboard should answer, which variables the app could pass, and which gaps still needed upstream data work.

## Decision

Treat Grafana as the historical and RCA surface, not an embedded part of the Next.js operator desk. The repo now keeps a small dashboard set generated from `trading_bot/grafana/scripts/build-dashboards.mjs` instead of ad hoc JSON edits.

Current dashboard contract:

- `Executive Scorecard`: top-line operating health and config-window rollups
- `Analyst Insights Overview`: cross-cutting cohort, provider, and config pattern review
- `Telemetry & Provider Analytics`: provider and endpoint failure RCA
- `Live Trade Monitor`: current open-risk and intervention priority
- `Candidate & Funnel Analytics`: discovery and decision evidence
- `Position & PnL Analytics`: position outcome and execution evidence
- `Config Change Impact & RCA`: config-window KPI and field-diff review
- `Source & Cohort Performance`: source-level and cohort-level comparison
- `Research & Dry-Run Analysis`: bounded research-run review

Shared base env:

- `GRAFANA_BASE_URL`

## Deep-Link Contract

The app should not pass more than these route-level facts:

- `/` opens `control` with time only
- `/telemetry` opens `telemetry` and may set `provider`
- candidate detail opens `candidate` with `mint`, `symbol`, and `source`
- position detail opens `position` with `positionId`, `mint`, and `symbol`

Grafana should honor that contract with dashboard variables and sensible defaults instead of requiring the app to send a giant filter payload.

## Shared Variable Contract

Rules:

- broad selectors before narrow selectors
- multi-select categorical filters by default
- fuzzy text filters for `mint`, `symbol`, and ids; exact-match textboxes were removed because they were useless
- one dependent chain at most, such as `provider -> endpoint`
- preserve time range and variable values in dashboard links
- keep filter semantics inside the generator so provisioned dashboards stay consistent

Common variables across the suite:

- `provider`
- `endpoint`
- `errorFamily`
- `source`
- `configVersion`
- `mint`
- `symbol`
- `positionId`
- `trigger`
- `candidateStatus`
- `rejectReason`
- `positionStatus`
- `exitReason`
- `exitProfile`
- `daypart`
- `securityRisk`
- `interventionBand`
- `runId`
- `runStatus`

## Datasource Strategy

- first choice: direct PostgreSQL datasource against the trading bot database
- first query surfaces: repo-owned SQL views for stable KPIs, raw tables only when RCA needs finer grain
- fallback only if needed: read-only backend routes for current-state contracts such as `/api/desk/home` or `/api/operator/diagnostics`

Do not design around Grafana transformations when the real fix is a missing SQL view or history table.

## Dashboard Jobs

### Control

Main question:
Why is the desk healthy, degraded, or blocked?

Needs:

- funnel and reject/exit trend cards
- provider error and unit-burn trend
- recent operator/system events
- settings snapshot

### Telemetry

Main question:
Which provider or endpoint is failing, slowing down, or burning too much quota, and since when?

Needs:

- provider calls and units over time
- endpoint error concentration
- latency and failure evidence
- recent raw payload failures

### Candidate

Main question:
Why did a token pass, defer, or fail?

Needs:

- candidate funnel trend
- reject-reason trend
- source and trigger mix
- candidate evidence tables and snapshot trail

### Position

Main question:
Why did this trade win, lose, or require intervention?

Needs:

- realized PnL and hold-time views
- exit-reason trend
- fill trail
- linked candidate and snapshot context

## Current Gaps

These are still upstream-data problems, not dashboard-layout problems:

- no stable daily realized-PnL trend view
- no true historical queue-depth or blocker-state timeline
- candidate and reject-reason views are still weak for source-level RCA
- telemetry views still need better endpoint-by-time and payload-failure rollups
- no durable execution-quality or intervention-history view

## Rules

- do not embed Grafana panels back into the app for the first pass
- do not build a single monster dashboard
- do not let Grafana-side transforms masquerade as missing history
- keep the app deep-link contract intact when dashboards evolve
- do not reintroduce top-of-dashboard `Purpose` text panels; the dashboard title, description, and links already carry that load
- prefer weighted rates and operating ratios over vanity max/min stats
- keep quick links consistent across dashboards so operators can pivot without rebuilding filters by hand

## 2026-04-11 Optimization Pass

The generated dashboards were audited and tightened in one pass.

What changed:

- removed the filler `Purpose` text panel from every dashboard
- converted categorical variables to multi-select regex-backed filters
- replaced exact-match text filters with contains search for `mint`, `symbol`, and ids
- added missing filters where the old dashboards were effectively blind:
  `configVersion` on candidate analytics
  `positionStatus` on position analytics
  `interventionBand` on the live monitor
  `errorFamily` on telemetry
  query-backed `runId` and `runStatus` on research
- added dependent endpoint filters off provider where endpoint scope matters
- replaced weak vanity stats with more decision-relevant KPIs:
  acceptance rate, exposure, affected endpoints, live-affecting path count, median position outcomes
- trimmed redundant charts and kept each dashboard closer to one job
- expanded cross-dashboard quick links so pivots are faster and preserve time and variables
- standardized shared tooltip mode and Monday week start across the suite

Generator rule:

- edit `trading_bot/grafana/scripts/build-dashboards.mjs`
- regenerate JSON from the script
- do not hand-edit the emitted dashboard JSON unless the generator itself is being retired

## Evidence

- [Dashboard Control Desk Audit](../investigations/2026-04-10-dashboard-control-desk-audit.md)
- [Dashboard Workstream Summary](../sessions/2026-04-11-dashboard-workstream-summary.md)
- [API Surface](../reference/api-surface.md)
- [Prisma And Views](../reference/prisma-and-views.md)
