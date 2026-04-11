---
type: reference
status: active
area: repo
date: 2026-04-10
source_files: []
graph_checked:
next_action:
---

# Reference Index

Canonical repo docs live inside the Obsidian vault so Codex can read and update docs, durable memory, and active workstream summaries from one place.

## Route By Task

- Agent workflow, questioning discipline, and vault update rules: [`agent-workflow.md`](agent-workflow.md)
- Repo shape, ownership boundaries, and non-features: [`tech-stack.md`](tech-stack.md)
- Dashboard naming, typography, layout rules, and operator UI contract: [`dashboard-operator-ui.md`](dashboard-operator-ui.md)
- Setup modes, env handling, Docker flow, and verification commands: [`bootstrap-and-docker.md`](bootstrap-and-docker.md)
- Graphify workflow and repo-local wrapper commands: [`graphify.md`](graphify.md)
- Obsidian workflow, Docker sidecar, and note discipline: [`obsidian.md`](obsidian.md)
- MCP and tool routing defaults for token-efficient agent work: [`tool-routing.md`](tool-routing.md)
- Backend routes, dashboard proxy behavior, and auth rules: [`api-surface.md`](api-surface.md)
- Prisma schema ownership, evidence tables, SQL views, and reporting rules: [`prisma-and-views.md`](prisma-and-views.md)
- S2 discovery, evaluation, risk, and exit flow: [`strategy.md`](strategy.md)

## Minimum Read Order

1. [`../../AGENTS.md`](../../AGENTS.md)
2. [`../README.md`](../README.md)
3. [`agent-workflow.md`](agent-workflow.md) only when the task is planning-heavy, ambiguous, or likely to create durable guidance
4. The one task-specific reference doc you actually need
5. The one relevant durable note under `../sessions/`, `../investigations/`, `../decisions/`, `../runbooks/`, or `../trading-memory/`
6. [`../../graphify-out/GRAPH_REPORT.md`](../../graphify-out/GRAPH_REPORT.md) only when architecture or ownership context matters
7. [`../../trading_bot/AGENTS.md`](../../trading_bot/AGENTS.md) once you are editing inside `trading_bot/`
8. Only after that should you open code files

## Editing Standard

- Verify commands, paths, env vars, routes, and runtime claims against code before editing.
- Prefer one canonical statement over repeated reminders across multiple notes.
- Delete stale notes instead of preserving historical noise.
- Archive dead handoffs instead of keeping every session in the active read path.
- Update durable memory notes when a task teaches the repo something worth remembering.
