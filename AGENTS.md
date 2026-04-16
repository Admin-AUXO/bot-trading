# bot-trading Codex Guide

Use this file to orient at repo root. Almost all changes belong under `trading_bot/`. Once you are there, also follow `trading_bot/AGENTS.md`.

## Session Startup Order

For every new Codex session in this repo, read files in this order before opening code:

1. `AGENTS.md`
2. `notes/README.md`
3. `notes/reference/index.md`
4. Only the task-relevant reference docs and memory notes under `notes/`
5. `trading_bot/AGENTS.md` if the task will touch `trading_bot/`
6. `graphify-out/GRAPH_REPORT.md` if it exists and the task needs architecture or ownership context
7. Only then read actual codebase files under `trading_bot/` or other source directories

Do not jump straight into source files before completing that read order.

## Current Repo

- One active app: the graduation trading bot in `trading_bot/`
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Providers: Birdeye and Helius
- Runtime: interval-driven in-process services
- `LIVE` is wired through Jupiter quote/swap plus Helius Sender, but it depends on a funded trading wallet and live env config
- Strategy runtime is now score-driven and budget-aware: adaptive sizing, score-aware exits, Birdeye lane pacing, pump-first discovery defaults, and pump-only live trading by default

## Default Work Areas

- `trading_bot/backend/src/engine/`: runtime loops, discovery, exits, execution
- `trading_bot/backend/src/services/`: provider clients, telemetry, config, budget pacing, snapshots
- `trading_bot/backend/prisma/`: schema and SQL views
- `trading_bot/dashboard/`: operator UI and proxy
- `notes/reference/`: canonical repo docs inside the Obsidian vault
- `notes/`: session memory, investigations, decisions, runbooks, and trading memory

## Rules

- Read `notes/README.md`, `notes/reference/index.md`, the relevant reference doc, and the relevant durable note before reading code. Read `graphify-out/GRAPH_REPORT.md` only when architecture or ownership context matters.
- Keep context tight: read one reference note and one durable note first, not whole folders.
- Prefer active summaries in `notes/sessions/`; use `notes/sessions/archive/` only when the active notes do not answer the question.
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
- Keep paths in repo-owned code, docs, notes, scripts, and examples relative to the repo or the relevant working directory. Do not commit user-specific absolute paths.
- If a task creates a reusable multi-step procedure, promote it into a skill instead of leaving it buried in a note.

## Standard Procedure

1. Read the startup path with the minimum useful scope.
2. For ambiguous, planning-heavy, or high-risk work, prefer Plan mode before broad file reads. Frame the task with goal, context, constraints, and done-when so scope and verification stay explicit.
3. Open one task-specific reference note and one task-specific durable note.
4. On non-trivial sessions, delegate a compact startup brief to a `gpt-5.4-mini` repo agent such as `session_briefer` before broad code reads so the main agent gets a concise summary of repo rules, recent handoff context, likely file ownership, and obvious risks.
5. Open code only after the note surface tells you where truth should live.
6. Make the smallest correct change.
7. Run the relevant checks, then review the diff for regressions, missing tests, and contract drift.
8. Before the final response on substantive tasks, delegate note cleanup and handoff prep to a `gpt-5.4-mini` repo agent such as `notes_curator`, then review the resulting doc diff before finishing.
9. Update the owning note in the same pass, and update the nearest index if you added, archived, or renamed durable notes or skills.
10. If the same workflow is likely to recur, create or update a skill and trim the note down to a pointer.

## Token Discipline

- Do not read whole note folders unless the task is note curation.
- Do not re-read archive handoffs when an active summary or durable note already owns the fact.
- Do not paste long command output or code into notes; link the file or summarize the finding.
- Prefer one canonical note update over repeating the same rule in several places.
- Use Graphify only for architecture or ownership questions, not as a default preflight on every task.
- Follow `notes/reference/tool-routing.md` for MCP and tool choice so agents do not waste context on overlapping surfaces.

## Session Context Optimization

