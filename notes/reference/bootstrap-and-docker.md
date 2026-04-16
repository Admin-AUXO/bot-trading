---
type: reference
status: active
area: docker
date: 2026-04-11
source_files:
  - trading_bot/docker-compose.yml
  - trading_bot/dashboard/Dockerfile
  - trading_bot/dashboard/package.json
  - trading_bot/dashboard/scripts/run-next.mjs
  - trading_bot/backend/.env.example
  - trading_bot/dashboard/compose.env.example
  - trading_bot/grafana/compose.env.example
  - trading_bot/n8n/compose.env.example
  - trading_bot/scripts/sync-compose-env.sh
graph_checked: 2026-04-13
next_action:
---

# Bootstrap And Docker

Purpose: document the supported run modes and the env and compose contracts agents usually get wrong.

## Fresh Machine Bootstrap

On a new system, do this first:

```bash
cd trading_bot
nvm use || nvm install
node ./scripts/bootstrap-new-system.mjs host
```

Use `compose` instead of `host` if you want the full container stack:

```bash
cd trading_bot
nvm use || nvm install
node ./scripts/bootstrap-new-system.mjs compose
```

What the bootstrap script does:

- installs backend dependencies with `npm ci`
- installs dashboard dependencies with `npm ci`
- creates `backend/.env` from `backend/.env.example` if missing
- generates `dashboard/compose.env`, `grafana/compose.env`, and `n8n/compose.env` in `compose` mode

What it does not do:

- it does not invent real provider secrets
- it does not switch `DATABASE_URL` between host and compose for you
- it does not start the app automatically

## Run Mode A: Host-Run Backend And Dashboard, Docker Postgres

Use this when you want the app processes on the host but do not want to install Postgres locally.

1. Copy [`../../trading_bot/backend/.env.example`](../../trading_bot/backend/.env.example) to `trading_bot/backend/.env`.
2. Fill `HELIUS_RPC_URL`, `BIRDEYE_API_KEY`, and `CONTROL_API_SECRET`.
3. If you want the recurring discovery-lab Telegram alert runner, also fill `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
4. If you intend to trade live, also fill `TRADING_WALLET_PRIVATE_KEY_B58` and review the `LIVE_*` routing values. The wallet must hold enough SOL for fees and tips and enough quote-token balance for entries.
5. Pick the active preset defaults with:
   `LIVE_STRATEGY_PRESET_ID`
   `DRY_RUN_STRATEGY_PRESET_ID`
6. If you want continuation-mode migration nudges, set `HELIUS_MIGRATION_WATCHER_ENABLED=true` and populate `HELIUS_MIGRATION_WATCH_PROGRAM_IDS` with the program ids you actually trust.
7. Review `DISCOVERY_SOURCES`, `TRADABLE_SOURCES`, `DAILY_LOSS_LIMIT_USD`, `MAX_CONSECUTIVE_LOSSES`, and the cadence and budget envs (`DISCOVERY_INTERVAL_MS`, `OFF_HOURS_DISCOVERY_INTERVAL_MS`, `IDLE_EVALUATION_INTERVAL_MS`, `BIRDEYE_*_BUDGET_SHARE`) so the venue mix, dayparting, and quota pacing match your desk.
8. Change `DATABASE_URL` from the compose hostname `postgres` to `127.0.0.1` or `localhost`. The checked-in example is compose-oriented and will not work for a host-run backend as written.
9. Start only Postgres:

```bash
cd trading_bot
docker compose up -d postgres
```

10. Generate Prisma client, apply schema and views, and run the backend:

```bash
cd trading_bot/backend
npm install
npm run db:generate
npm run db:setup
npm run dev
```

11. Run the dashboard separately:

```bash
cd trading_bot/dashboard
npm install
npm run dev
```

Notes:

- Host-run dashboard reads the backend from `http://127.0.0.1:3101` unless you override `API_URL`.
- The recurring discovery-lab Telegram alert runner uses `backend/.env` plus the local backend API. By default it targets `http://127.0.0.1:${BOT_PORT}` and sends alerts only when `npm run lab:telegram-alert` sees winner-positive runs for `Scalp tape + structure`.
- Optional Grafana pivots use `GRAFANA_BASE_URL` plus the dashboard UID envs defined in [`../../trading_bot/backend/.env.example`](../../trading_bot/backend/.env.example). The current repo-owned Grafana estate expects:
  `GRAFANA_EXECUTIVE_DASHBOARD_UID`
  `GRAFANA_ANALYST_DASHBOARD_UID`
  `GRAFANA_LIVE_DASHBOARD_UID`
  `GRAFANA_TELEMETRY_DASHBOARD_UID`
  `GRAFANA_CANDIDATE_DASHBOARD_UID`
  `GRAFANA_POSITION_DASHBOARD_UID`
  `GRAFANA_CONFIG_DASHBOARD_UID`
  `GRAFANA_SOURCE_DASHBOARD_UID`
  `GRAFANA_RESEARCH_DASHBOARD_UID`
