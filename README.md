# bot-trading

Solana memecoin trading bot workspace. The app lives in `trading_bot/`; the repo root holds shared docs, repo-local Codex guidance, and specialist agent config.

## Repo Map

- `docs/`: implementation docs for future Codex and AI-agent work
- `trading_bot/backend/`: Node/TypeScript backend, Express API, Prisma schema/views, Docker env templates
- `trading_bot/dashboard/`: Next.js 16 operator dashboard
- `.agents/skills/`: repo-specific workflow notes
- `.codex/agents/`: repo-local specialist agents

## Local Dev

1. Start infra from `trading_bot/`:

```powershell
docker compose up -d postgres redis
```

If host ports `5432` or `6379` are busy, set `POSTGRES_PORT` and/or `REDIS_PORT` first and keep backend env URLs aligned.

2. Create backend env from `trading_bot/backend/`:

```powershell
Copy-Item .env.example .env
```

3. Fill the required values:

- `DATABASE_URL`
- `REDIS_URL`
- `HELIUS_API_KEY`
- `HELIUS_RPC_URL`
- `HELIUS_WS_URL`
- `HELIUS_SENDER_URLS`
- `HELIUS_SENDER_TIP_LAMPORTS`
- `BIRDEYE_API_KEY`
- `SOLANA_PRIVATE_KEY`
- `SOLANA_PUBLIC_KEY`
- `JITO_TIP_ACCOUNTS`
- `CONTROL_API_SECRET`

4. Keep `TRADE_MODE="DRY_RUN"` unless you intentionally want real execution.

5. Start the backend from `trading_bot/backend/`:

```powershell
npm install
npm run db:generate
npm run db:setup
npm run dev
```

6. Start the dashboard from `trading_bot/dashboard/`:

```powershell
npm install
$env:CONTROL_API_SECRET="replace-with-at-least-16-characters"
npm run dev
```

Accepted dashboard secret fallbacks:

- `DASHBOARD_OPERATOR_SECRET`
- `CONTROL_SECRET`
- `API_CONTROL_SECRET`
- `DASHBOARD_CONTROL_SECRET`

Defaults:

- Backend: `http://localhost:3001`
- Dashboard: `http://localhost:3000`

## Docker Stack

1. Create `trading_bot/backend/.env.docker` from `.env.docker.example`.
2. Fill API keys, wallet values, and `CONTROL_API_SECRET`.
3. Start the full stack from `trading_bot/backend/`:

```powershell
npm run docker:up
```

Useful commands:

```powershell
npm run docker:preflight
npm run docker:build
npm run docker:logs
npm run docker:down
```

Compose contract:

- `trading_bot/docker-compose.yml`: local infra only
- `trading_bot/docker-compose.prod.yml`: full stack
- startup order: `postgres/redis healthy -> db-setup -> backend healthy -> dashboard`
- host port overrides: `POSTGRES_PORT`, `REDIS_PORT`, `BOT_PORT`, `DASHBOARD_PORT`

Required in `.env.docker`:

- all modes: `DATABASE_URL`, `REDIS_URL`, `HELIUS_API_KEY`, `HELIUS_RPC_URL`, `HELIUS_WS_URL`, `BIRDEYE_API_KEY`, `CONTROL_API_SECRET`
- wallet-aware paths: `SOLANA_PUBLIC_KEY`
- `LIVE` execution: `SOLANA_PRIVATE_KEY`

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

- No Prisma migration files. Use `backend/prisma/schema.prisma` and `backend/prisma/views/create_views.sql`.
- Use `npm run db:setup` when schema and SQL views both matter.
- If a SQL view changes shape, drop and recreate it in `create_views.sql`.
- Provider traffic belongs in `backend/src/services/`; do not bypass quota accounting, batching, or caching.
- Control-plane writes go through the dashboard proxy and operator-session boundary.
- `reconcile-wallet` is `LIVE`-only.
- Runtime defaults target a small account, about `$200`, with a maximum of `5` open positions.

## Further Reading

- `docs/README.md`
- `AGENTS.md`
- `trading_bot/AGENTS.md`
- `trading_bot/dashboard/README.md`
