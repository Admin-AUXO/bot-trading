# Bootstrap And Docker

These are the repo's real startup contracts. Break them and the bot turns into performance art.

## Local Dev

1. Start infra from `trading_bot/`:
   `docker compose up -d postgres redis`
   If host ports `5432` or `6379` are already occupied, set `POSTGRES_PORT` and/or `REDIS_PORT` before that command and make backend env URLs match.
2. Create backend env:
   `trading_bot/backend/.env`
3. Install backend deps and set up DB:
   `npm install`
   `npm run db:generate`
   `npm run db:setup`
4. Start backend:
   `npm run dev`
5. Start dashboard separately from `trading_bot/dashboard/`:
   `npm install`
   `npm run dev`

## Compose Files

- `trading_bot/docker-compose.yml`: local infra only, just Postgres and Redis
- `trading_bot/docker-compose.prod.yml`: full stack with `db-setup`, backend, and dashboard

## Production Compose Order

1. `postgres` and `redis` become healthy
2. `db-setup` runs and must complete successfully
3. `bot` starts and must pass `/api/health`
4. `dashboard` starts after backend health

Before full-stack boot, run `cd trading_bot/backend && npm run docker:preflight` if you want to see or normalize host ports ahead of time. `npm run docker:up` now runs that preflight automatically and rewrites `.env.docker` port values when the configured host ports are already occupied by something outside this compose stack.

Prod compose does not run `db:seed`. If a workflow depends on seeded rows, say so explicitly.

## Ports And Env

- Backend container listens on `3001`
- Dashboard container listens on `3000`
- Local infra host mapping defaults to `${POSTGRES_PORT:-5432}:5432` and `${REDIS_PORT:-6379}:6379`
- Host mapping defaults to `${BOT_PORT:-3001}:${BOT_PORT:-3001}` and `${DASHBOARD_PORT:-3000}:${DASHBOARD_PORT:-3000}`
- The port preflight keeps host ports already owned by this compose project, but if another process is sitting on `3000`, `3001`, `5432`, or `6379`, it will move the affected host binding to the next safe fallback in `.env.docker` before `docker compose up`
- Control auth flows depend on `CONTROL_API_SECRET` or the dashboard secret fallback chain
- Full-stack Docker boot expects `trading_bot/backend/.env.docker` to define:
  `DATABASE_URL`, `REDIS_URL`, `HELIUS_API_KEY`, `HELIUS_RPC_URL`, `HELIUS_WS_URL`, `BIRDEYE_API_KEY`, and `CONTROL_API_SECRET`
- `SOLANA_PUBLIC_KEY` is needed for wallet-aware runtime paths
- `SOLANA_PRIVATE_KEY` is only operationally required for `TRADE_MODE="LIVE"` execution
- If you override Postgres credentials or DB name for compose, keep `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DATABASE_URL` in sync
- If you override host ports, keep host-side callers aligned with `POSTGRES_PORT`, `REDIS_PORT`, `BOT_PORT`, and `DASHBOARD_PORT`
- Compose-internal service URLs stay on `postgres:5432`, `redis:6379`, and `bot:${BOT_PORT:-3001}`

## Node Version Rule

- Keep local Node and Docker Node majors aligned when dependency locks change
- Current Dockerfiles use `node:24-alpine`

## Redis Reality

- Redis is still provisioned by compose and env templates
- The current checked-in runtime code does not instantiate a Redis client
- Do not write docs that pretend Redis queues or Redis-backed runtime state already exist

## Verification

- Backend build: `cd trading_bot/backend && npm run build`
- Dashboard build: `cd trading_bot/dashboard && npm run build`
- DB bootstrap: `cd trading_bot/backend && npm run db:setup`
