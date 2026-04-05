# bot-trading Codex Guide

Use this root guide to orient yourself. Most code changes belong under `trading_bot/`; once you are there, also follow `trading_bot/AGENTS.md`.

## Repo Reality

- Backend: TypeScript/Node, Express API, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Runtime state: in-process runtime wiring plus interval-driven background work
- Redis is still provisioned in compose and env files, but the checked-in app code does not currently instantiate a Redis client path
- Market integrations: Helius, Birdeye, Jupiter, plus Jito tip/config accounting
- Simulation mode is `TRADE_MODE="DRY_RUN"`, not `DRY_RUN=true`

Trading defaults:

- Capital target is about `$200`
- Maximum open positions is `5`

## Where To Work

Default to `trading_bot/` unless the task is root docs or Codex tooling.

- `trading_bot/backend/src/`: backend runtime, services, API, strategies, workers
- `trading_bot/backend/prisma/`: Prisma schema, seed, SQL views
- `trading_bot/dashboard/`: dashboard app, features, hooks, shared UI

## Hard Rules

- Before touching code, read `docs/README.md` and the most relevant task docs it points to. Use those docs to narrow the file set, then verify the claims against code.
- Read existing patterns before editing.
- Prefer the smallest correct change.
- Treat live-trading paths as safety-critical.
- Do not create Prisma migration files. Use `trading_bot/backend/prisma/schema.prisma` and `trading_bot/backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` when schema and SQL views both matter. `db:push` alone is incomplete.
- Keep Docker and local Node majors aligned. Current Dockerfiles use `node:24-alpine`.
- If a SQL view changes shape, make `create_views.sql` drop and recreate that view so existing Docker volumes stay safe.
- Provider calls belong in `trading_bot/backend/src/services/`; do not add quota-blind fetch paths around them.
- Control-plane writes are authenticated surfaces. Keep dashboard auth centralized in `trading_bot/dashboard/app/api/[...path]/route.ts` and `trading_bot/dashboard/app/api/operator-session/route.ts`.
- Reuse `trading_bot/dashboard/hooks/use-dashboard-shell.ts` for runtime chrome state and `trading_bot/dashboard/hooks/use-dashboard-filters.ts` for page-level analysis filters.
- Keep runtime scope separate from analysis scope. Label mixed-scope UI explicitly.
- Capacity widgets must use runtime portfolio truth, not filtered row counts.
- Quota blockers come from provider quota state, not generic pause reasons relabeled after the fact.
- Weighted percentages must use underlying counts, not averages of already-aggregated ratios.
- Historical analytics must come from immutable trades, positions, or snapshots, not mutable singleton runtime state.
- Keep query keys, URL params, and backend filters aligned when they vary by `days`, `mode`, `profile`, or `tradeSource`.
- Keep dashboard colors on semantic CSS variables from `trading_bot/dashboard/app/globals.css` and `trading_bot/dashboard/lib/chart-colors.ts`.
- If code changes behavior, contracts, workflows, setup, or operator expectations, update the matching docs in the same pass even if the prompt only asked for code.

## Main References

- Start at `docs/README.md`, then read the task-specific docs before code inspection.
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

## Codex MCP Defaults

Configured repo MCPs live in `.codex/config.toml`. Preferred pairings:

- Code tracing: `filesystem` plus shell search tools like `rg`
- Docs and setup verification: `filesystem` + `desktop_commander`
- DB and Prisma safety: `postgres` + `filesystem`
- Dashboard verification: `chrome_devtools` or `browsermcp`
- External docs: `context7` first, then `fetch`
- Multi-step investigations: add `sequential_thinking`

## Verification

Before finishing:

- Run the relevant checks for the area changed.
- Verify behavior, not just syntax.
- Remove dead imports, dead code, and placeholder fixes.
- If Prisma changed, run the Prisma generate step before trusting TypeScript output.
- If routes, runtime behavior, or operator controls changed, update the matching docs and guidance in the same pass.
- For dashboard work, prove the build path is green and make sure search-param hooks still sit behind the required Suspense boundary.
