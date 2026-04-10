# trading_bot Codex Guide

This guide applies inside `trading_bot/`.

## Session Startup Order

If a task will touch anything under `trading_bot/`, the required read order is:

1. `../AGENTS.md`
2. `../notes/README.md`
3. `../notes/reference/index.md`
4. The task-relevant reference docs and memory notes in `../notes/`
5. `../graphify-out/GRAPH_REPORT.md` if it exists
6. `trading_bot/AGENTS.md`
7. Only then open files under `backend/`, `dashboard/`, or other source directories

Do not skip ahead to source files before that sequence.

## Reality

- This directory is the active app.
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Strategy scope: S2 graduation only
- Providers: Birdeye and Helius
- `LIVE` is available when the trading wallet and live-routing env are configured
- Runtime behavior now includes adaptive position sizing, score-aware exit profiles, dayparted discovery cadence, and Birdeye lane-budget pacing
- Discovery can scan all supported Birdeye graduation venues, but live trading remains `pump_dot_fun`-only until `TRADABLE_SOURCES` is widened

## Rules

- Read `../notes/README.md`, `../notes/reference/index.md`, the relevant reference doc, relevant notes under `../notes/`, and `../graphify-out/GRAPH_REPORT.md` if it exists before reading code.
- Treat entry, exit, and capital rules as safety-critical.
- When strategy logic changes, check `backend/src/engine/` and `../notes/reference/strategy.md` together so the docs keep pace with the runtime.
- Do not create Prisma migration files.
- Keep schema edits in `backend/prisma/schema.prisma`.
- Keep SQL view edits in `backend/prisma/views/create_views.sql`.
- Keep provider integrations in `backend/src/services/`.
- Keep browser-facing writes on `dashboard/app/api/[...path]/route.ts`.
- Update docs in the same pass when setup, routes, or runtime behavior changes.

## Graphify

- The repo-level graph lives at `../graphify-out/`.
- Repo memory notes live at `../notes/`.
- Canonical repo docs also live inside the vault at `../notes/reference/`.
- If the graph does not exist yet, build it from repo root with `$(git rev-parse --show-toplevel)/.codex/scripts/graphify.sh build-local .`.
- The repo graph is code-only; markdown docs are intentionally excluded.
- Before opening code for architecture or ownership questions, read `../graphify-out/GRAPH_REPORT.md` when it exists.
- After modifying code files in `trading_bot/`, run `$(git rev-parse --show-toplevel)/.codex/scripts/graphify-rebuild.sh` if the repo graph already exists.
