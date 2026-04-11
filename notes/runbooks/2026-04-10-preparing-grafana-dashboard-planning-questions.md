---
type: runbook
status: active
area: grafana
date: 2026-04-10
source_files:
  - .agents/skills/grafana-dashboard-planning/SKILL.md
  - notes/decisions/2026-04-10-grafana-dashboard-plan.md
graph_checked: 2026-04-10
next_action: Reuse this before any future dashboard-planning session so the discussion starts with dashboard jobs, datasets, and decisions instead of vague chart requests.
---

# Runbook - Preparing Grafana Dashboard Planning Questions

The planning procedure now lives in the repo skill:
[`.agents/skills/grafana-dashboard-planning/SKILL.md`](../../.agents/skills/grafana-dashboard-planning/SKILL.md)

Use the skill when the task is to plan or re-scope Grafana dashboards before implementation.

## Durable Rules

- start with dashboard jobs, not charts
- separate monitoring, analytics, and RCA unless there is a hard reason to mix them
- ask what decision each dashboard must support
- ask which comparisons, filters, tables, and drill paths are required
- ask what needs upstream SQL or backend work instead of Grafana-side fakery

## Linked Notes

- [2026-04-10 Grafana Dashboard Plan](../decisions/2026-04-10-grafana-dashboard-plan.md)
- [API Surface](../reference/api-surface.md)
- [Prisma And Views](../reference/prisma-and-views.md)
