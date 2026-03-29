# Tech Stack

This repo is a trading bot plus operator dashboard. The source of truth is `trading_bot/`.

## Backend

- Runtime: Node.js + TypeScript ESM
- Entry/build: `tsx` for dev, `tsup` for build
- HTTP server: Express 5
- Validation/config: `zod`
- Logging: `pino` + `pino-http`
- Database access: Prisma 7 against PostgreSQL 16
- Trading integrations: Helius, Birdeye, Jupiter
- Jito usage: tip account and priority-fee accounting inside execution paths, not a standalone service layer

## Dashboard

- Framework: Next.js 16 App Router
- React: React 19
- Data layer: TanStack Query
- URL state: `nuqs`
- Charts: `recharts`
- Motion: `motion`
- Styling: Tailwind CSS 4 + semantic CSS variables from `dashboard/app/globals.css`

## Data and Infra

- Primary database: PostgreSQL 16
- Compose services: Postgres, Redis, one-shot `db-setup`, backend, dashboard
- Redis reality: the repo still provisions Redis in compose and env files, but the checked-in app code does not currently instantiate a Redis client or BullMQ worker path
- DB rollout contract: Prisma schema lives in `backend/prisma/schema.prisma`; repo-owned SQL views live in `backend/prisma/views/create_views.sql`

## Trading Runtime Shape

- Trade mode is `TRADE_MODE="LIVE"` or `TRADE_MODE="DRY_RUN"`
- Current defaults target a small account, about `$200`
- Maximum open positions default to `5`
- S1, S2, and S3 share the same risk manager, position tracker, executor interface, and exit monitor

## Source Files

- `trading_bot/backend/package.json`
- `trading_bot/dashboard/package.json`
- `trading_bot/backend/src/config/index.ts`
- `trading_bot/docker-compose.yml`
- `trading_bot/docker-compose.prod.yml`

## Non-Features To Remember

- No Prisma migration files in this repo workflow
- No BullMQ pipeline in the checked-in code
- No dashboard-side direct browser calls to the backend; browser traffic goes through the Next proxy
