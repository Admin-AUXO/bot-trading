---
type: session
status: active
area: dashboard
date: 2026-04-15
source_files:
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/dashboard/package.json
  - trading_bot/dashboard/package-lock.json
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/ag-grid-shared.tsx
  - trading_bot/dashboard/components/ag-grid-table.tsx
  - trading_bot/dashboard/components/candidates-grid.tsx
  - trading_bot/dashboard/components/positions-grid.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - notes/reference/api-surface.md
  - notes/reference/strategy.md
  - notes/reference/dashboard-operator-ui.md
graph_checked:
next_action: Browser-verify discovery-lab full-screen token details modal, cross-mode manual trade entry button state, and top-bar "Start Auto Live Bot" action prominence when LIVE startup hold is active.
---

# Session - Dashboard AG Grid And Compact Layout Pass

## Findings / Decisions

- The two high-volume operator workbenches (`/candidates`, `/positions`) needed a denser table system with better sorting/filtering ergonomics than static HTML tables.
- The dashboard also needed a compact pass across shared primitives so every page header and control block consumed less vertical space.
- Secondary row data should move out of base rows into an on-demand full-row modal.

## What Changed

- Added AG Grid community dependencies and global grid CSS imports.
- Added shared AG Grid helpers with:
  module registration
  status badge rendering
  full-row details modal
  common key/value formatting rules
- Added reusable AG Grid data-table component and switched `DataTable` in `dashboard-primitives.tsx` to use it, so telemetry and detail-page evidence tables inherit AG Grid behavior.
- Replaced the main `Candidates` and `Positions` queue tables with dedicated AG Grid client components:
  preserved inline actions (`Open`, `Pin`, `Grafana`, `Copy`)
  added `Full` row modal action
  preserved detail-page return focus semantics by parsing `#candidate-<id>` and `#position-<id>` hashes and scrolling/highlighting matching rows
- Replaced the discovery-lab desktop token-board table with AG Grid while keeping mobile stacked cards and retaining the existing heatmap/setup/manual-entry actions.
- Tightened shared dashboard density:
  smaller page hero and panel spacing
  smaller stat cards
  smaller button padding
  slightly tighter shell header height
  compact AG Grid theme tokens
- Rebuilt/recreated compose services with the repo script so the running stack picked up the AG Grid dashboard changes.
- Follow-up pass changed control behavior and discovery details:
  runtime no longer blocks manual discover/evaluate/exit-check/manual-entry actions to `LIVE` only
  shell actions are enabled in both modes, and LIVE startup hold now surfaces a first-class `Start Auto Live Bot` action label
  discovery-lab token details moved from a right-side drawer to a full-screen modal with richer two-column metric layout
  discovery-lab desktop table now defaults to higher-signal columns and moves secondary quant metrics into the modal
  AG Grid dark tokens were tightened to better match app surfaces and pinned action columns
  positions grid now hides `Intervention` in closed-book view and hides `Closed` in open-book view to reduce default clutter
  API and strategy reference notes were updated to document cross-mode control/manual-entry behavior
- Discovery-first dark-theme and info-flow pass refined the current discovery contract:
  AG Grid menus, filters, pagination, and pinned action areas now use the same near-black surface language as the rest of the desk instead of drifting back toward quartz defaults
  the discovery header now carries run context once in a compact summary strip before the live strategy pack and token board
  the sticky discovery action bar now separates build/edit actions from run/review actions
  the token board summary was reduced to scan-critical counts, and filters/search/timestamps now live in one darker control rail
  the full-screen token review modal now uses a sticky summary rail and a more ordered scan path: setup summary, EV/risk, market structure, timing/liquidity, recipe consensus, then watchouts

## What I Verified

- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot && ./scripts/update-compose-stack.sh`
- `cd trading_bot && docker compose ps bot dashboard`
- `node ./.codex/scripts/graphify-rebuild.mjs`

## Remaining Risks

- Browser verification is still pending for AG Grid visual balance, discovery result controls in sticky state, and the new token review modal on narrow breakpoints.
