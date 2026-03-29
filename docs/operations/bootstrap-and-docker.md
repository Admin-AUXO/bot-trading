# Bootstrap And Docker

These are the repo's real startup contracts. Break them and the bot turns into performance art.

## Local Dev

1. Start infra from `trading_bot/`:
   `docker compose up -d postgres redis`
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

Prod compose does not run `db:seed`. If a workflow depends on seeded rows, say so explicitly.

## Ports And Env

- Backend container listens on `3001`
- Dashboard container listens on `3000`
- Host mapping defaults to `${BOT_PORT:-3001}:3001` and `${DASHBOARD_PORT:-3000}:3000`
- Control auth flows depend on `CONTROL_API_SECRET` or the dashboard secret fallback chain

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