- `TRADE_MODE="LIVE"` now works only when the live wallet and routing env are valid. Otherwise the risk layer will refuse entries with the readiness reason.

## Run Mode B: Full Compose Stack

Use this when you want Postgres, schema setup, backend, dashboard, and the repo-owned Grafana surface inside containers. Optional sidecars for notes and automation stay behind their own profiles.

1. Copy [`../../trading_bot/backend/.env.example`](../../trading_bot/backend/.env.example) to `trading_bot/backend/.env`.
2. Keep `DATABASE_URL` on the compose hostname `postgres`.
3. If you intend to trade live, fill the trading wallet and `LIVE_*` vars before starting the stack.
4. Generate the service-specific compose env files:

```bash
cd trading_bot
node ./scripts/sync-compose-env.mjs
```

5. For a compose-side safe non-live app mode, keep `TRADE_MODE="DRY_RUN"` and leave `BOT_PORT=3101` plus `DASHBOARD_PORT=3100` alone unless you are deliberately remapping both the container env and the compose port bindings together.
6. Review venue, daypart, and daily-risk envs before boot if you do not want the defaults (`DISCOVERY_SOURCES=pump_dot_fun`, `TRADABLE_SOURCES=pump_dot_fun`, `DISCOVERY_INTERVAL_MS=300000`, `OFF_HOURS_DISCOVERY_INTERVAL_MS=900000`, `DAILY_LOSS_LIMIT_USD=8`, `MAX_CONSECUTIVE_LOSSES=2`).
7. Start the stack:

```bash
cd trading_bot
docker compose up --build
```

Fast refresh after code or env changes:

```bash
cd trading_bot
./scripts/update-compose-stack.sh
```

Compose contract:

- Only compose file: [`../../trading_bot/docker-compose.yml`](../../trading_bot/docker-compose.yml)
- Startup chain: `postgres` -> `db-setup` -> `bot` -> `dashboard`
- Postgres binds on `127.0.0.1:${POSTGRES_PORT:-56432}` for host-local tools only
- `db-setup` applies Prisma schema and SQL views before the bot starts
- `bot` health checks `GET /health`
- repo-local discovery-lab seed packs under `backend/.local/discovery-lab/packs/` are copied into the bot runner image at build time, so adding or changing those files requires a bot image rebuild before the dashboard catalog can see them
- `dashboard` waits for backend health, injects `API_URL=http://bot:3101`, and reads only `dashboard/compose.env` for its control secret and Grafana deep-link contract
- `dashboard` now starts through `node ./scripts/run-next.mjs start`, so the runner image must include `dashboard/scripts/` along with `.next`, `public`, `node_modules`, and `package.json`
- `grafana` waits for Postgres and `db-setup`, mounts provisioning from `trading_bot/grafana/`, and binds locally on `127.0.0.1:${GRAFANA_PORT:-3400}`
- `grafana` reads only `grafana/compose.env` for admin and datasource credentials
- `n8n` is an optional sidecar behind the `automation` profile, binds locally on `127.0.0.1:${N8N_PORT:-5678}`, persists state in the named volume `n8n-data`, and reads only `n8n/compose.env`
- Grafana provisioning assumes a direct PostgreSQL datasource from inside Compose using `postgres:5432`
- `node ./scripts/sync-compose-env.mjs` is the supported way to derive those service env files from `backend/.env`
- after changing `backend/.env` or regenerating the compose env files, recreate `bot` and `dashboard` so stale container env does not keep serving placeholder secrets
- `./scripts/update-compose-stack.sh` is the supported refresh path when you want that sync, build, and recreate flow in one command
- First login to Grafana with the default admin credentials will prompt for a password change. If you are only smoke-testing the local stack, you can skip that prompt and still reach the provisioned dashboards.

## Run Mode C: Obsidian Notes Sidecar

Use this when you want a browser-accessible Obsidian workspace for repo docs, notes, and cross-session memory without changing the trading app startup chain.

1. Keep the vault in [`../README.md`](../README.md). It is bind-mounted into the container.
2. Start only the notes profile:

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

