---
name: grafana-dashboard-planning
description: use when the task is to plan Grafana dashboards or ask better dashboard requirements questions before implementation
trigger: $grafana-dashboard-planning
---

# $grafana-dashboard-planning

Use this before planning or redesigning Grafana dashboards.

## Read First

- `notes/decisions/2026-04-10-grafana-dashboard-plan.md`
- `notes/reference/api-surface.md`
- `notes/reference/prisma-and-views.md`

## Rules

- Start with dashboard jobs, not charts.
- Separate live monitoring, historical analytics, and RCA unless there is a hard reason to mix them.
- Ask what decision each dashboard must support in under two minutes.
- Ask which comparisons matter: prior period, prior config, or cohort vs cohort.
- Ask which dimensions need first-class filters.
- Ask what evidence must be visible without leaving Grafana.
- Ask what needs upstream SQL or history work instead of dashboard-side fakery.

## Required Outputs

- dashboard list
- purpose for each dashboard
- default filters and time range
- tables and drill paths, not just charts
- datasource mapping
- upstream SQL or backend work still required

## Failure Modes

- asking for charts before dashboard jobs
- mixing monitoring, analytics, and RCA into one surface
- treating filters as an afterthought
- using Grafana transforms to hide missing data models
