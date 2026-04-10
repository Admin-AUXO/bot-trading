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
- `LIVE` exists in config, but `RiskEngine` blocks live entries until a real swap-routing adapter exists

## Non-Features

- No Redis
- No Grafana service in compose
- No S1 or S3 runtime
- No Prisma migration workflow
