# Reference Docs

Canonical docs for agents. Each note is the single source of truth for its area.

## Docs

| Doc | Covers |
|-----|--------|
| [agent-workflow.md](agent-workflow.md) | Agent workflow, questioning rules, vault hygiene |
| [tech-stack.md](tech-stack.md) | Repo shape, ownership, stack |
| [obsidian.md](obsidian.md) | Vault workflow, Docker sidecar |
| [tool-routing.md](tool-routing.md) | MCP defaults, token-efficient tool choice |
| [bootstrap-and-docker.md](bootstrap-and-docker.md) | Setup, env, Docker, verification |
| [api-surface.md](api-surface.md) | Backend routes, dashboard proxy, auth |
| [prisma-and-views.md](prisma-and-views.md) | Schema, SQL views, reporting |
| [strategy.md](strategy.md) | Discovery, evaluation, risk, exits |
| [dashboard-operator-ui.md](dashboard-operator-ui.md) | UI naming, typography, layout |
| [grafana-portfolio.md](grafana-portfolio.md) | Grafana dashboards, generator |
| [graphify.md](graphify.md) | Repo graph workflow |
| [drafts-and-implementation-truth.md](drafts-and-implementation-truth.md) | Repo-root `draft_*.md` vs code: landed seams, open proof, habits |

## Read Order

1. `../../AGENTS.md`
2. `../README.md`
3. `drafts-and-implementation-truth.md` ← when work touches repo-root `draft_*.md` plans or phase-6 seams
4. `agent-workflow.md` ← only if planning-heavy or ambiguous
5. one task-specific ref doc
6. one task-specific durable note
7. `../../graphify-out/GRAPH_REPORT.md` ← only if architecture/ownership matters
8. `../../trading_bot/AGENTS.md` ← only if touching `trading_bot/`

## Edit Rules

- Verify claims against code before editing.
- One canonical statement, not repeated reminders.
- Delete stale notes, don't preserve noise.
- Update durable memory when a task teaches something worth keeping.
