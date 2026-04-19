# bot-trading — Agent Guide

Authoritative guide for all agent harnesses (Claude Code, Codex, etc.). Keep this short; move durable context to `[notes/](notes/)`.

## Repo at a glance

- One active app: the graduation trading bot in `[trading_bot/](trading_bot/)` (also see `[trading_bot/AGENTS.md](trading_bot/AGENTS.md)`).
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16. Dashboard: Next.js 16.
- Providers: Birdeye + Helius. `LIVE` = Jupiter + Helius Sender, requires funded wallet + env.
- Strategy is score-driven, budget-aware, pump-first; live trading defaults to pump-only until the desk widens sources deliberately.

## Session startup (minimum useful read)

1. This file.
2. `[notes/README.md](notes/README.md)` → `[notes/reference/index.md](notes/reference/index.md)`.
3. One task-specific reference doc + one relevant durable note.
4. `[trading_bot/AGENTS.md](trading_bot/AGENTS.md)` if the task touches `trading_bot/`.
5. `[graphify-out/README.md](graphify-out/README.md)` or `[graphify-out/GRAPH_REPORT_COMPACT.md](graphify-out/GRAPH_REPORT_COMPACT.md)` for architecture/ownership context.

For non-trivial sessions, delegate a compact startup brief to a small model (Claude Haiku or `gpt-5.4-mini` via `session_briefer`) before broad code reads.

## Rules

**Safety-critical** — entries, exits, capital checks. Verify any strategy claim against `[notes/reference/strategy.md](notes/reference/strategy.md)` and engine code together.

**Code boundaries**

- Schema edits → `[trading_bot/backend/prisma/schema.prisma](trading_bot/backend/prisma/schema.prisma)`. **No migration files.**
- SQL view edits → `[trading_bot/backend/prisma/views/create_views.sql](trading_bot/backend/prisma/views/create_views.sql)`.
- Provider integrations → `[trading_bot/backend/src/services/](trading_bot/backend/src/services/)` only.
- Browser-facing writes → `[trading_bot/dashboard/app/api/[...path]/route.ts](trading_bot/dashboard/app/api/)`.
- Historical analysis → candidates, positions, fills, snapshots, provider telemetry.
- Use relative paths in committed code/docs/notes — never user-specific absolute paths.

**Process**

- Smallest correct change. Update the owning note/doc in the same pass when contracts change.
- If a workflow recurs, promote it to a skill in `[.agents/skills/](.agents/skills/)` and trim the note.
- Prefer Plan mode for ambiguous or high-risk work; frame as goal / context / constraints / done-when.
- Read one reference note + one durable note before widening scope. Don't read whole note folders unless curating.

## Tooling

- MCP & tool routing → `[notes/reference/tool-routing.md](notes/reference/tool-routing.md)`.
- Default MCP profile stays compact. Enable Grafana/Helius/browser/db MCPs only when the task needs them.
- **Graph files** → `[graphify-out/README.md](graphify-out/README.md)` for guide, or:
  - Quick context: `graphify-out/GRAPH_QUICKREF.md` (~75 lines)
  - "Where is X implemented": `graphify-out/GRAPH_ACTIONS.md`
  - Data flow: `graphify-out/GRAPH_WORKFLOWS.md`
  - Skill selection: `graphify-out/GRAPH_SKILLS.md`
  - Cross-boundary maps: `graphify-out/GRAPH_MAPS.md`
  - Rebuild: `node ./.codex/scripts/graphify-rebuild.mjs` (after code changes)

## Harness specifics


| Harness     | Config                                                                                                                                           | Notes                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Claude Code | `[.claude/settings.json](.claude/settings.json)`, `[.claude/CLAUDE.md](.claude/CLAUDE.md)`                                                       | Subagents in `[.claude/agents/](.claude/agents/)`, commands in `[.claude/commands/](.claude/commands/)` |
| Codex       | `[.codex/config.toml](.codex/config.toml)`, agent TOMLs in `[.codex/agents/](.codex/agents/)`                                                    | Baseline: `approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`                          |
| OpenCode    | `[opencode.json](opencode.json)`, `[.opencode/agents/](.opencode/agents/)`, repo launcher at `[scripts/opencode.sh](scripts/opencode.sh)`       | Reuses repo `AGENTS.md`, `.agents/skills/`, and the shared MCP launchers from `.codex/` / `.mcp.json` |
| Shared      | `[.mcp.json](.mcp.json)`, `[.agents/skills/](.agents/skills/)`, `[.codex/scripts/session-start-hook.cjs](.codex/scripts/session-start-hook.cjs)` | Skills are repo-owned, harness-agnostic                                                                 |


Run `[scripts/claude-harness/run-all.sh](scripts/claude-harness/run-all.sh)` to lint skills, codex agents, MCP configs, and hooks before committing harness changes.

## Model routing (cost discipline)

- **Claude Code**: default model; use Haiku subagents for bounded read-heavy work.
- **Codex**: `gpt-5.4-mini` for read-heavy bounded tasks (briefs, note curation, research), `gpt-5.3-codex` for implementation, `gpt-5.4` for high-risk review.
- **OpenCode**: default to `minimax/MiniMax-M2.7-highspeed` in this repo, with `minimax/MiniMax-M2.7` as the lighter companion model. Launch through `[scripts/opencode.sh](scripts/opencode.sh)` so the repo env is loaded and Anthropic overrides are cleared first.
- **MiniMax-M2.7-highspeed**: use it via OpenCode in this repo, not through Codex routing. See `[opencode.json](opencode.json)` and `[scripts/opencode.sh](scripts/opencode.sh)`.

## Verification

- Run the relevant checks for the area you changed; review the final diff for regressions and instruction drift.
- Prisma changed → `npm run db:generate`.
- Dashboard changed → confirm `trading_bot/dashboard` builds.
- Backend routes/schema changed → update the matching `notes/reference/` doc.

## Core references

`[README.md](README.md)`, `[notes/README.md](notes/README.md)`, `[notes/reference/index.md](notes/reference/index.md)`, `[notes/reference/tech-stack.md](notes/reference/tech-stack.md)`, `[notes/reference/bootstrap-and-docker.md](notes/reference/bootstrap-and-docker.md)`, `[notes/reference/tool-routing.md](notes/reference/tool-routing.md)`, `[notes/reference/api-surface.md](notes/reference/api-surface.md)`, `[notes/reference/prisma-and-views.md](notes/reference/prisma-and-views.md)`, `[notes/reference/strategy.md](notes/reference/strategy.md)`.
