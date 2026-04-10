---
type: reference
status: active
area: repo
date: 2026-04-10
source_files:
  - trading_bot/backend/src/index.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/
  - trading_bot/dashboard/app/
  - trading_bot/docker-compose.yml
graph_checked:
next_action:
---

# Tech Stack

Purpose: orient an agent to the live app shape and the ownership boundaries that matter when placing changes.

## Active App

- Only live app: [`../../trading_bot/`](../../trading_bot/)
- Backend stack: Node.js, TypeScript ESM, Express 5, Prisma 7, PostgreSQL 16
- Dashboard stack: Next.js 16 App Router, React 19, Tailwind CSS 4, Recharts, Motion
- Providers: Birdeye for discovery and market and security data, Helius for mint and holder checks plus Sender-backed live transaction submission
- Strategy scope: S2 graduation only
- Runtime defaults discover all Birdeye meme venues, but only `pump_dot_fun` is tradable until `TRADABLE_SOURCES` is widened

## Source Map

- Runtime entry: [`../../trading_bot/backend/src/index.ts`](../../trading_bot/backend/src/index.ts)
- Runtime orchestration: [`../../trading_bot/backend/src/engine/runtime.ts`](../../trading_bot/backend/src/engine/runtime.ts)
- Strategy engines: [`../../trading_bot/backend/src/engine/`](../../trading_bot/backend/src/engine/)
- Provider and persistence services: [`../../trading_bot/backend/src/services/`](../../trading_bot/backend/src/services/)
- Birdeye quota pacing service: [`../../trading_bot/backend/src/services/provider-budget-service.ts`](../../trading_bot/backend/src/services/provider-budget-service.ts)
- API surface: [`../../trading_bot/backend/src/api/server.ts`](../../trading_bot/backend/src/api/server.ts)
- Schema and views: [`../../trading_bot/backend/prisma/schema.prisma`](../../trading_bot/backend/prisma/schema.prisma) and [`../../trading_bot/backend/prisma/views/create_views.sql`](../../trading_bot/backend/prisma/views/create_views.sql)
- Dashboard routes: [`../../trading_bot/dashboard/app/`](../../trading_bot/dashboard/app/)

## Runtime Boundaries

- One runtime process owns discovery, evaluation, exits, maintenance, and the HTTP API.
- `TRADE_MODE` supports `DRY_RUN` and `LIVE`; `LIVE` owns the recurring trading loops, while `DRY_RUN` now runs a bounded research cycle on manual trigger instead of a rolling paper bot.
- Runtime cadence is daypart-aware: discovery has separate US-hours and off-hours intervals, and evaluation has active and idle intervals.
- Provider calls belong in [`../../trading_bot/backend/src/services/`](../../trading_bot/backend/src/services/), not in routes or UI code.
- Browser-facing writes belong on [`../../trading_bot/dashboard/app/api/[...path]/route.ts`](../../trading_bot/dashboard/app/api/[...path]/route.ts).
- Server-rendered dashboard pages currently read the backend directly through `serverFetch()` and `API_URL`; the proxy is mainly the browser-write boundary.

## Dashboard Surface

- `/`: runtime snapshot plus candidate funnel, provider daily, and position performance
- `/candidates`: latest candidate filter state, raw snapshots, provider payload audit
- `/positions`: open and closed book, fills, realized performance
- `/telemetry`: provider efficiency, trigger mix, reject reasons, persisted runtime config
- `/settings`: runtime config editor for capital, filters, exits, and bounded research-run settings; live cadence is visible but read-only in the UI

## Infra Shape

- Compose services: `postgres`, `db-setup`, `bot`, `dashboard`, `obsidian`
- Single compose file: [`../../trading_bot/docker-compose.yml`](../../trading_bot/docker-compose.yml)
- No Redis, no Grafana service, no worker fleet, no alternate strategy runtime

## Repo Rules That Matter Here

- No Prisma migration files in this workflow.
- Schema edits live in `schema.prisma`; view edits live in `create_views.sql`.
- Historical analysis should come from candidates, positions, fills, snapshots, or provider telemetry, not from ad hoc dashboard-only state.
