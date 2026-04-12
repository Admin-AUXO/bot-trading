# bot-trading

This repo currently hosts one active app: [`trading_bot/`](trading_bot/), a graduation trading bot with a TypeScript backend, a Next.js operator dashboard, PostgreSQL, and a repo-owned Grafana surface.

## What This Repo Contains

- [`trading_bot/backend`](trading_bot/backend): bot runtime, API server, Prisma schema, SQL views, provider clients, and trading logic
- [`trading_bot/dashboard`](trading_bot/dashboard): operator UI and backend proxy
- [`trading_bot/docker-compose.yml`](trading_bot/docker-compose.yml): local stack for Postgres, schema setup, backend, dashboard, Grafana, and optional Obsidian
- [`notes/`](notes/): canonical repo docs, decisions, investigations, runbooks, and durable memory
- [`graphify-out/`](graphify-out/): code-only architecture output when the graph has been built locally

## Start Here

- Repo rules and session startup order: [`AGENTS.md`](AGENTS.md)
- App-local rules inside the active app: [`trading_bot/AGENTS.md`](trading_bot/AGENTS.md)
- Canonical reference index: [`notes/reference/index.md`](notes/reference/index.md)
- Setup, env, and Docker contracts: [`notes/reference/bootstrap-and-docker.md`](notes/reference/bootstrap-and-docker.md)
- Strategy behavior and runtime rules: [`notes/reference/strategy.md`](notes/reference/strategy.md)

## Prerequisites

- Node.js 22 via [`trading_bot/.nvmrc`](trading_bot/.nvmrc)
- npm 10+ or newer
- Docker with Compose

Optional but useful:

- `nvm`
- `curl`

## Fresh Machine Setup

From a new machine, use the pinned Node version and the bootstrap helper:

```bash
cd trading_bot
nvm use || nvm install
./scripts/bootstrap-new-system.sh host
```

That installs backend and dashboard dependencies and creates `backend/.env` from the checked-in example if it is missing.

If you want the full container stack instead:

```bash
cd trading_bot
nvm use || nvm install
./scripts/bootstrap-new-system.sh compose
```

That also generates the runtime service env files:

- `trading_bot/dashboard/compose.env`
- `trading_bot/grafana/compose.env`

The checked-in examples live at:

- [`trading_bot/dashboard/compose.env.example`](trading_bot/dashboard/compose.env.example)
- [`trading_bot/grafana/compose.env.example`](trading_bot/grafana/compose.env.example)

You still need to edit [`trading_bot/backend/.env`](trading_bot/backend/.env.example) with real provider keys and the control secret before expecting the bot to behave like anything except a skeleton.

## Supported Run Modes

### 1. Host-run App + Docker Postgres

Use this if you want backend and dashboard on the host, with only Postgres in Docker.

```bash
cd trading_bot
docker compose up -d postgres

cd backend
npm run db:generate
npm run db:setup
npm run dev

cd ../dashboard
npm run dev
```

Important:

- change `DATABASE_URL` in `trading_bot/backend/.env` from `postgres` to `127.0.0.1` or `localhost`
- fill `HELIUS_RPC_URL`, `BIRDEYE_API_KEY`, and `CONTROL_API_SECRET`

### 2. Full Compose Stack

Use this if you want Postgres, schema setup, backend, dashboard, and Grafana in containers.

```bash
cd trading_bot
./scripts/sync-compose-env.sh
docker compose up --build
```

Important:

- keep `DATABASE_URL` pointed at `postgres`
- fill live wallet settings only if you actually intend to trade live

### 3. Obsidian Sidecar

Use this if you want the repo notes in a browser without changing the app startup chain.

```bash
cd trading_bot
docker compose --profile notes up -d obsidian
```

Open `https://127.0.0.1:3111` and use `/config/vaults/bot-trading`.

## Current Scope

- Strategy scope: graduation trading only
- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16
- Dashboard: Next.js 16 App Router
- Providers: Birdeye and Helius
- Runtime model: one in-process bot runtime plus API server
- Discovery defaults to `pump_dot_fun`
- Live trading is wired through Jupiter plus Helius Sender, but only works with valid wallet and routing env

## Canonical Docs

- Setup and Docker: [`notes/reference/bootstrap-and-docker.md`](notes/reference/bootstrap-and-docker.md)
- API and dashboard boundary: [`notes/reference/api-surface.md`](notes/reference/api-surface.md)
- Prisma, views, and reporting tables: [`notes/reference/prisma-and-views.md`](notes/reference/prisma-and-views.md)
- Strategy and risk behavior: [`notes/reference/strategy.md`](notes/reference/strategy.md)
- Obsidian workflow and durable memory rules: [`notes/reference/obsidian.md`](notes/reference/obsidian.md)
- Tool and MCP routing rules: [`notes/reference/tool-routing.md`](notes/reference/tool-routing.md)
- Graphify workflow: [`notes/reference/graphify.md`](notes/reference/graphify.md)

## Verification Shortlist

Use the smallest check that matches the change:

```bash
cd trading_bot && docker compose config
cd trading_bot/backend && npm run build
cd trading_bot/backend && npm run db:setup
cd trading_bot/dashboard && npm run build
curl -sf http://127.0.0.1:3400/api/health
```

## Non-Features

- No Redis
- No alternate legacy strategy runtime in the current repo
- No Prisma migration workflow
- No separate production compose file in the current local workflow
