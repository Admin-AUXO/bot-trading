# Dashboard Overview

The dashboard is a thin App Router shell around shared runtime state, page-level filters, and a backend proxy.

## Primary Files

- `trading_bot/dashboard/app/layout.tsx`
- `trading_bot/dashboard/app/providers.tsx`
- `trading_bot/dashboard/components/layout/keyboard-provider.tsx`
- `trading_bot/dashboard/app/api/[...path]/route.ts`
- `trading_bot/dashboard/app/api/operator-session/route.ts`
- `trading_bot/dashboard/hooks/use-dashboard-shell.ts`
- `trading_bot/dashboard/hooks/use-dashboard-filters.ts`
- `trading_bot/dashboard/hooks/use-sse-notifications.ts`

## Provider Stack

1. `NuqsAdapter` for URL-state support
2. `Providers`
3. `ThemeProvider`
4. `QueryClientProvider`
5. `DashboardShellProvider`
6. `DashboardFiltersProvider`
7. `KeyboardShortcutsProvider`, which also mounts SSE notifications

## Shell Vs Filters

- `useDashboardShell()` owns runtime truth:
  overview, heartbeat, operator session, strategy config, quota snapshots, open positions, urgent positions, active scope
- `useDashboardFilters()` owns analysis state:
  selected mode, profile, strategy, trade source, and the derived effective analysis lane

That separation is deliberate. Do not collapse it.

## Proxy And Auth

- Browser requests go to `dashboard/app/api/[...path]/route.ts`
- The proxy forwards to `API_URL` and injects bearer auth for mutating routes and `/api/stream`
- Write requests also require a valid operator-session cookie
- Operator-session lifecycle lives in `app/api/operator-session/route.ts`

## SSE Flow

- Backend stream route is `/api/stream`
- Dashboard does not expose a standalone stream route file; the catch-all proxy forwards it
- SSE updates seed the overview query directly and invalidate heavier queries when trades, signals, or runtime scope change

## Route Shape

- App route files are thin wrappers
- Real page logic lives in `dashboard/features/*`
- `/analytics` and `/quota` use `Suspense` because their client pages depend on `useQueryState`

## Editing Rules

- Shared shell data belongs in `useDashboardShell`, not copied into every page
- Page-specific analysis filters belong in `useDashboardFilters`
- Keep mixed-scope UI labeled so runtime truth is not confused with filtered analytics subsets
