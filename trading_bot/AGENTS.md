# trading_bot Codex Guide

This guide applies inside `trading_bot/`.

## Session Startup Order

If a task will touch anything under `trading_bot/`, the required read order is:

1. `../AGENTS.md`
2. `../notes/README.md`
3. `../notes/reference/index.md`
4. The task-relevant reference docs and memory notes in `../notes/`
5. `../graphify-out/GRAPH_REPORT.md` if it exists and the task needs architecture or ownership context
6. `trading_bot/AGENTS.md`
7. Only then open files under `backend/`, `dashboard/`, or other source directories

Do not skip ahead to source files before that sequence.

## Reality

- This directory is the active app.
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Strategy scope: graduation trading only
- Providers: Birdeye and Helius
- `LIVE` is available when the trading wallet and live-routing env are configured
- Runtime behavior now includes adaptive position sizing, score-aware exit profiles, dayparted discovery cadence, and Birdeye lane-budget pacing
- Discovery defaults to `pump_dot_fun`, and live trading remains `pump_dot_fun`-only until the desk widens sources deliberately

## Rules

- Read `../notes/README.md`, `../notes/reference/index.md`, the relevant reference doc, and the relevant durable note before reading code. Read `../graphify-out/GRAPH_REPORT.md` only when architecture or ownership context matters.
- Keep context tight: start with one reference note and one durable note, not whole note trees.
- Treat entry, exit, and capital rules as safety-critical.
- When strategy logic changes, check `backend/src/engine/` and `../notes/reference/strategy.md` together so the docs keep pace with the runtime.
- Do not create Prisma migration files.
- Keep schema edits in `backend/prisma/schema.prisma`.
- Keep SQL view edits in `backend/prisma/views/create_views.sql`.
- Keep provider integrations in `backend/src/services/`.
- Keep browser-facing writes on `dashboard/app/api/[...path]/route.ts`.
- Update docs in the same pass when setup, routes, or runtime behavior changes.
- Keep paths in repo-owned code, docs, notes, scripts, and examples relative to the repo or current package. Do not commit user-specific absolute paths.
- If a repeated operational or research workflow appears, promote it into a repo skill and trim the note that used to carry it.

## Standard Procedure

1. Read the minimum note surface that can answer the task.
2. Trace the real code path.
3. Change the smallest correct file set.
4. Verify the changed area.
5. Update the owning reference or durable note, and refresh the nearest index if you added, archived, or renamed durable notes or skills.
6. If the workflow will recur, create or update a skill instead of preserving a fat handoff.

## Token Discipline

- Do not read whole note trees unless the task is note curation.
- Prefer one reference note and one durable note before widening scope.
- Prefer active summaries over archive handoffs.
- Prefer one owning note update over several overlapping note edits.
- Use Graphify only when architecture or ownership context matters.
- Follow `../notes/reference/tool-routing.md` for MCP and tool choice; default to the cheapest sufficient surface.

## Skill Promotion Rule

Create or update a skill when a workflow is repeatable, ordered, and likely to recur across sessions.

When a procedure becomes a skill:

- keep the skill concise and repo-owned
- trim the old note or runbook to a pointer plus durable constraints
- update the nearest index so future agents can find it without rereading handoffs

## Graphify

- The repo-level graph lives at `../graphify-out/`.
- Repo memory notes live at `../notes/`.
- Canonical repo docs also live inside the vault at `../notes/reference/`.
- If the graph does not exist yet, build it from repo root with `node ./.codex/scripts/graphify.mjs build-local .`.
- The repo graph is code-only; markdown docs are intentionally excluded.
- Before opening code for architecture or ownership questions, read `../graphify-out/GRAPH_REPORT.md` when it exists.
- After modifying code files in `trading_bot/`, run `node ./.codex/scripts/graphify-rebuild.mjs` from repo root if the repo graph already exists.
