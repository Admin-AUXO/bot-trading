# bot-trading

Agent-only repo. The only active app is [`trading_bot/`](trading_bot/).

## Start Here

- Repo rules and task routing: [`AGENTS.md`](AGENTS.md)
- Obsidian vault guide: [`notes/README.md`](notes/README.md)
- Canonical reference index: [`notes/reference/index.md`](notes/reference/index.md)
- App-local rules once you are inside the app: [`trading_bot/AGENTS.md`](trading_bot/AGENTS.md)

## Fresh Setup

For a new machine, use the app-local Node version and bootstrap script:

```bash
cd trading_bot
nvm use || nvm install
./scripts/bootstrap-new-system.sh host
```

For the full container stack instead:

```bash
cd trading_bot
nvm use || nvm install
./scripts/bootstrap-new-system.sh compose
```

Then follow the exact run-mode steps in [`notes/reference/bootstrap-and-docker.md`](notes/reference/bootstrap-and-docker.md).

## Current Scope

- Strategy scope: S2 graduation only
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Providers: Birdeye and Helius
- Runtime model: one in-process bot runtime plus API server
- Discovery defaults to `pump_dot_fun`, and widening sources is an explicit desk decision
- Strategy runtime now uses adaptive position sizing, score-aware exits, dayparted discovery cadence, and Birdeye lane-budget pacing
- `LIVE` is wired through Jupiter quote/swap building plus Helius Sender, but it requires a funded trading wallet and live env config

## Canonical Strategy Docs

- Runtime and strategy behavior: [`notes/reference/strategy.md`](notes/reference/strategy.md)
- Setup, env, and live-routing contracts: [`notes/reference/bootstrap-and-docker.md`](notes/reference/bootstrap-and-docker.md)
- Backend and dashboard boundaries: [`notes/reference/api-surface.md`](notes/reference/api-surface.md)
- Schema, views, and evidence tables: [`notes/reference/prisma-and-views.md`](notes/reference/prisma-and-views.md)
- Repo-local graphify workflow: [`notes/reference/graphify.md`](notes/reference/graphify.md)
- Repo-local Obsidian workflow: [`notes/reference/obsidian.md`](notes/reference/obsidian.md)

## Non-Features

- No Redis
- No S1 or S3 runtime
- No Prisma migration workflow
