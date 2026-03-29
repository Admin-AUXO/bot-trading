# Profiles And Runtime Scope

This repo has two different truths. Runtime scope decides what the bot is actually doing. Analysis scope decides what the user is inspecting.

## Runtime Scope

Runtime scope is the active execution lane:

- `mode`
- `configProfile`

Primary sources:

- `backend/src/core/runtime-state.ts`
- `backend/src/bootstrap/runtime.ts`
- `backend/src/api/routes/overview.ts`
- `backend/src/api/routes/control.ts`
- `dashboard/hooks/use-dashboard-shell.ts`

## Analysis Scope

Analysis scope comes from dashboard filters:

- selected mode
- selected profile
- selected strategy
- selected trade source

Primary source:

- `dashboard/hooks/use-dashboard-filters.ts`

## Rules

- Header, sidebar, footer, overview shell, and control surfaces should reflect runtime truth
- Positions, trades, analytics, and quota drill-downs may inspect other lanes
- Mixed-scope UI must say so plainly
- Portfolio capacity comes from runtime portfolio truth, not filtered table length

## Profile Switching

Profile routes live in `backend/src/api/routes/profiles.ts`.

Important behavior:

- activating a profile in a different mode does not switch the running runtime
- activating a profile in the same mode as the runtime may trigger a runtime switch
- runtime switching is blocked until positions in that mode are closed
- the current runtime profile cannot be deactivated until another profile is activated

## Dashboard Control Impact

- manual controls execute only on the active runtime lane
- a page can inspect another lane, but writes still target the active runtime lane
- settings page exposes this distinction and blocks invalid switches

## Files To Update Together

- `backend/src/bootstrap/runtime.ts`
- `backend/src/api/routes/overview.ts`
- `backend/src/api/routes/profiles.ts`
- `dashboard/hooks/use-dashboard-shell.ts`
- `dashboard/hooks/use-dashboard-filters.ts`
- `dashboard/features/settings/settings-page.tsx`
- `dashboard/features/positions/positions-page.tsx`
