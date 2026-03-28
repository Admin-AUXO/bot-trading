# bot-trading Codex Guide

Use this repository root file to orient Codex. Most implementation work happens in `trading_bot/`; when working there, also apply the more specific [trading_bot/AGENTS.md](/A:/Trading%20Setup/bot-trading/trading_bot/AGENTS.md).

## What This Repo Is

Solana memecoin algorithmic trading bot with:

- TypeScript/Node.js backend
- Next.js 16 dashboard
- Prisma 7 + PostgreSQL 16
- Redis + BullMQ
- Helius, Birdeye, Jupiter, and Jito integrations

Trading constraints:

- Capital target is about `$200`
- Maximum `5` open positions
- `DRY_RUN=true` means simulation mode

## Where To Work

Almost all code changes belong under `trading_bot/`.

- `trading_bot/backend/src/`: backend, services, workers, API, strategies
- `trading_bot/backend/prisma/`: Prisma schema, SQL views, seed
- `trading_bot/dashboard/`: Next.js dashboard

If a task does not clearly require root-level files, avoid touching files outside `trading_bot/`.

## Project Defaults

- Read existing patterns before editing.
- Prefer the smallest correct change.
- Fix root causes, not surface symptoms.
- If a change touches live-trading behavior, optimize for safety and correctness over speed.
- If scope expands beyond the original task, explicitly say why before continuing.
- Do not create Prisma migration files. Keep DB shape changes in `trading_bot/backend/prisma/schema.prisma` and operational SQL in `trading_bot/backend/prisma/views/create_views.sql`.
- Treat `npm run db:setup` as the canonical local/bootstrap DB rollout command when schema and SQL views both matter. `db:push` alone is incomplete for this repo.
- Docker production startup should preserve this sequence: backend applies DB bootstrap first, backend becomes healthy, dashboard starts after backend health.
- Treat control-plane write routes as authenticated surfaces by default. Read-only routes may be public; mutating routes must make the boundary explicit.
- Keep dashboard proxy auth centralized. Do not rely on per-endpoint token hacks when a whole control subtree needs the same bearer token.
- Keep analytics deterministic. Historical recomputes must derive from immutable records or persisted snapshots, not mutable singleton state.
- Keep frontend query keys, URL params, and backend filters aligned. If the key varies by `days`, `mode`, `configProfile`, or `tradeSource`, the request must vary too.

## Main References

Use these as the source of truth for project-specific patterns:

- `AGENTS.md` and `trading_bot/AGENTS.md` for Codex operating guidance
- `typescript-patterns.md` for TypeScript and ESM conventions
- `trading-security.md` for execution safety, secrets, and validation
- `prisma-patterns.md` for schema and query patterns
- `api-routes.md` for API route conventions
- `dashboard-patterns.md` for dashboard data and UI patterns
- `strategy-patterns.md` for strategy and trade lifecycle rules
- `testing-patterns.md` for testing expectations

For domain-heavy work, consult the configured Codex agent under `.codex/agents/`.

## Codex MCP Defaults

Prefer the MCPs that are actually configured for this repository's Codex agents instead of generic or stale tool names.

- `filesystem`: direct repo reads, targeted file inspection, and config lookup
- `desktop_commander`: broader local-ops MCP for process execution, richer search, session interaction, and file operations beyond simple repo reads
- `serena`: semantic code navigation, symbol tracing, callsite discovery, and impact analysis
- `postgres`: read-first database inspection, query tracing, schema/view validation, and DB safety checks
- `context7`: primary-source library and framework documentation lookup
- `sequential_thinking`: complex debugging, architecture decisions, and multi-step reasoning that needs explicit backtracking
- `chrome_devtools` and `browsermcp`: dashboard verification, browser interaction, rendering checks, and external-doc pages that need real navigation
- `fetch`: lightweight retrieval of current external docs, changelogs, and API references when full browser interaction is unnecessary
- `memory`: preserving useful cross-task entities, relationships, and observations for longer-running investigations
- `time`: exact current-time or timezone-aware checks for research and recency-sensitive work

Default MCP selection by task:

- Codebase tracing: `serena` + `filesystem`
- Database and Prisma safety: `postgres` + `filesystem`
- Dashboard work: `filesystem` + `serena`, then `chrome_devtools` or `browsermcp` for verification
- External research: `context7` first for library docs, then `fetch` or browser MCPs for current vendor docs and changelogs
- Non-obvious investigations: add `sequential_thinking`

Use `filesystem` as the default file-reading MCP.
Use `desktop_commander` only when the task needs local process execution, interactive command/session work, stronger directory search, or file operations that go beyond straightforward repo inspection.

## Verification

Before finishing:

- Run the relevant checks for the area changed
- Make sure no unused imports, dead code, or placeholder fixes remain
- Verify behavior, not just syntax
- For dashboard work, prove the actual build path is green and confirm any search-param client hooks sit behind the required Suspense boundary.
