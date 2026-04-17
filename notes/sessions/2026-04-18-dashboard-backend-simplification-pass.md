---
type: session
status: active
area: dashboard/backend
date: 2026-04-18
source_files:
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/dashboard/positions-summary.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/shell/sidebar.tsx
  - trading_bot/dashboard/lib/dashboard-navigation.ts
  - trading_bot/dashboard/app/operational-desk/overview/page.tsx
  - trading_bot/dashboard/app/operational-desk/trading/page.tsx
  - trading_bot/backend/src/services/operator-desk.ts
next_action: Browser-check the desk overview and trading page against a live backend so the new scan order, disclosures, sticky controls, and dense live-position rows are verified outside build-only validation.
---

# Session - Dashboard Backend Simplification Pass

## Findings / Decisions

- The desk overview was still wasting fetches on diagnostics data it did not render.
- The shell carried duplicate navigation definitions in both `app-shell.tsx` and `sidebar.tsx`.
- The old overview kept too much evidence permanently open, which fought the repo's own operator-ui contract.
- `operator-desk.ts` duplicated the same latest-metrics and latest-fill lookup logic across home and position-book reads.

## What Changed

- Rebuilt the desk overview around one scan-first structure:
  compact KPI strip, `Next actions`, `System state`, dense open-position rows, and secondary evidence behind disclosures.
- Removed the unused overview diagnostics fetch and dropped the unused dashboard-side `DiagnosticsPayload` type.
- Replaced the overview-only `PipelinePanel` and `EventsList` files after their responsibilities moved into the new desk layout.
- Collapsed shell navigation into `trading_bot/dashboard/lib/dashboard-navigation.ts` so command palette and sidebar share one route contract.
- Simplified the trading page by extracting shared chip/search controls instead of repeating the same sticky workbench markup twice.
- Extracted shared position-support lookups in `trading_bot/backend/src/services/operator-desk.ts` and reused one recent-payload-failure helper.
- Audited detail-page actions against the real API surface and removed fake controls:
  candidate `block permanently` was calling a nonexistent route
  position `adjust stop loss` was pretending to edit one position while actually targeting global settings through a nonexistent route
  position `close position` was relabeled to the truthful global `run exit checks`
- Simplified detail actions down to honest controls only:
  candidate manual entry + discovery config
  position exit-check trigger + runtime settings + Solscan
- Removed discovery-config preset plumbing that depended on an absent `/api/settings/presets` endpoint and was already failing silently.

## What I Verified

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`

## Remaining Risks

- This pass is build-verified, not browser-verified.
- The open-position summary now scans denser than before; confirm desktop and mobile readability once the live desk is running.
- Repo graph rebuild is currently blocked by the local Graphify wrapper failing while trying to recreate `.graphify-venv` on Windows (`Unknown error: The file cannot be accessed by the system`).
