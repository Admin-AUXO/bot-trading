# bot-trading

Solana memecoin trading bot workspace. The application lives in `trading_bot/`; the repo root holds shared docs, repo-local Codex guidance, and specialist agent config.

## Repo Map

- `docs/`: implementation docs for future Codex and AI-agent work
- `trading_bot/backend/`: Node/TypeScript backend, Express API, runtime bootstrap, Prisma schema/views, Docker env templates
- `trading_bot/dashboard/`: Next.js 16 dashboard with proxy auth, shared shell state, and page-owned feature modules
- `.agents/skills/`: repo-specific workflow notes
- `.codex/agents/`: repo-local specialist agents

## Local Dev

1. Start Postgres and Redis:

```powershell
cd trading_bot
docker compose up -d postgres redis
```

If `5432` or `6379` is already taken on the host, override the local bindings first:

```powershell
$env:POSTGRES_PORT="55432"
$env:REDIS_PORT="56379"
docker compose up -d postgres redis
```

2. Create the backend env file:

```powershell
cd backend
Copy-Item .env.example .env
```

3. Fill the required values:

- `DATABASE_URL`
- `REDIS_URL`
- `HELIUS_API_KEY`
- `HELIUS_RPC_URL`
- `HELIUS_WS_URL`
- `BIRDEYE_API_KEY`
- `SOLANA_PRIVATE_KEY`
- `SOLANA_PUBLIC_KEY`
- `CONTROL_API_SECRET`

If you overrode `POSTGRES_PORT` or `REDIS_PORT`, make `DATABASE_URL` and `REDIS_URL` use those same host ports.

4. Keep `TRADE_MODE="DRY_RUN"` unless you intentionally want real execution.

5. Install and start the backend:

```powershell
cd trading_bot/backend
npm install
npm run db:generate
npm run db:setup
npm run dev
```

6. Start the dashboard in a second terminal:

```powershell
cd trading_bot/dashboard
npm install
$env:CONTROL_API_SECRET="replace-with-at-least-16-characters"
npm run dev
```

The dashboard also accepts `DASHBOARD_OPERATOR_SECRET`, `CONTROL_SECRET`, `API_CONTROL_SECRET`, or `DASHBOARD_CONTROL_SECRET`.

Defaults:

- Backend: `http://localhost:3001`
- Dashboard: `http://localhost:3000`

## Docker Stack

1. Create the Docker env file:

```powershell
cd trading_bot/backend
Copy-Item .env.docker.example .env.docker
```

2. Fill API keys, wallet values, and `CONTROL_API_SECRET`.

3. Start the full stack:

```powershell
cd trading_bot/backend
npm run docker:up
```

Useful commands:

```powershell
npm run docker:build
npm run docker:logs
npm run docker:down
```

Production compose contract:

- `docker-compose.yml` is local infra only: Postgres + Redis.
- `docker-compose.prod.yml` is the full stack.
- Startup order is `postgres/redis healthy -> db-setup runs npm run db:setup -> backend /api/health healthy -> dashboard starts`.

## Commands

From `trading_bot/backend/`:

```powershell
npm run dev
npm run build
npm run typecheck
npm run db:generate
npm run db:push
npm run db:views
npm run db:setup
npm run db:seed
npm run db:studio
```

From `trading_bot/dashboard/`:

```powershell
npm run dev
npm run build
npm run lint
npm run start
```

## Operating Rules

- No Prisma migration files. Change `backend/prisma/schema.prisma` and `backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` when schema and SQL views both matter. `db:push` alone is incomplete here.
- If a SQL view changes shape, drop and recreate it in `create_views.sql` so existing Docker volumes stay safe.
- `/api/overview` and `/api/control/*` are runtime-scope contracts. `/api/overview/api-usage` only narrows endpoint rows by `mode/profile`; service totals stay global.
- Provider traffic belongs in `backend/src/services/`; do not bypass quota accounting, batching, or caching with raw fetches.
- Control-plane writes should go through the dashboard proxy and operator-session boundary.
- `reconcile-wallet` is LIVE-only.
- Leave container `BOT_PORT` at `3001` unless you also update prod compose port mapping and health checks.
- Runtime defaults target a small account, about `$200`, with a maximum of `5` open positions.

## Further Reading

- `docs/README.md`
- `AGENTS.md`
- `trading_bot/AGENTS.md`
- `trading_bot/dashboard/README.md`
