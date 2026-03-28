# trading_bot Codex Guide

This file applies to work inside `trading_bot/` and is more specific than the repo-root guide.

## Core Rules

- Use `backend/src/utils/logger.ts`; do not add `console.log`, `console.warn`, or `console.error`.
- This is a TypeScript ESM codebase. Relative imports should use `.js` extensions.
- Keep configuration in the existing config system under `backend/src/config/`.
- Preserve existing circuit breaker, retry, and rate-limit patterns around external APIs.
- Avoid unnecessary code comments.
- Prefer minimal, reversible changes over large refactors.
- Do not create Prisma migration files. Keep schema changes in `backend/prisma/schema.prisma` and DB rollout SQL in `backend/prisma/views/create_views.sql`.
- Control-plane writes must stay behind bearer auth. If a route mutates runtime behavior, positions, or profiles, assume auth is required unless a narrower rule is documented.
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
npm run db:studio
```

From `trading_bot/dashboard/`:

```bash
npm run dev
npm run build
```

## Required References

Use the matching rule doc before making non-trivial changes:

- `typescript-patterns.md`
- `trading-security.md`
- `prisma-patterns.md`
- `api-routes.md`
- `dashboard-patterns.md`
- `solana-api-patterns.md`
- `strategy-patterns.md`
- `testing-patterns.md`

## Done Criteria

Do not mark work complete until:

- The changed area has been verified with the relevant command or behavior check
- Error handling still surfaces failures clearly
- No new hardcoded secrets, unsafe defaults, or silent fallbacks were introduced
- Dashboard filters and analytics requests stay mode-aware and parameter-consistent end to end when the changed area touches UI data flow
