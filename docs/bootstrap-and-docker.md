# Bootstrap And Docker

Purpose: document the two supported run modes and the env/compose contracts that agents usually get wrong.

## Run Mode A: Host-Run Backend And Dashboard, Docker Postgres

Use this when you want the app processes on the host but do not want to install Postgres locally.

1. Copy [`trading_bot/backend/.env.example`](../trading_bot/backend/.env.example) to `trading_bot/backend/.env`.
2. Fill `HELIUS_RPC_URL`, `BIRDEYE_API_KEY`, and `CONTROL_API_SECRET`.
3. If you intend to trade live, also fill `TRADING_WALLET_PRIVATE_KEY_B58` and review the `LIVE_*` routing values. The wallet must hold enough SOL for fees/tips and enough quote-token balance for entries.
4. Review `DISCOVERY_SOURCES`, `TRADABLE_SOURCES`, `DAILY_LOSS_LIMIT_USD`, `MAX_CONSECUTIVE_LOSSES`, and the cadence/budget envs (`DISCOVERY_INTERVAL_MS`, `OFF_HOURS_DISCOVERY_INTERVAL_MS`, `IDLE_EVALUATION_INTERVAL_MS`, `BIRDEYE_*_BUDGET_SHARE`) so the venue mix, dayparting, and quota pacing match your desk.
5. Change `DATABASE_URL` from the compose hostname `postgres` to `127.0.0.1` or `localhost`. The checked-in example is compose-oriented and will not work for a host-run backend as written.
6. Start only Postgres:

```bash
cd trading_bot
docker compose up -d postgres
```

7. Generate Prisma client, apply schema/views, and run the backend:

```bash
cd trading_bot/backend
npm install
npm run db:generate
npm run db:setup
npm run dev
```

8. Run the dashboard separately:

```bash
cd trading_bot/dashboard
npm install
npm run dev
```

Notes:

- Host-run dashboard reads the backend from `http://127.0.0.1:3001` unless you override `API_URL`.
- `TRADE_MODE="LIVE"` now works only when the live wallet and routing env are valid. Otherwise the risk layer will refuse entries with the readiness reason.

## Run Mode B: Full Compose Stack

Use this when you want Postgres, schema setup, backend, and dashboard inside containers.

1. Copy [`trading_bot/backend/.env.example`](../trading_bot/backend/.env.example) to `trading_bot/backend/.env`.
2. Keep `DATABASE_URL` on the compose hostname `postgres`.
3. If you intend to trade live, fill the trading wallet and `LIVE_*` vars before starting the stack.
4. Review venue, daypart, and daily-risk envs before boot if you do not want the defaults (`DISCOVERY_SOURCES=all`, `TRADABLE_SOURCES=pump_dot_fun`, `DISCOVERY_INTERVAL_MS=300000`, `OFF_HOURS_DISCOVERY_INTERVAL_MS=900000`, `DAILY_LOSS_LIMIT_USD=8`, `MAX_CONSECUTIVE_LOSSES=2`).
5. Start the stack:

```bash
cd trading_bot
docker compose up --build
```

Compose contract:

- Only compose file: [`trading_bot/docker-compose.yml`](../trading_bot/docker-compose.yml)
- Startup chain: `postgres` -> `db-setup` -> `bot` -> `dashboard`
- `db-setup` applies Prisma schema and SQL views before the bot starts
- `bot` health checks `GET /health`
- `dashboard` waits for backend health and injects `API_URL=http://bot:3001`

## Ports And Env

- `POSTGRES_PORT`: host bind for Postgres, default `5432`
- `BOT_PORT`: backend listen port, default `3001`
- `DASHBOARD_PORT`: host bind for dashboard, default `3000`
- Compose reads [`trading_bot/backend/.env`](../trading_bot/backend/.env) for `postgres`, `db-setup`, and `bot`
- If credentials change, keep `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DATABASE_URL` aligned
- `CONTROL_API_SECRET` is optional in backend code, but the docs assume you set it because mutating routes become unauthenticated otherwise

## Verification

```bash
cd trading_bot && docker compose config
cd trading_bot/backend && npm run build
cd trading_bot/backend && npm run db:setup
cd trading_bot/dashboard && npm run build
```

## Non-Contracts

- No Redis service
- No Grafana service
- No separate production compose file in the current workflow
