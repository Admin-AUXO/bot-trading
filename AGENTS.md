# bot-trading Codex Guide

Use this file to orient at repo root. Almost all changes belong under `trading_bot/`. Once you are there, also follow `trading_bot/AGENTS.md`.

## Current Repo

- One active app: the S2 graduation bot in `trading_bot/`
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Providers: Birdeye and Helius
- Runtime: interval-driven in-process services
- `LIVE` is wired through Jupiter quote/swap plus Helius Sender, but it depends on a funded trading wallet and live env config
- Strategy runtime is now score-driven and budget-aware: adaptive sizing, score-aware exits, Birdeye lane pacing, all-source discovery, and pump-only live trading by default

## Default Work Areas

- `trading_bot/backend/src/engine/`: runtime loops, discovery, exits, execution
- `trading_bot/backend/src/services/`: provider clients, telemetry, config, budget pacing, snapshots
- `trading_bot/backend/prisma/`: schema and SQL views
- `trading_bot/dashboard/`: operator UI and proxy
- `docs/`: canonical docs

## Rules

- Read `docs/README.md` and the relevant task doc before editing code.
- Prefer the smallest correct change.
- Treat entries, exits, and capital checks as safety-critical.
- Verify strategy claims against `docs/strategy.md` and the current engine code before repeating them elsewhere.
- Do not create Prisma migration files.
- Keep schema changes in `trading_bot/backend/prisma/schema.prisma`.
- Keep SQL view changes in `trading_bot/backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` when schema and views both matter.
- Keep provider calls inside `trading_bot/backend/src/services/`.
- Keep browser-facing writes going through `trading_bot/dashboard/app/api/[...path]/route.ts`.
- Keep historical analysis grounded in candidates, positions, fills, snapshots, or provider telemetry.
- Update docs in the same pass when contracts, setup, or operator expectations change.

## Core References

- `README.md`
- `docs/README.md`
- `docs/tech-stack.md`
- `docs/bootstrap-and-docker.md`
- `docs/api-surface.md`
- `docs/prisma-and-views.md`
- `docs/strategy.md`
- `trading_bot/AGENTS.md`

## Verification

- Run the relevant checks for the area you changed.
- If Prisma changed, run `npm run db:generate` before trusting TypeScript output.
- If dashboard code changed, make sure `trading_bot/dashboard` still builds.
- If backend runtime, routes, or schema changed, update the matching docs before you finish.
