---
type: session
status: open
area: dashboard
date: 2026-04-10
source_files:
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/backend/src/services/operator-events.ts
  - trading_bot/dashboard/app/page.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/lib/grafana.ts
graph_checked: 2026-04-10
next_action: Verify candidate-detail and position-detail Grafana pivots once the runtime contains at least one candidate row and one position row.
---

# Session - Control Desk Implementation Handoff

## Context

This session took the dashboard control-desk audit from plan to implementation.

The backend now exposes a thin shell contract, a dedicated desk home contract, operator workbench routes, persisted operator events, and a draft or validate or dry-run or promote settings flow. The Next.js dashboard was rebuilt around those contracts so `/` is the stable control desk in both `LIVE` and `DRY_RUN`, `Candidates` and `Positions` are routed workbenches, `Telemetry` is current-fault only, and `Settings` is a safe promotion surface rather than a direct-write form wall.

## What Changed

- Added `RuntimeConfigDraft` and `OperatorEvent` to the Prisma schema.
- Added backend desk and operator routes in `server.ts`.
- Added backend desk shaping in `operator-desk.ts` and persisted event helpers in `operator-events.ts`.
- Reworked runtime config handling in `runtime-config.ts` and runtime action behavior in `runtime.ts`.
- Rebuilt the shell, homepage, candidates, positions, telemetry, and settings surfaces in the Next.js dashboard.
- Added `trading_bot/dashboard/lib/grafana.ts` so the app can emit precise outbound Grafana links when env is configured.
- Added degraded-home fallback so `/` renders explicit failure state instead of blanking if the home contract fails.
- Added URL-preserved workbench state:
  candidates preserve `bucket`, `sort`, and focused row
  positions preserve `book`, `sort`, and focused row
- Updated durable docs in:
  `notes/reference/api-surface.md`
  `notes/reference/tech-stack.md`
  `notes/reference/bootstrap-and-docker.md`
  `notes/reference/prisma-and-views.md`
  `notes/investigations/2026-04-10-dashboard-control-desk-audit.md`
  `notes/decisions/2026-04-10-grafana-dashboard-plan.md`
- Regenerated the repo graph with `./.codex/scripts/graphify-rebuild.sh`.

## What I Verified

- Backend:
  `cd trading_bot/backend && npm run db:generate`
  `cd trading_bot/backend && npm run typecheck`
  `cd trading_bot/backend && npm run build`
- Dashboard:
  `cd trading_bot/dashboard && npm run build`
- Docker:
  rebuilt `bot` and `dashboard`
  restarted both services with Compose
  confirmed healthy containers on `3101` and `3100`
- Browser:
  verified the running control desk on `http://127.0.0.1:3100/`
  verified candidates workbench query-state URLs on `http://127.0.0.1:3100/candidates?bucket=ready&sort=recent`

## Risks / Unknowns

- Prisma did not apply the additive `RuntimeConfigDraft` and `OperatorEvent` tables cleanly against the running database catalog.
- The required quoted tables were created directly in Postgres so the app could run:
  `"RuntimeConfigDraft"`
  `"OperatorEvent"`
- Do not assume `prisma db push` is healthy just because the app is healthy.
- Grafana is now provisioned locally from the repo and the desk plus telemetry pivots open real dashboards.
- The remaining unknown is entity-level verification:
  candidate-detail and position-detail pivots still need live rows to prove their variable propagation end to end.
- The app-side Grafana contract is already defined. If a dashboard cannot accept the app’s variables and time ranges, fix Grafana rather than weakening the app links.

## Next Action

1. Wait for non-empty candidate and position history in the runtime.
2. Verify the remaining outbound pivots from the live app:
   candidate detail
   position detail
3. If a dashboard cannot support the intended filters, update Grafana or the upstream SQL model rather than pushing more analytics back into Next.js.

## Durable Notes Updated

- [Dashboard Control Desk Audit](../investigations/2026-04-10-dashboard-control-desk-audit.md)
- [Decision - Grafana Dashboard Plan](../decisions/2026-04-10-grafana-dashboard-plan.md)
- [API Surface](../reference/api-surface.md)
- [Tech Stack](../reference/tech-stack.md)
- [Bootstrap And Docker](../reference/bootstrap-and-docker.md)
- [Prisma And Views](../reference/prisma-and-views.md)
