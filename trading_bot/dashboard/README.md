# Dashboard Guide

This is the operator surface for the trading bot. It is a Next.js 16 App Router app with a centralized proxy/auth layer, shared runtime shell state, page-owned feature modules, and semantic theme tokens.

## Structure

- `app/*`: thin route wrappers
- `features/*`: route-owned page implementations
- `app/providers.tsx`: theme, query client, dashboard shell, dashboard filters
- `components/layout/keyboard-provider.tsx`: mounts SSE notifications and keyboard shortcuts
- `hooks/use-dashboard-shell.ts`: runtime shell truth for chrome and shell summaries
- `hooks/use-dashboard-filters.ts`: page-level analysis filters
- `lib/dashboard-query-options.ts`: canonical query keys and query functions
- `lib/api.ts`: request/response contracts plus `createSSEConnection()`
- `lib/page-meta.ts`: page titles and descriptions

## Pages

- `/`: runtime overview, quota pressure, regime, and next forced exit
- `/positions`: open positions, close history, capacity truth, manual controls
- `/trades`: fills, signals, rejections, and filter evidence
- `/analytics`: expectancy, execution quality, capital curve, distributions, scope badges
- `/quota`: provider runway, endpoint concentration, quota-specific blockers
- `/settings`: bot controls, operator session, strategy config, live-entry guardrails, reconciliation, profile management, profile override visibility, and inline override editing

## Data And Scope Rules

- `useDashboardShell()` queries `overview`, `heartbeat`, `operatorSession`, and `strategyConfig`. Shell positions and quota state are derived from overview data; do not add duplicate shell-level queries for the same truth.
- `useDashboardFilters()` separates analysis filters from the active runtime lane. Chrome and controls reflect runtime truth; analysis pages may inspect other `mode/profile` lanes.
- Request params use `profile`; persisted/runtime fields are `configProfile`. Keep the terminology straight.
- If a query key varies by `days`, `mode`, `profile`, or `tradeSource`, the request and backend route must vary by the same dimensions.
- `tradeSource` applies to fills and analytics, not raw signal rows.
- `/api/overview`, `/api/control/*`, and `/api/stream` are active-runtime contracts.
- `/api/overview/api-usage` keeps service totals and quota history global. Only endpoint rows narrow by lane metadata.
- Capacity widgets must use runtime portfolio truth, not filtered row counts.
- Aggregate percentages from strategy rows must be weighted by the underlying counts.
- Profile activation is a runtime action for the active mode and must stay blocked while that mode still has open positions.

## Auth And Transport

- Browser traffic goes through `app/api/[...path]/route.ts`.
- The proxy injects backend bearer auth for every non-read request and for `GET /api/stream`.
- Non-read requests also require an authenticated operator-session cookie from `app/api/operator-session/route.ts`.
- The dashboard secret fallback chain is:
  - `DASHBOARD_OPERATOR_SECRET`
  - `CONTROL_API_SECRET`
  - `CONTROL_SECRET`
  - `API_CONTROL_SECRET`
  - `DASHBOARD_CONTROL_SECRET`
- SSE is opened by `createSSEConnection()` at `/api/stream`, proxied upstream by the catch-all route, and mounted from `components/layout/keyboard-provider.tsx`.
- Only queries wired through the realtime backstop logic stand down while SSE is healthy. Do not assume every query stops polling.

## Theme

- Semantic surface and text tokens live in `app/globals.css`.
- Chart aliases live in `lib/chart-colors.ts`.
- Use those tokens instead of page-local light/dark literals.

## Verification

Run:

```powershell
cd trading_bot/dashboard
npm run lint
npm run build
```

If route contracts changed, also run:

```powershell
cd trading_bot/backend
npm run build
```

Browser verification should confirm:

- all six routes render
- shell chrome agrees on runtime mode, operator access, and connection state
- analysis filters only affect requests where the backend supports those dimensions
- overview and control surfaces stay pinned to the active runtime lane
- manual controls disable cleanly when the inspected lane is not the active runtime lane
- quota pages keep global service totals separate from lane-filtered endpoint rows
- search-param hooks stay behind the required Suspense boundaries
