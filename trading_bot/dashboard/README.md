# Dashboard Guide

This dashboard is the operator surface for the trading bot. It is a Next.js 16 App Router app with a centralized proxy/auth layer, shared shell state, page-owned feature modules, and semantic theming for both dark and light mode.

## Page Map

- `/`: overview of capital, exposure, regime, budget drift, and urgent positions
- `/positions`: open risk, close history, skipped-capacity review, and manual entry/exit controls
- `/trades`: trade tape plus signal pass/reject flow
- `/analytics`: expectancy, capital curve, execution quality, distribution, reject leakage, regime history, and wallet activity
- `/quota`: provider runway, daily burn history, monthly trajectory, and endpoint concentration
- `/settings`: bot controls, operator session, strategy config, risk limits, current quota pressure, pause reasons, wallet reconciliation, and config profiles

Page titles and descriptions live in `lib/page-meta.ts`. Keep those descriptions aligned with what the page actually answers.

## Data Flow

Use these files as the dashboard data contract:

- `lib/dashboard-query-options.ts`
  Defines canonical TanStack Query keys and query functions for shared resources.
- `hooks/use-dashboard-shell.ts`
  Aggregates overview, positions, heartbeat, and operator session into one shared shell model for header, sidebar, footer, and shell-level banners.
- `hooks/use-dashboard-filters.ts`
  Separates active runtime scope from page-level analysis filters so layout chrome can stay truthful while analytics can inspect other lanes.
- `lib/api.ts`
  Owns the request shapes returned from the backend proxy. If a backend route response changes, update the types here first.

Rules:

- If a filter varies by `days`, `mode`, `profile`, or `tradeSource`, the query key, request params, and backend route must all vary by the same fields.
- If operator state can contain multiple blockers, surface `pauseReasons` instead of collapsing everything to one string too early.
- Do not add new header/footer/sidebar queries for overview, positions, heartbeat, or operator session when `use-dashboard-shell.ts` already exposes them.
- `/api/overview` and `/api/control/*` are runtime-scope contracts. Do not pretend the user can ask them for arbitrary `mode/profile` lanes.
- Connection state is derived from heartbeat plus available shell data. Do not reintroduce a manual `connected` flag in client state.
- Keep compact metrics on `components/ui/summary-tile.tsx` unless a page has a stronger reason to diverge.
- `/api/overview/api-usage?days=N` is a compound contract now: current snapshots, persisted daily rows, monthly aggregates, and top endpoint spenders. Do not assume the old `{ daily, monthly }` shape.
- Service totals on `/quota` are global provider budgets. Only the endpoint table should be narrowed by analysis lane metadata, and only when that metadata exists.
- `/api/analytics/execution-quality` summarizes entry/exit slippage, fees, latency, and copy lag by strategy. Keep types in `lib/api.ts` aligned before using it in UI code.

## Control And Auth

The dashboard never talks to the backend directly from the browser. It goes through the Next.js proxy:

- `app/api/[...path]/route.ts`
  Central proxy to the backend. It injects bearer auth for privileged routes and rejects non-read methods without an authenticated operator session.
- `app/api/operator-session/route.ts`
  Issues and clears the httpOnly operator-session cookie used by the proxy.
- `lib/server/operator-session.ts`
  Reads the dashboard control secret and validates the session cookie.

Dashboard control secret env fallbacks:

- `DASHBOARD_OPERATOR_SECRET`
- `CONTROL_API_SECRET`
- `CONTROL_SECRET`
- `API_CONTROL_SECRET`
- `DASHBOARD_CONTROL_SECRET`

Operational rules:

- Backend mutating routes still require the backend control secret.
- The dashboard server must know the same secret if you want pause/resume/manual/profile actions to work through the proxy.
- Read-only routes may stay public. Mutating routes should go through the centralized proxy boundary instead of ad-hoc headers in client code.

## Theme And Motion

Theme tokens live in `app/globals.css` and chart color aliases live in `lib/chart-colors.ts`.

Rules:

- Use semantic CSS variables for surfaces, text, borders, and charts.
- Do not hard-code dark-only chart colors or tooltip colors in components.
- Light mode should be a first-class theme, not a partial override.
- Motion should clarify hierarchy and state changes. Dense tables should not animate every row gratuitously.
- Respect reduced motion through `components/layout/page-transition.tsx` and similar motion surfaces.

## Layout

Shell layout lives in:

- `components/layout/header.tsx`
- `components/layout/sidebar.tsx`
- `components/layout/footer.tsx`
- `components/ui/connection-banner.tsx`

Shell priorities:

- one shared source of truth for mode, freshness, operator access, open exposure, and bot state
- runtime scope in the chrome, analysis scope in the page filters, and no pretending those are the same thing
- compact operator context at the top of every page
- useful page descriptions instead of generic dashboard copy
- no duplicated status bands that disagree with each other

## Verification

For dashboard changes:

```bash
cd trading_bot/dashboard
npm run lint
npm run build
```

If a dashboard change also modifies backend route contracts, run:

```bash
cd trading_bot/backend
npm run build
```

Browser verification should confirm:

- page renders for `/`, `/positions`, `/trades`, `/analytics`, `/quota`, and `/settings`
- header, sidebar, and footer agree on mode, operator state, and connection state
- selected analysis filters are reflected in the actual requests where the backend supports them
- overview and control surfaces stay pinned to the active runtime scope even when analytics filters diverge
- quota page shows global service totals plus lane-focused endpoint concentration without assuming stale response shapes
- settings surfaces current provider budget, pause reasons, and any top-endpoint usage widgets without assuming stale response shapes
- search-param hooks remain behind the required Suspense boundaries
