# bot-trading Codex Guide

Use this root guide to orient yourself. Most code changes belong under `trading_bot/`; once you are there, also follow `trading_bot/AGENTS.md`.

## Repo Reality

- Backend: TypeScript/Node, Express API, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Runtime state: in-process runtime wiring plus interval-driven background work
- Redis is still provisioned in compose and env files, but the checked-in app code does not currently instantiate a Redis client path
- Market integrations: Helius, Birdeye, Jupiter, plus Jito tip/config accounting
- Simulation mode is `TRADE_MODE="DRY_RUN"`, not `DRY_RUN=true`
- Trading defaults: about `$200` capital target and `5` maximum open positions

## Work Map

- Default to `trading_bot/` unless the task is root docs or Codex tooling
- `trading_bot/backend/src/`: runtime, services, API, strategies, workers
- `trading_bot/backend/prisma/`: Prisma schema, seed, SQL views
- `trading_bot/dashboard/`: Next.js app, features, hooks, shared UI

## Hard Rules

- Read `docs/README.md` and the relevant task docs before touching code.
- Prefer the smallest correct change.
- Treat live-trading paths as safety-critical.
- Do not create Prisma migration files. Use `trading_bot/backend/prisma/schema.prisma` and `trading_bot/backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` when schema and SQL views both matter.
- If a SQL view changes shape, drop and recreate it in `create_views.sql`.
- Provider calls belong in `trading_bot/backend/src/services/`; do not add quota-blind fetch paths.
- Keep dashboard auth centralized in `trading_bot/dashboard/app/api/[...path]/route.ts` and `trading_bot/dashboard/app/api/operator-session/route.ts`.
- Reuse `trading_bot/dashboard/hooks/use-dashboard-shell.ts` for runtime truth and `trading_bot/dashboard/hooks/use-dashboard-filters.ts` for analysis filters.
- Keep runtime scope separate from analysis scope. Capacity widgets must use runtime portfolio truth.
- Quota blockers come from provider quota state, not relabeled generic pause reasons.
- Weighted percentages must use underlying counts, not averages of aggregated ratios.
- Historical analytics must come from immutable trades, positions, or snapshots.
- Keep dashboard colors on semantic CSS variables from `trading_bot/dashboard/app/globals.css` and `trading_bot/dashboard/lib/chart-colors.ts`.
- If behavior, contracts, workflows, setup, or operator expectations change, update the matching docs in the same pass.

## Main References

- `README.md`
- `docs/README.md`
- `trading_bot/AGENTS.md`
- `trading_bot/dashboard/README.md`
- `.agents/skills/docs-editor/SKILL.md`
- `.agents/skills/database-safety/SKILL.md`
- `.agents/skills/strategy-safety/SKILL.md`
- `.agents/skills/performance-investigation/SKILL.md`
- `.agents/skills/analytics-advice/SKILL.md`
- `.agents/skills/trading-research-workflow/SKILL.md`

For domain-heavy work, check `.codex/agents/`.

## MCP Defaults

- Code tracing: `filesystem` plus shell search tools like `rg`
- Docs and setup verification: `filesystem` + `desktop_commander`
- DB and Prisma safety: `postgres` + `filesystem`
- Dashboard verification: `chrome_devtools` or `browsermcp`
- External docs: `context7` first, then `fetch`

## Verification

Before finishing:

- Run the relevant checks for the changed area.
- Verify behavior, not just syntax.
- Remove dead imports, dead code, and placeholder fixes.
- If Prisma changed, run Prisma generate before trusting TypeScript output.
- If routes, runtime behavior, or operator controls changed, update the matching docs.
- For dashboard work, prove the build path is green and keep search-param hooks behind the required Suspense boundary.
