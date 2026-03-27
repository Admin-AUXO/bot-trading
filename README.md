# bot-trading

Solana memecoin trading bot with a TypeScript backend, a Next.js dashboard, PostgreSQL, and Redis.

This repository is a workspace. The actual application lives in `trading_bot/`. The root also contains Codex agent configuration used for development in this repo.

## What is here

- `trading_bot/src/`: backend, strategies, services, API routes, and workers
- `trading_bot/prisma/`: Prisma schema, seed, and SQL views
- `trading_bot/dashboard/`: Next.js dashboard
- `.codex/`, `.agents/`: local agent and workflow configuration

## Quick start

1. Start Postgres and Redis:

```bash
cd trading_bot
docker compose up -d postgres redis
```

2. Create `trading_bot/.env` from `trading_bot/.env.example`.

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
cd trading_bot
npm install
npm run db:generate
npm run dev
```

6. In a second terminal, start the dashboard:

```bash
cd trading_bot/dashboard
npm install
npm run dev
```

The backend runs on port `3001` by default. The dashboard runs on port `3000`.

## Useful commands

From `trading_bot/`:

```bash
npm run typecheck
npm run build
npm run db:push
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
- Prisma changes are schema-and-views only here: update `trading_bot/prisma/schema.prisma` and `trading_bot/prisma/views/create_views.sql`, and do not create migration files.
- Control-plane write actions are authenticated through the dashboard proxy; keep any new pause/resume/manual/profile mutations on that same protected path.
- Analytics and dashboard filters must stay parameter-consistent: query keys, URL params, and backend filters should all vary together for `days`, `mode`, `configProfile`, and `tradeSource` when relevant.
