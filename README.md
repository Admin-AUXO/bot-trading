# bot-trading

Solana memecoin trading bot with a TypeScript backend, a Next.js dashboard, PostgreSQL, and Redis.

This repository is a workspace. The actual application lives in `trading_bot/`. The root also contains Codex agent configuration used for development in this repo.

## What is here

- `trading_bot/backend/src/`: backend, strategies, services, API routes, and workers
- `trading_bot/backend/src/bootstrap/`: runtime assembly, startup orchestration, and interval wiring
- `trading_bot/backend/prisma/`: Prisma schema, seed, and SQL views
- `trading_bot/dashboard/`: Next.js dashboard
- `trading_bot/dashboard/features/`: route-owned UI implementations separated from thin App Router entrypoints
- `.codex/`, `.agents/`: local agent and workflow configuration

## Quick start

1. Start Postgres and Redis:

```bash
cd trading_bot
docker compose up -d postgres redis
```

2. Create `trading_bot/backend/.env` from `trading_bot/backend/.env.example`.

3. Add the required API and wallet settings:

- `DATABASE_URL`
- `REDIS_URL`
- `HELIUS_API_KEY`
- `HELIUS_RPC_URL`
- `HELIUS_WS_URL`
- `BIRDEYE_API_KEY`
- `SOLANA_PRIVATE_KEY`
- `SOLANA_PUBLIC_KEY`
- `CONTROL_API_SECRET`

4. Keep `TRADE_MODE="DRY_RUN"` until you are intentionally testing live execution.

5. Install dependencies and start the backend:

```bash
cd trading_bot/backend
npm install
npm run db:generate
npm run db:setup
npm run dev
```

6. In a second terminal, start the dashboard:

```bash
cd trading_bot/dashboard
npm install
npm run dev
```

The backend runs on port `3001` by default. The dashboard runs on port `3000`.
For local development against Docker Postgres, `npm run db:setup` is the canonical bootstrap because it applies both the Prisma schema and the SQL views in `trading_bot/backend/prisma/views/create_views.sql`.

## Separate Docker Install

For an isolated Docker-based stack that you can start from the terminal:

1. Copy the Docker env template:

```bash
cd trading_bot/backend
cp .env.docker.example .env.docker
```

PowerShell:

```powershell
cd trading_bot/backend
Copy-Item .env.docker.example .env.docker
```

2. Fill in the required API keys, wallet values, and `CONTROL_API_SECRET` in `trading_bot/backend/.env.docker`.

3. Start the full stack:

```bash
cd trading_bot/backend
npm run docker:up
```

The production compose flow now waits for Postgres and Redis health checks, starts the backend, runs `npm run db:setup`, waits for the backend `/api/health` endpoint to go healthy, and only then starts the dashboard.

Useful terminal commands:

```bash
npm run docker:logs
npm run docker:down
```

This Docker stack runs PostgreSQL, Redis, the backend, and the dashboard together. It is separate from the lightweight local `docker-compose.yml` that only starts Postgres and Redis.
On backend startup, the production compose flow now applies the Prisma schema and then executes `trading_bot/backend/prisma/views/create_views.sql`, so tables and SQL views are created automatically when `DATABASE_URL` is configured.

## Useful commands

From `trading_bot/backend/`:

```bash
npm run typecheck
npm run build
npm run db:push
npm run db:views
npm run db:setup
npm run db:seed
npm run db:studio
```

From `trading_bot/dashboard/`:

```bash
npm run build
npm run lint
```

## Notes

- `LIVE` mode sends real trades. Treat it accordingly.
- The current capital and risk defaults are tuned for a small account, around `$200`, with a maximum of `5` open positions.
- Internal audit notes live in `trading_bot/docs/`.
- Prisma changes are schema-and-views only here: update `trading_bot/backend/prisma/schema.prisma` and `trading_bot/backend/prisma/views/create_views.sql`, and do not create migration files.
- When you need the actual database bootstrap, use `npm run db:setup` instead of stopping at `npm run db:push`; `db:push` creates tables, while `db:views` applies the SQL views.
- Control-plane write actions are authenticated through the dashboard proxy; keep any new pause/resume/manual/profile mutations on that same protected path.
- Analytics and dashboard filters must stay parameter-consistent: query keys, URL params, and backend filters should all vary together for `days`, `mode`, `configProfile`, and `tradeSource` when relevant.
