# Bootstrap And Docker

These are the real startup contracts.

## Local Dev

1. Start infra from `trading_bot/`:
   `docker compose up -d postgres redis`
2. If host ports `5432` or `6379` are busy, set `POSTGRES_PORT` and/or `REDIS_PORT` first and keep backend env URLs aligned.
3. Create `trading_bot/backend/.env`.
4. From `trading_bot/backend/` run:
   `npm install`
   `npm run db:generate`
   `npm run db:setup`
   `npm run dev`
5. From `trading_bot/dashboard/` run:
   `npm install`
   `npm run dev`

## Compose Files

- `trading_bot/docker-compose.yml`: local infra only
- `trading_bot/docker-compose.prod.yml`: full stack with `db-setup`, backend, and dashboard

## Production Compose Order

1. `postgres` and `redis` become healthy
2. `db-setup` runs successfully
3. `bot` starts and passes `/api/health`
4. `dashboard` starts after backend health

`npm run docker:up` already runs `npm run docker:preflight`. That preflight rewrites `.env.docker` host-port values when `3000`, `3001`, `5432`, or `6379` are occupied by something outside this compose stack.

Prod compose does not run `db:seed`.

## Ports And Env

- backend container: `3001`
- dashboard container: `3000`
- local infra host defaults: `${POSTGRES_PORT:-5432}:5432` and `${REDIS_PORT:-6379}:6379`
- app host defaults: `${BOT_PORT:-3001}:${BOT_PORT:-3001}` and `${DASHBOARD_PORT:-3000}:${DASHBOARD_PORT:-3000}`
- Docker boot expects `trading_bot/backend/.env.docker` to define:
  `DATABASE_URL`, `REDIS_URL`, `HELIUS_API_KEY`, `HELIUS_RPC_URL`, `HELIUS_WS_URL`, `BIRDEYE_API_KEY`, `CONTROL_API_SECRET`
- `SOLANA_PUBLIC_KEY` is needed for wallet-aware runtime paths
- `SOLANA_PRIVATE_KEY` is only required for `TRADE_MODE="LIVE"`
- Keep `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DATABASE_URL` aligned if you override Postgres credentials
- Compose-internal service URLs stay on `postgres:5432`, `redis:6379`, and `bot:${BOT_PORT:-3001}`

## Node And Redis Reality

- Keep local Node and Docker Node majors aligned when lockfiles change; current Dockerfiles use `node:24-alpine`
- Redis is still provisioned by compose and env templates
- The checked-in runtime code does not currently instantiate a Redis client

## Verification

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run db:setup`
