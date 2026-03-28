# trading_bot Codex Guide

This file applies to work inside `trading_bot/` and is more specific than the repo-root guide.

## Core Rules

- Use `backend/src/utils/logger.ts`; do not add `console.log`, `console.warn`, or `console.error`.
- This is a TypeScript ESM codebase. Relative imports should use `.js` extensions.
- Keep configuration in the existing config system under `backend/src/config/`.
- Provider calls must go through `backend/src/services/helius.ts` and `backend/src/services/birdeye.ts`; do not bolt on raw provider fetches or quota-blind side workers.
- Preserve existing circuit breaker, retry, and rate-limit patterns around external APIs.
- Avoid unnecessary code comments.
- Prefer minimal, reversible changes over large refactors.
- Do not create Prisma migration files. Keep schema changes in `backend/prisma/schema.prisma` and DB rollout SQL in `backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` when you need the actual database bootstrap. `npm run db:push` syncs tables only; the dashboard views come from `backend/prisma/views/create_views.sql`.
- Keep Docker and local Node majors aligned when dependency locks change. The current Dockerfiles use `node:24-alpine` so Docker builds match the repo's current npm 11 lockfile behavior.
- If `backend/prisma/views/create_views.sql` changes a view's column layout, make the script idempotent for existing Docker volumes by dropping and recreating that view before `CREATE VIEW`.
- Preserve quota classification. Exits, execution follow-through, and wallet reconciliation are essential traffic; discovery, wallet scoring, analytics enrichment, and backfills should degrade first.
- Keep API-budget analytics dimensional. Service, endpoint, strategy, mode, config profile, purpose, essential/cache-hit state, and batch size must remain queryable.
- Control-plane writes must stay behind bearer auth. If a route mutates runtime behavior, positions, or profiles, assume auth is required unless a narrower rule is documented.
- Dashboard control auth stays centralized in `dashboard/app/api/[...path]/route.ts` and `dashboard/app/api/operator-session/route.ts`. New mutating dashboard actions should use that same boundary.
- Reuse `dashboard/lib/dashboard-query-options.ts` and `dashboard/hooks/use-dashboard-shell.ts` when changing dashboard data flow so query keys, request params, shared shell state, and layout chrome stay aligned.
- Keep active runtime scope separate from analysis filters. Chrome and control surfaces reflect the live runtime lane; `dashboard/hooks/use-dashboard-filters.ts` owns cross-lane inspection for positions, trades, analytics, and quota drill-downs.
- Dashboard views that mix lane-scoped, mode/profile-scoped, and global feeds must label that scope explicitly. Do not let a filtered page header imply every card obeys the same filters.
- Dashboard capacity UI must keep runtime portfolio slot truth separate from filtered subsets. Filtered row counts are not capacity.
- Quota UI must derive blockers from provider quota state, not from generic operator pause reasons with a convenient new label.
- When rolling up per-strategy percentages such as manual share, weight by the underlying trade counts instead of averaging the pre-aggregated ratios.
- Profile activation UI should surface tracked result context when the API already exposes it.
- Keep dashboard light/dark styling on semantic variables in `dashboard/app/globals.css` and `dashboard/lib/chart-colors.ts`; do not add page-local hard-coded chart or surface colors.
- Manual control paths must obey the same capital, reserve, and sizing checks as automated entry paths. Never validate overrides against only the default size.
- Workers must reuse the supported Prisma initialization path from `backend/src/db/client.ts`; do not construct ad-hoc Prisma clients for background jobs.
- Historical stats must be derived from immutable trade/snapshot history. Do not write past rows from current singleton runtime state.

## Safety-Critical Areas

Be especially careful in:

- `backend/src/core/`: trade execution, exits, position tracking, risk, regime behavior
- `backend/src/strategies/`: entry logic, skip logic, sizing, exit rules
- `backend/src/services/`: exchange and data-provider integrations
- `backend/prisma/`: schema, SQL views, seed

If a change can affect live trading behavior, validate the actual execution path and not just the immediate function.

## Working Map

- `backend/src/core/`: execution engine and portfolio lifecycle
- `backend/src/core/api-budget-manager.ts`: provider budget accounting, daily quota policy, and runtime pause semantics
- `backend/src/strategies/`: strategy-specific signal generation
- `backend/src/services/`: Helius, Birdeye, Jupiter, and related integrations
- `backend/src/api/`: Express routes and middleware
- `backend/src/workers/`: async workers and queue consumers
- `backend/src/db/`: Prisma client access
- `backend/src/utils/`: logger, rate limiter, circuit breaker, shared infra
- `dashboard/`: Next.js UI
- `backend/prisma/`: schema, views, seed

## Commands

From `trading_bot/backend/`:

```bash
npm run dev
npm run build
npm run typecheck
npm run db:push
npm run db:views
npm run db:setup
npm run db:studio
```

From `trading_bot/dashboard/`:

```bash
npm run dev
npm run build
```

## Required References

Use the matching rule doc before making non-trivial changes:

- `../AGENTS.md`
- `../README.md`
- `dashboard/README.md`
- `../.agents/skills/docs-editor/SKILL.md`
- `../.agents/skills/database-safety/SKILL.md`
- `../.agents/skills/strategy-safety/SKILL.md`
- `../.agents/skills/performance-investigation/SKILL.md`
- `../.agents/skills/analytics-advice/SKILL.md`
- `../.agents/skills/trading-research-workflow/SKILL.md`

## Done Criteria

Do not mark work complete until:

- The changed area has been verified with the relevant command or behavior check
- Error handling still surfaces failures clearly
- No new hardcoded secrets, unsafe defaults, or silent fallbacks were introduced
- If provider budget behavior changed, the shared services, runtime intervals, API responses, and docs were updated together
- Dashboard filters and analytics requests stay mode-aware and parameter-consistent end to end when the changed area touches UI data flow
- Docker or startup changes still preserve the `db-setup` bootstrap service, backend health gate, and dashboard-after-backend-health sequencing
