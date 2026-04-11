---
type: runbook
status: active
area: grafana
date: 2026-04-10
source_files:
  - notes/decisions/2026-04-10-grafana-dashboard-plan.md
  - notes/reference/api-surface.md
  - notes/reference/prisma-and-views.md
graph_checked: 2026-04-10
next_action: Reuse this before any future dashboard-planning session so the discussion starts with dashboard jobs, datasets, and decisions instead of vague chart requests.
---

# Runbook - Preparing Grafana Dashboard Planning Questions

## Purpose

Use this before asking for new Grafana dashboards or major dashboard redesigns.

The goal is to avoid useless prompts like "make better dashboards" and replace them with questions that force clarity on:

- dashboard audience
- dashboard job
- required comparisons
- required filters
- required evidence tables
- required upstream data work

## Preconditions

- Read `notes/reference/api-surface.md`.
- Read `notes/reference/prisma-and-views.md`.
- Read `notes/decisions/2026-04-10-grafana-dashboard-plan.md`.
- Know whether the request is for:
  scorecards, monitoring, analytics, RCA, research, or config-impact analysis.

## Steps

1. Start with dashboard families, not charts.
   Ask which families are needed:
   executive scorecards, operations monitoring, analyst insights, telemetry analytics, candidate analytics, position analytics, config impact, RCA, research.

2. Force one main question per dashboard.
   Good question:
   "What must this dashboard answer in under 2 minutes?"
   Bad question:
   "What charts do you want?"

3. Separate current-state monitoring from historical analytics.
   Ask whether the dashboard is for:
   live monitoring, historical analysis, or root-cause investigation.

4. Ask for comparison modes explicitly.
   Always check whether the user wants:
   current vs previous period,
   current vs previous config,
   or cohort vs cohort.

5. Ask which dimensions must become reusable filters.
   Typical examples:
   `source`, `provider`, `endpoint`, `mint`, `symbol`, `positionId`, `rejectReason`, `exitReason`, `configVersion`, `daypart`, `securityRisk`, `exitProfile`.

6. Ask which tables need to be first-class.
   Do not assume charts are enough.
   For this repo, useful table classes are:
   ranked leaderboards,
   dense evidence tables,
   and matrix or heatmap tables.

7. Ask what evidence must be visible without leaving Grafana.
   Typical examples:
   payload failures,
   candidate snapshots,
   fills,
   linked candidate context,
   config change logs.

8. Ask what time grain matters.
   Daily-only is often too blunt.
   For this repo, useful grains are:
   live or near-live,
   hourly,
   daily,
   and raw event evidence.

9. Ask what should be fixed upstream instead of faked in Grafana.
   The right question is:
   "If this analysis needs a new SQL view or backend history table, should we add it?"
   The default answer should be yes when the dashboard question is durable.

10. Ask how many dashboards are acceptable.
   This prevents both extremes:
   one bloated monster dashboard,
   or a landfill of duplicated dashboards.

11. Ask how Grafana should be deployed and managed.
   For this repo:
   same Compose stack is fine,
   same container as the trading bot is not.
   Also ask whether dashboards should be provisioned as code, built manually first, or both.

12. End by asking for the next deliverable.
   Good options:
   dashboard map,
   dashboard map plus datasource matrix,
   or dashboard map plus backend and SQL work plan.

## Verification

The planning questions are good enough when they let you produce all of the following without guesswork:

- a dashboard list
- a purpose for each dashboard
- default filters
- default time range
- scorecards
- charts
- tables
- heatmaps or matrices
- drill paths
- datasource mapping
- required new SQL views or backend changes

## Failure Modes

- Asking for charts before dashboard jobs.
- Mixing live monitoring, analytics, and RCA into one surface.
- Treating filters as an afterthought.
- Ignoring tables and evidence panels.
- Letting Grafana transformations substitute for missing data models.
- Building dashboards before deciding how config changes will be compared.
- Designing dashboards around what exists today when the real need clearly requires upstream data work.

## Linked Notes

- [2026-04-10 Grafana Dashboard Plan](../decisions/2026-04-10-grafana-dashboard-plan.md)
- [API Surface](../reference/api-surface.md)
- [Prisma And Views](../reference/prisma-and-views.md)