3. Open Obsidian at `https://127.0.0.1:3111` by default.
4. Accept the self-signed certificate warning on first load.
5. In Obsidian, open the existing vault folder at `/config/vaults/bot-trading`.

Notes:

- The Obsidian container is intentionally a sidecar. It does not participate in the `postgres -> db-setup -> bot -> dashboard` startup chain.
- Ports bind to `127.0.0.1` only by default. Keep it that way unless you add a real reverse proxy and authentication.
- LinuxServer’s Obsidian image has no auth by default and exposes a terminal in the GUI. Treat it as trusted-local-only tooling.
- The compose file pins a concrete Obsidian image tag instead of `latest` so the sidecar does not drift silently.
- Container state lives in the named volume `obsidian-config`. Repo notes live in the bind mount at `../notes/`.

## Run Mode D: n8n Automation Sidecar

Use this when you want a local-only n8n instance for workflow prototyping without changing the trading app startup chain.

1. Keep the source of truth in [`../../trading_bot/backend/.env.example`](../../trading_bot/backend/.env.example) and sync it into `trading_bot/n8n/compose.env`:

```bash
cd trading_bot
node ./scripts/sync-compose-env.mjs
```

2. Start only the automation profile:

```bash
cd trading_bot
docker compose --profile automation up -d n8n
```

3. Open n8n at `http://127.0.0.1:5678` by default.

Notes:

- The n8n container is intentionally a sidecar. It does not participate in the `postgres -> db-setup -> bot -> dashboard` startup chain.
- Ports bind to `127.0.0.1` only by default. Keep it that way unless you add a real reverse proxy and auth in front of it.
- State lives in the named volume `n8n-data`.
- The synced env file carries the editor URL, webhook URL, and timezone defaults so local workflows generate consistent callback URLs.

## Ports And Env

- `POSTGRES_PORT`: host bind for Postgres on `127.0.0.1`, default `56432`
- `BOT_PORT`: backend listen port, default `3101`
- `DASHBOARD_PORT`: host bind for dashboard, default `3100`
- `GRAFANA_PORT`: local Grafana bind, default `3400`
- `N8N_PORT`: local n8n bind, default `5678`
- `OBSIDIAN_HTTP_PORT`: local HTTP bind for Obsidian, default `3110`
- `OBSIDIAN_HTTPS_PORT`: local HTTPS bind for Obsidian, default `3111`
- `postgres`, `db-setup`, and `bot` read [`../../trading_bot/backend/.env`](../../trading_bot/backend/.env)
- `dashboard` reads `trading_bot/dashboard/compose.env`
- `grafana` reads `trading_bot/grafana/compose.env`
- `n8n` reads `trading_bot/n8n/compose.env`
- Checked-in examples live at [`../../trading_bot/dashboard/compose.env.example`](../../trading_bot/dashboard/compose.env.example), [`../../trading_bot/grafana/compose.env.example`](../../trading_bot/grafana/compose.env.example), and [`../../trading_bot/n8n/compose.env.example`](../../trading_bot/n8n/compose.env.example)
- Generate the service env files with `./scripts/sync-compose-env.sh` after you change `backend/.env`
- `node ./scripts/sync-compose-env.mjs` strips carriage returns while parsing `backend/.env`, so a Windows-edited env file can still fan out cleanly into the compose-only env files
- If credentials change, keep `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DATABASE_URL` aligned
- `CONTROL_API_SECRET` is still the backend source of truth; the sync script maps it into `dashboard/compose.env` as `CONTROL_SECRET`
- `GRAFANA_BASE_URL`, `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD`, and the dashboard UID envs stay in `backend/.env` as the single editable source; the sync script fans them out into the service env files

## Verification

```bash
cd trading_bot && docker compose config
cd trading_bot && docker compose --profile notes config
cd trading_bot && docker compose --profile automation config
cd trading_bot && node ./scripts/sync-compose-env.mjs
cd trading_bot && ./scripts/update-compose-stack.sh --build-only
cd trading_bot && docker compose build dashboard
cd trading_bot && docker compose up -d --build db-setup grafana bot dashboard
cd trading_bot && docker compose --profile automation up -d n8n
curl -sf http://127.0.0.1:5678/healthz/readiness
curl -sf http://127.0.0.1:3400/api/health
cd trading_bot/backend && npm run build
cd trading_bot/backend && npm run db:setup
cd trading_bot/dashboard && npm run build
```

## Non-Contracts

- No Redis service
- No separate production compose file in the current workflow
