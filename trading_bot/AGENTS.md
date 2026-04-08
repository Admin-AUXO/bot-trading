# trading_bot Codex Guide

This guide applies inside `trading_bot/` and overrides the root guide where it is more specific.

## Core Rules

- Read `../docs/README.md` and the relevant docs first:
  strategy work -> `../docs/strategies/`
  dashboard work -> `../docs/dashboard/` and `../docs/workflows/`
  backend/runtime/API work -> `../docs/architecture/` and `../docs/backend/`
  schema/DB work -> `../docs/data/` and `../docs/operations/`
- Use `backend/src/utils/logger.ts`; do not add new `console.*` logging in runtime code.
- This is a TypeScript ESM codebase. Relative imports use `.js` extensions.
- Keep configuration in `backend/src/config/`.
- Provider calls belong in `backend/src/services/`, including Jupiter. Preserve existing retry, rate-limit, cache, and circuit-breaker patterns.
- Prefer minimal, reversible changes.
- Do not create Prisma migration files. Use `backend/prisma/schema.prisma` and `backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` for real DB bootstrap. `db:push` updates tables only.
- Keep Docker and local Node majors aligned with `node:24-alpine`.
- If a view shape changes, drop and recreate it before `CREATE VIEW`.
- Preserve quota classification. Discovery, scoring, analytics enrichment, and backfills degrade before exits, execution follow-through, and reconciliation.
- Keep dashboard proxy auth centralized in `dashboard/app/api/[...path]/route.ts` and `dashboard/app/api/operator-session/route.ts`.
- `/api/overview` rejects non-active scope requests. `/api/control/*` reads are runtime-scope. `/api/overview/api-usage` only narrows endpoint rows by `mode/profile`.
- Reuse `dashboard/hooks/use-dashboard-shell.ts` for runtime truth and `dashboard/hooks/use-dashboard-filters.ts` for analysis filters.
- Keep runtime scope separate from analysis scope. Capacity, quota, and weighted analytics rules are safety rules.
- Manual entry, manual exit, follow-on buys, and delayed tranches must obey the same capital, reserve, pause, and sizing checks as automated paths.
- Historical stats must come from immutable trade or snapshot history, not current singleton runtime state.
- `reconcile-wallet` only exists in `LIVE`.
- If behavior, contracts, or workflow change, update the matching docs in `../docs/` in the same pass.

## Working Map

- `backend/src/index.ts`: process entrypoint
- `backend/src/bootstrap/runtime.ts`: runtime assembly, service wiring, startup, shutdown
- `backend/src/bootstrap/intervals.ts`: periodic tasks, quota sync/persist, wallet scoring, backfills
- `backend/src/api/routes/`: overview, positions, trades, analytics, control, profiles
- `backend/src/core/`: risk, execution, exits, runtime state, API budgets
- `backend/src/services/`: Helius, Birdeye, Jupiter, market ticks, outcomes
- `backend/src/strategies/`: S1, S2, S3 entry logic
- `backend/prisma/`: schema, seed, views
- `dashboard/features/`: route-owned UI
- `dashboard/hooks/`: shared shell, filters, SSE, shortcuts
- `dashboard/lib/`: API contracts, query options, theme helpers, server helpers

## Commands

From `trading_bot/backend/`:

```powershell
npm run dev
npm run build
npm run typecheck
npm run db:generate
npm run db:push
npm run db:views
npm run db:setup
npm run db:seed
npm run db:studio
```

From `trading_bot/dashboard/`:

```powershell
npm run dev
npm run build
npm run lint
npm run start
```

## Required References

- `../AGENTS.md`
- `../README.md`
- `../docs/README.md`
- `dashboard/README.md`
- `../.agents/skills/docs-editor/SKILL.md`
- `../.agents/skills/database-safety/SKILL.md`
- `../.agents/skills/strategy-safety/SKILL.md`
- `../.agents/skills/performance-investigation/SKILL.md`
- `../.agents/skills/analytics-advice/SKILL.md`
- `../.agents/skills/trading-research-workflow/SKILL.md`

## Done Criteria

Do not mark work complete until:

- the changed area has been verified with the relevant command or behavior check
- error handling still exposes failures clearly
- no hardcoded secrets, unsafe defaults, or silent fallbacks were introduced
- provider budget changes updated services, intervals, API responses, and docs together
- dashboard data flow still keeps query keys, request params, and backend filters aligned
- Docker/startup changes still preserve `db-setup -> backend healthy -> dashboard starts`
