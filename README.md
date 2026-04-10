# bot-trading

Agent-only repo. The only active app is [`trading_bot/`](trading_bot/).

## Start Here

- Repo rules and task routing: [`AGENTS.md`](AGENTS.md)
- Obsidian vault guide: [`notes/README.md`](notes/README.md)
- Canonical reference index: [`notes/reference/index.md`](notes/reference/index.md)
- App-local rules once you are inside the app: [`trading_bot/AGENTS.md`](trading_bot/AGENTS.md)

## Current Scope

- Strategy scope: S2 graduation only
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Providers: Birdeye and Helius
- Runtime model: one in-process bot runtime plus API server
- Discovery defaults to all Birdeye graduation venues, while live trading stays `pump_dot_fun` only until `TRADABLE_SOURCES` is widened
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
- No Grafana service in compose
- No S1 or S3 runtime
- No Prisma migration workflow
