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
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/dashboard/components/
  - trading_bot/docker-compose.yml
graph_checked: 2026-04-11
next_action: Keep the operator UI contract in `dashboard-operator-ui.md` aligned with any future shell, typography, or page-level workflow changes.
---

# Tech Stack

Purpose: orient an agent to the live app shape and the ownership boundaries that matter when placing changes.

## Active App

- Only live app: [`../../trading_bot/`](../../trading_bot/)
- Backend stack: Node.js, TypeScript ESM, Express 5, Prisma 7, PostgreSQL 16
- Dashboard stack: Next.js 16 App Router, React 19, Tailwind CSS 4, Recharts, Motion
- Dashboard typography: `Manrope` body, `Space Grotesk` headings, `Geist Mono` identifiers and tabular data
- Providers: Birdeye for discovery and market and security data, Helius for mint and holder checks plus Sender-backed live transaction submission
- Strategy scope: graduation trading only
- Runtime defaults discover `pump_dot_fun`, and the desk can widen discovery separately from tradability when it intentionally wants paper-only venue coverage

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

- `/`: control desk only. It now uses a dedicated home contract for readiness, guardrails, exposure, queue buckets, diagnostics, and recent events
- `/` degrades instead of blanking if the initial home contract fetch fails, and can emit an external Grafana diagnostics pivot when env-backed dashboard UIDs are configured
- Global shell includes a keyboard-driven command launcher on `⌘K` for route jumps and live shell actions
- `/candidates`: operator workbench grouped by backend-assigned blocker buckets, with routed candidate detail pages and URL-preserved `bucket`, `sort`, and row-focus state
- `/positions`: open-risk-first book, with backend-computed intervention priority, explicit exit reasoning, and URL-preserved `book`, `sort`, and row-focus state
- `/telemetry`: current diagnostics only. Trend-heavy history is intentionally pushed out of the app surface, with optional provider-aware Grafana pivots when configured
- `/settings`: draft-vs-active runtime control with validation, dry-run review, and explicit promotion; live cadence stays visible but read-only
- `/research`: still the isolated bounded dry-run review surface and not part of the main control desk
- The intended visual language is dark, restrained, and tool-like:
  black-led surfaces
  reduced corner radii
  restrained lime accent
  no glassmorphism

## Infra Shape

- Compose services: `postgres`, `db-setup`, `bot`, `dashboard`, `grafana`, `obsidian`
- Single compose file: [`../../trading_bot/docker-compose.yml`](../../trading_bot/docker-compose.yml)
- No Redis, no worker fleet, no alternate strategy runtime
- The repo now ships a local-only Grafana service with repo-owned provisioning under [`../../trading_bot/grafana/`](../../trading_bot/grafana/)
- The dashboard still does not host or proxy Grafana. It deep-links out to the provisioned dashboards through env-backed UIDs and `GRAFANA_BASE_URL`

## Repo Rules That Matter Here

- No Prisma migration files in this workflow.
- Schema edits live in `schema.prisma`; view edits live in `create_views.sql`.
- Historical analysis should come from candidates, positions, fills, snapshots, or provider telemetry, not from ad hoc dashboard-only state.
- The dashboard now has three API layers:
  compatibility reads like `/api/status`, desk contracts under `/api/desk/*`, and workflow-specific operator routes under `/api/operator/*`.
