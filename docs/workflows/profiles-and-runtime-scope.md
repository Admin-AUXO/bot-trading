# Profiles And Runtime Scope

This repo has two truths:

- runtime scope = what the bot is actually doing
- analysis scope = what the user is inspecting

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

- header, sidebar, footer, overview shell, and control surfaces reflect runtime truth
- positions, trades, analytics, and quota drill-downs may inspect other lanes
- mixed-scope UI must say so plainly
- portfolio capacity comes from runtime portfolio truth, not filtered table length

## Profile Switching

Profile routes live in `backend/src/api/routes/profiles.ts`.

- activating a profile in a different mode does not switch the running runtime
- activating a profile in the same mode as the runtime may trigger a runtime switch
- runtime switching is blocked until positions in that mode are closed
- the current runtime profile cannot be deactivated until another profile is activated

## Dashboard Control Impact

- manual controls execute only on the active runtime lane
- a page may inspect another lane, but writes still target the active runtime lane
- settings exposes this distinction and blocks invalid switches
- editing the active runtime profile updates the live lane immediately; editing inactive profiles only changes future activation state

## Files To Update Together

- `backend/src/bootstrap/runtime.ts`
- `backend/src/api/routes/overview.ts`
- `backend/src/api/routes/profiles.ts`
- `dashboard/hooks/use-dashboard-shell.ts`
- `dashboard/hooks/use-dashboard-filters.ts`
- `dashboard/features/settings/settings-page.tsx`
- `dashboard/features/positions/positions-page.tsx`
