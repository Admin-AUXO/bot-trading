# bot-trading

Agent-only repo. The only active app is [`trading_bot/`](trading_bot/).

## Start Here

- Repo rules and task routing: [`AGENTS.md`](AGENTS.md)
- Canonical doc index: [`docs/README.md`](docs/README.md)
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

- Runtime and strategy behavior: [`docs/strategy.md`](docs/strategy.md)
- Setup, env, and live-routing contracts: [`docs/bootstrap-and-docker.md`](docs/bootstrap-and-docker.md)
- Backend and dashboard boundaries: [`docs/api-surface.md`](docs/api-surface.md)
- Schema, views, and evidence tables: [`docs/prisma-and-views.md`](docs/prisma-and-views.md)

## Non-Features

- No Redis
- No Grafana service in compose
- No S1 or S3 runtime
- No Prisma migration workflow
