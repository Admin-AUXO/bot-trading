# Implementation Docs

This folder is for future Codex and AI-agent work. It documents real code paths, scope rules, and invariants. If behavior changes, update the matching doc in the same pass.

## Read Order

1. `architecture/tech-stack.md`
2. `architecture/backend-runtime.md`
3. `data/prisma-and-views.md`
4. `workflows/control-and-auth.md`
5. `workflows/profiles-and-runtime-scope.md`
6. `workflows/quota-and-provider-budgets.md`
7. `dashboard/overview.md`
8. `strategies/overview.md`

## Doc Map

- `architecture/tech-stack.md`: stack, infrastructure, and what is actually in use
- `architecture/backend-runtime.md`: backend startup order, runtime wiring, and periodic work
- `backend/api-surface.md`: API routes, auth boundaries, and route-specific caveats
- `data/prisma-and-views.md`: schema ownership, SQL views, and analytics data shape
- `operations/bootstrap-and-docker.md`: local bootstrap, prod compose contract, and rollout order
- `strategies/overview.md`: how S1, S2, and S3 differ and what they share
- `strategies/s1-copy-trade.md`: elite-wallet copy-trade flow
- `strategies/s2-graduation.md`: graduation scanner and delayed-entry flow
- `strategies/s3-momentum.md`: momentum scan and tranche logic
- `dashboard/overview.md`: dashboard provider stack, proxy/auth flow, shared shell state, and SSE behavior
- `dashboard/pages.md`: route-by-route dashboard features and data sources
- `workflows/control-and-auth.md`: operator-session flow and control-plane write rules
- `workflows/quota-and-provider-budgets.md`: quota accounting, degradation rules, and quota UI semantics
- `workflows/profiles-and-runtime-scope.md`: runtime lane vs analysis lane and profile-switching rules

## Usage Rules

- Verify claims against code before editing the docs.
- Prefer file references over vague summaries.
- Keep runtime scope, analysis scope, and auth scope separate in both code and docs.
- Do not describe BullMQ, background queues, or Redis workers here unless the code actually grows them.
