# bot-trading Codex Guide

Use this file to orient at repo root. Almost all changes belong under `trading_bot/`. Once you are there, also follow `trading_bot/AGENTS.md`.

## Session Startup Order

For every new Codex session in this repo, read files in this order before opening code:

1. `AGENTS.md`
2. `notes/README.md`
3. `notes/reference/index.md`
4. Only the task-relevant reference docs and memory notes under `notes/`
5. `trading_bot/AGENTS.md` if the task will touch `trading_bot/`
6. `graphify-out/GRAPH_REPORT.md` if it exists
7. Only then read actual codebase files under `trading_bot/` or other source directories

Do not jump straight into source files before completing that read order.

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
- `notes/reference/`: canonical repo docs inside the Obsidian vault
- `notes/`: session memory, investigations, decisions, runbooks, and trading memory

## Rules

- Read `notes/README.md`, `notes/reference/index.md`, the relevant reference doc, relevant notes under `notes/`, and `graphify-out/GRAPH_REPORT.md` if it exists before reading code.
- Prefer the smallest correct change.
- Treat entries, exits, and capital checks as safety-critical.
- Verify strategy claims against `notes/reference/strategy.md` and the current engine code before repeating them elsewhere.
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
- `notes/README.md`
- `notes/reference/index.md`
- `notes/reference/tech-stack.md`
- `notes/reference/bootstrap-and-docker.md`
- `notes/reference/api-surface.md`
- `notes/reference/prisma-and-views.md`
- `notes/reference/strategy.md`
- `trading_bot/AGENTS.md`

## Verification

- Run the relevant checks for the area you changed.
- If Prisma changed, run `npm run db:generate` before trusting TypeScript output.
- If dashboard code changed, make sure `trading_bot/dashboard` still builds.
- If backend runtime, routes, or schema changed, update the matching reference docs under `notes/reference/` before you finish.
- If the task leaves durable context behind, update the matching note under `notes/` before you finish.

## Graphify

- Repo-local graph workflow lives in `.agents/skills/graphify/SKILL.md`.
- Repo-local Obsidian workflow lives in `.agents/skills/obsidian/SKILL.md`.
- Use `$(git rev-parse --show-toplevel)/.codex/scripts/graphify.sh build-local .` for the default full build path in this repo.
- The repo graph is code-only. `.md` and other non-code files are intentionally excluded.
- Use the repo-local `$graphify` skill when you specifically want the upstream interactive workflow.
- Graph output lives at `graphify-out/` in repo root.
- Repo memory notes live at `notes/` in repo root.
- Canonical repo docs also live inside the vault at `notes/reference/`.
- Before opening code for architecture or implementation work, read `graphify-out/GRAPH_REPORT.md` when it exists.
- After modifying code files, run `$(git rev-parse --show-toplevel)/.codex/scripts/graphify-rebuild.sh` if `graphify-out/graph.json` already exists.
