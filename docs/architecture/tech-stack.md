# Tech Stack

The source of truth is `trading_bot/`.

## Backend

- runtime: Node.js + TypeScript ESM
- dev/build: `tsx` for dev, `tsup` for build
- HTTP server: Express 5
- validation/config: `zod`
- logging: `pino` + `pino-http`
- database: Prisma 7 on PostgreSQL 16
- trading integrations: Helius, Birdeye, Jupiter
- Jito usage: tip account and priority-fee accounting inside execution paths, not a standalone service layer

## Dashboard

- Next.js 16 App Router
- React 19
- TanStack Query
- `nuqs`
- `recharts`
- `motion`
- Tailwind CSS 4 plus semantic CSS variables from `dashboard/app/globals.css`

## Data and Infra

- primary database: PostgreSQL 16
- compose services: Postgres, Redis, one-shot `db-setup`, backend, dashboard
- Redis reality: the repo still provisions Redis in compose and env files, but the checked-in app code does not instantiate a Redis client or BullMQ worker path
- DB rollout contract: Prisma schema in `backend/prisma/schema.prisma`; repo-owned SQL views in `backend/prisma/views/create_views.sql`

## Runtime Shape

- trade mode is `TRADE_MODE="LIVE"` or `TRADE_MODE="DRY_RUN"`
- defaults target a small account, about `$200`
- maximum open positions default to `5`
- S1, S2, and S3 share the same risk manager, position tracker, executor interface, and exit monitor

## Source Files

- `trading_bot/backend/package.json`
- `trading_bot/dashboard/package.json`
- `trading_bot/backend/src/config/index.ts`
- `trading_bot/docker-compose.yml`
- `trading_bot/docker-compose.prod.yml`

## Non-Features

- no Prisma migration files in this repo workflow
- no BullMQ pipeline in the checked-in code
- no dashboard-side direct browser calls to the backend; browser traffic goes through the Next proxy