- Treat the repo `.codex/config.toml` as the shared project default and the source of truth for `node ./.codex/scripts/install-mcp-config.cjs`. If a session is missing the expected MCP surface, refresh the user-scoped config block and restart Codex.
- Default MCP profile should stay compact. Enable broader MCP surfaces only when the task clearly needs browser automation, external docs, Grafana, Helius, or database reads.
- Prefer primary tools over helper duplicates. In practice: use `desktop_commander` as the repo file surface, `chrome_devtools` as the repo browser surface, and local notes/code before external research.
- Prefer repo-local skills under `.agents/skills/`. Do not rely on global skills for repo-specific workflows unless the skill is genuinely cross-repo.
- Keep the shared repo baseline at `approval_policy = "on-request"` and `sandbox_mode = "workspace-write"`. Use the `fast`, `deep`, `review`, or `full_access` profiles only when the task actually needs different reasoning or permissions.
- For ambiguous or planning-heavy work, prefer Plan mode before broad file reads. Use a structured prompt shape with goal, context, constraints, and done-when so scope and verification are explicit.
- Prefer `gpt-5.4-mini` agents for bounded read-heavy, note-curation, repo-contract, startup-brief, and other basic sidecar tasks.
- Prefer `gpt-5.3-codex` agents for implementation-focused write work inside an already-understood surface.
- Keep `gpt-5.4` for high-risk review or judgment-heavy work.
- Treat startup delegation as hook-assisted and shutdown delegation as a pre-final checklist item. Do not assume a real session-end hook exists unless the platform proves it.
- Keep one thread per coherent task. Fork only when the work truly branches.
- For longer tasks, use task queues and background terminals so the active thread is not flooded with shell output.
- Use compaction before the thread becomes bloated, and use lightweight git checkpoints like `git status` and `git diff --stat` before and after substantive work.

## Skill Promotion Rule

Create or update a skill when a workflow has most of these traits:

- it is a repeatable agent procedure, not one-off project memory
- it needs ordered steps, commands, or decision rules
- it has already appeared in multiple sessions, runbooks, or long prompts
- keeping it as a note would keep charging prompt tax every time

When a procedure becomes a skill:

- keep the skill concise and repo-owned
- trim the old runbook or note to a short pointer
- update the nearest index or reference note so future agents can find the skill quickly

## Core References

- `README.md`
- `notes/README.md`
- `notes/reference/index.md`
- `notes/reference/tech-stack.md`
- `notes/reference/bootstrap-and-docker.md`
- `notes/reference/tool-routing.md`
- `notes/reference/api-surface.md`
- `notes/reference/prisma-and-views.md`
- `notes/reference/strategy.md`
- `trading_bot/AGENTS.md`

## Verification

- Run the relevant checks for the area you changed.
- Review the final diff for regressions, missing tests, and instruction drift after the checks pass.
- If Prisma changed, run `npm run db:generate` before trusting TypeScript output.
- If dashboard code changed, make sure `trading_bot/dashboard` still builds.
- If backend runtime, routes, or schema changed, update the matching reference docs under `notes/reference/` before you finish.
- If the task leaves durable context behind, update the matching note under `notes/` before you finish.

## Graphify

- Repo-local graph workflow lives in `.agents/skills/graphify/SKILL.md`.
- Repo-local Obsidian workflow lives in `.agents/skills/obsidian/SKILL.md`.
- Use `node ./.codex/scripts/graphify.mjs build-local .` for the default full build path in this repo.
- The repo graph is code-only. `.md` and other non-code files are intentionally excluded.
- Use the repo-local `$graphify` skill for the supported local workflow in this repo.
- Graph output lives at `graphify-out/` in repo root.
- Repo memory notes live at `notes/` in repo root.
- Canonical repo docs also live inside the vault at `notes/reference/`.
- Before opening code for architecture or ownership work, read `graphify-out/GRAPH_REPORT.md` when it exists.
- After modifying code files, run `node ./.codex/scripts/graphify-rebuild.mjs` if `graphify-out/graph.json` already exists.
