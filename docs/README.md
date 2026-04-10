# Docs

Canonical doc set for coding agents. Read the file that answers the question in front of you; do not fan out across the whole tree just to recover one contract.

## Route By Task

- Repo shape, ownership boundaries, and non-features: [`tech-stack.md`](tech-stack.md)
- Setup modes, env handling, Docker flow, and verification commands: [`bootstrap-and-docker.md`](bootstrap-and-docker.md)
- Backend routes, dashboard proxy behavior, and auth rules: [`api-surface.md`](api-surface.md)
- Prisma schema ownership, evidence tables, SQL views, and reporting rules: [`prisma-and-views.md`](prisma-and-views.md)
- S2 discovery, evaluation, risk, and exit flow: [`strategy.md`](strategy.md)

## Minimum Read Order

1. [`../AGENTS.md`](../AGENTS.md)
2. The one task-specific doc you actually need
3. [`../trading_bot/AGENTS.md`](../trading_bot/AGENTS.md) once you are editing inside `trading_bot/`

## Editing Standard

- Verify commands, paths, env vars, routes, and runtime claims against code before editing.
- Prefer one canonical statement over repeated reminders across multiple docs.
- Delete stale docs instead of preserving historical noise.
- Keep this tree agent-facing: no onboarding fluff, no operator walkthroughs, no product copy.
