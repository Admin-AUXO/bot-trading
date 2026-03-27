# trading_bot Codex Guide

This file applies to work inside `trading_bot/` and is more specific than the repo-root guide.

## Core Rules

- Use `src/utils/logger.ts`; do not add `console.log`, `console.warn`, or `console.error`.
- This is a TypeScript ESM codebase. Relative imports should use `.js` extensions.
- Keep configuration in the existing config system under `src/config/`.
- Preserve existing circuit breaker, retry, and rate-limit patterns around external APIs.
- Avoid unnecessary code comments.
- Prefer minimal, reversible changes over large refactors.

## Safety-Critical Areas

Be especially careful in:

- `src/core/`: trade execution, exits, position tracking, risk, regime behavior
- `src/strategies/`: entry logic, skip logic, sizing, exit rules
- `src/services/`: exchange and data-provider integrations
- `prisma/`: schema, migrations, SQL views

If a change can affect live trading behavior, validate the actual execution path and not just the immediate function.

## Working Map

- `src/core/`: execution engine and portfolio lifecycle
- `src/strategies/`: strategy-specific signal generation
- `src/services/`: Helius, Birdeye, Jupiter, and related integrations
- `src/api/`: Express routes and middleware
- `src/workers/`: async workers and queue consumers
- `src/db/`: Prisma client access
- `src/utils/`: logger, rate limiter, circuit breaker, shared infra
- `dashboard/`: Next.js UI
- `prisma/`: schema, migrations, views, seed

## Commands

From `trading_bot/`:

```bash
npm run dev
npm run build
npm run typecheck
npm run db:migrate
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
