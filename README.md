# bot-trading

Solana memecoin trading bot with a TypeScript backend, a Next.js dashboard, PostgreSQL, and Redis.

This repository is a workspace. The actual application lives in `trading_bot/`. The root also contains Codex agent configuration used for development in this repo.

Docker parity note: the current container images build on `node:24-alpine`. Keeping local work on Node 24 avoids npm lockfile drift between the host and Docker.

## What is here

- `trading_bot/backend/src/`: backend, strategies, services, API routes, and workers
- `trading_bot/backend/src/bootstrap/`: runtime assembly, startup orchestration, and interval wiring
- `trading_bot/backend/prisma/`: Prisma schema, seed, and SQL views
- `trading_bot/dashboard/`: Next.js dashboard
- `trading_bot/dashboard/features/`: route-owned UI implementations separated from thin App Router entrypoints
- `trading_bot/dashboard/README.md`: dashboard architecture, shared shell/query patterns, theme tokens, and control-plane auth notes
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

6. In a second terminal, start the dashboard.
For privileged dashboard actions, run the dashboard with the same control secret available to the Next.js server.
The dashboard accepts `CONTROL_API_SECRET`, `CONTROL_SECRET`, or `DASHBOARD_OPERATOR_SECRET`:

```bash
cd trading_bot/dashboard
npm install
export CONTROL_API_SECRET="replace-with-at-least-16-characters"
npm run dev
```

PowerShell:

```powershell
cd trading_bot/dashboard
npm install
$env:CONTROL_API_SECRET="replace-with-at-least-16-characters"
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

The production compose flow now waits for Postgres and Redis health checks, runs a one-shot `db-setup` service to apply `npm run db:setup`, starts the backend only after that bootstrap succeeds, waits for the backend `/api/health` endpoint to go healthy, and only then starts the dashboard.
The Dockerfiles use BuildKit cache mounts for `npm ci`, so repeat builds are materially faster once the cache is warm.

Useful terminal commands:

```bash
npm run docker:logs
npm run docker:down
```

This Docker stack runs PostgreSQL, Redis, the backend, and the dashboard together. It is separate from the lightweight local `docker-compose.yml` that only starts Postgres and Redis.
On stack startup, the production compose flow applies the Prisma schema and then executes `trading_bot/backend/prisma/views/create_views.sql` through the dedicated `db-setup` container, so tables and SQL views are created automatically when `DATABASE_URL` is configured without re-running the bootstrap on every bot restart.
`trading_bot/backend/prisma/views/create_views.sql` is expected to stay idempotent against existing Docker volumes. If a view changes shape, drop and recreate that view in the rollout SQL instead of depending on `CREATE OR REPLACE VIEW` to rename columns.

Verified on Docker Desktop 4.64.0 with Engine 29.2.1:

- Full `docker compose --env-file backend/.env.docker -f docker-compose.prod.yml build` completed in about `101s` after the Docker fixes and in about `11.5s` on a fully warm cache.
- A backend-only rebuild (`bot` + `db-setup`) completed in about `25s` on a warm cache.
- The verified startup order is `postgres/redis healthy` -> `db-setup exited 0` -> `bot healthy` -> `dashboard serving 200`.

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
- Helius and Birdeye quota are managed centrally in `trading_bot/backend/src/core/api-budget-manager.ts`. The current defaults in `trading_bot/backend/src/config/index.ts` assume Helius Developer (`10M` monthly credits) and Birdeye Lite (`1.5M` monthly CU). If your provider plan differs, update that config before trusting the budget dashboard.
- Daily provider budget is derived from remaining monthly quota with a reserve. Non-essential work such as wallet scoring, wallet discovery, and backfills can be skipped under budget pressure. Hard-limit exhaustion pauses new entries, while exits, execution completion, and wallet reconciliation remain essential.
- Provider spend and efficiency are persisted for later analysis in Prisma through `ApiCall`, `ApiUsageDaily`, and `ApiEndpointDaily`. The backend exposes the current budget snapshot and top endpoint consumers via `/api/overview/api-usage`, and execution-quality summaries via `/api/analytics/execution-quality`.
- The dashboard shell now derives shared status from `trading_bot/dashboard/hooks/use-dashboard-shell.ts`; header, sidebar, footer, and page-level summaries should reuse that data instead of re-querying overview, positions, and heartbeat independently.
- Dashboard chrome reflects the active runtime scope, while page-level analysis filters can inspect other `mode/configProfile` lanes through `trading_bot/dashboard/hooks/use-dashboard-filters.ts`. Do not conflate those two views.
- `/quota` is the dedicated provider-runway page. Settings only carries the current snapshot and control-adjacent quota context.
- Control-plane writes and SSE proxying stay centralized in `trading_bot/dashboard/app/api/[...path]/route.ts`. Operator session state is issued by `trading_bot/dashboard/app/api/operator-session/route.ts` through an httpOnly cookie.
- Dashboard filtering is contract-sensitive: if a query key varies by `days`, `mode`, `profile`, or `tradeSource`, the request and backend route must vary by the same parameters.
- Theme and chart colors are driven by semantic CSS variables in `trading_bot/dashboard/app/globals.css` and `trading_bot/dashboard/lib/chart-colors.ts`; avoid hard-coded light/dark literals in charts or layout chrome.
- Prisma changes are schema-and-views only here: update `trading_bot/backend/prisma/schema.prisma` and `trading_bot/backend/prisma/views/create_views.sql`, and do not create migration files.
- When you need the actual database bootstrap, use `npm run db:setup` instead of stopping at `npm run db:push`; `db:push` creates tables, while `db:views` applies the SQL views.
- If the Prisma schema changes, run `npm run db:generate` before relying on backend typecheck/build output.
- Control-plane write actions are authenticated through the dashboard proxy; keep any new pause/resume/manual/profile mutations on that same protected path.
- Analytics and dashboard filters must stay parameter-consistent: query keys, URL params, and backend filters should all vary together for `days`, `mode`, `configProfile`, and `tradeSource` when relevant.
