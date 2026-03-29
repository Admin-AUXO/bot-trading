# trading_bot Codex Guide

This guide applies to work inside `trading_bot/` and overrides the root guide where it is more specific.

## Core Rules

- Before editing code, read `../docs/README.md` and the most relevant docs for the area first:
  strategy work -> `../docs/strategies/`
  dashboard work -> `../docs/dashboard/` and `../docs/workflows/`
  backend/runtime/API work -> `../docs/architecture/` and `../docs/backend/`
  schema/DB work -> `../docs/data/` and `../docs/operations/`
- Use `backend/src/utils/logger.ts`; do not add new `console.*` logging in runtime code.
- This is a TypeScript ESM codebase. Relative imports use `.js` extensions.
- Keep configuration in `backend/src/config/`.
- Provider calls belong in the shared services under `backend/src/services/`, including Jupiter. Do not bolt on raw provider fetches or quota-blind side paths.
- Preserve existing retry, rate-limit, cache, and circuit-breaker patterns around external APIs.
- Prefer minimal, reversible changes.
- Do not create Prisma migration files. Use `backend/prisma/schema.prisma` and `backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` for real DB bootstrap. `db:push` syncs tables only; views are separate.
- Keep Docker and local Node majors aligned with the current `node:24-alpine` images.
- If `backend/prisma/views/create_views.sql` changes a view shape, drop and recreate that view before `CREATE VIEW`.
- Preserve quota classification. Exits, execution follow-through, and wallet reconciliation stay essential. Discovery, scoring, analytics enrichment, and backfills degrade first.
- Control-plane writes stay behind bearer auth. Keep dashboard proxy auth centralized in `dashboard/app/api/[...path]/route.ts` and `dashboard/app/api/operator-session/route.ts`.
- `/api/overview` rejects non-active scope requests. `/api/control/*` reads are always runtime-scope. `/api/overview/api-usage` only narrows endpoint rows by `mode/profile`.
- Reuse `dashboard/hooks/use-dashboard-shell.ts` for runtime chrome state and `dashboard/hooks/use-dashboard-filters.ts` for page-level analysis filters.
- Keep runtime scope separate from analysis filters. Chrome and control surfaces reflect the live lane; analysis pages may inspect other lanes.
- Capacity, quota, and weighted analytics rules are safety rules, not cosmetic preferences.
- Manual entry, manual exit, follow-on buys, and delayed tranches must obey the same capital, reserve, pause, and sizing checks as automated paths.
- Keep strategy config coherent end to end. Profile overrides must flow through entry, execution, exits, and control surfaces together.
- Workers must use the shared Prisma path in `backend/src/db/client.ts`; do not construct ad-hoc Prisma clients.
- Historical stats must come from immutable trade or snapshot history, not current singleton runtime state.
- `reconcile-wallet` only exists in LIVE mode.
- If a code change affects behavior, contracts, or workflow, update the matching docs in `../docs/` in the same pass.

## Working Map

- `backend/src/index.ts`: thin process entrypoint
- `backend/src/bootstrap/runtime.ts`: runtime assembly, service wiring, API startup, shutdown
- `backend/src/bootstrap/intervals.ts`: periodic tasks, quota sync/persist, wallet scoring, backfills
- `backend/src/api/routes/`: route groups for overview, positions, trades, analytics, control, profiles
- `backend/src/core/`: risk, execution, exits, runtime state, API budgets
- `backend/src/services/`: Helius, Birdeye, Jupiter, market ticks, outcomes
- `backend/src/strategies/`: entry logic for S1/S2/S3
- `backend/src/workers/` and `backend/src/core/stats-aggregator.ts`: background aggregation worker path
- `backend/prisma/`: schema, seed, views
- `dashboard/features/`: route-owned UI implementations
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

- The changed area has been verified with the relevant command or behavior check.
- Error handling still exposes failures clearly.
- No hardcoded secrets, unsafe defaults, or silent fallbacks were introduced.
- If provider budget behavior changed, shared services, intervals, API responses, and docs were updated together.
- If dashboard data flow changed, query keys, request params, and backend filters still agree end to end.
- Docker/startup changes still preserve `db-setup -> backend healthy -> dashboard starts`.
