---
type: session
status: active
area: dashboard
date: 2026-04-15
source_files:
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/ag-grid-shared.tsx
  - trading_bot/dashboard/components/ag-grid-table.tsx
  - trading_bot/dashboard/components/workbench-row-actions.tsx
  - trading_bot/dashboard/components/candidates-grid.tsx
  - trading_bot/dashboard/components/positions-grid.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/app/page.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/discovery-lab/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/settings/page.tsx
  - notes/reference/dashboard-operator-ui.md
graph_checked: 2026-04-14
next_action: Compact the dashboard by keeping one hero, one primary work surface, and one optional support rail per page; move secondary evidence into modals or disclosure panels instead of adding more stacked sections.
---

# Session - Dashboard Compact Layout Handoff

## Context

The current dashboard already has the right functional surface area. The remaining work is layout discipline:

- keep the shell global and compact
- keep page headers short
- keep one primary surface per page
- move secondary evidence into tables, dialogs, or collapsible sections

The goal is not fewer features. The goal is fewer repeated summaries and fewer stacked panels that say the same thing in different ways.

## 2026-04-15 Follow-On Pass

- Added reproducible route capture scripts under `trading_bot/dashboard/scripts/`:
  - `dashboard-screenshot-manifest.mjs`
  - `capture-dashboard-screenshots.mjs`
- The manifest now inventories the four real app pages, the three compatibility redirects, and one candidate or position detail route when backend data is available
- Reduced always-open dashboard chrome:
  - `Desk` now keeps loop timestamps and guardrails behind disclosure, and recent events are collapsed by default
  - `Trading` bucket and book selectors were compacted from scorecard-style blocks into denser count chips
  - `Discovery Results` secondary analysis panels now stay collapsed until requested
  - `Settings` removed the duplicate top action row and collapses validation or dry-run detail unless it needs attention
- Verification state:
  - `npm run screenshots:manifest` works
  - `npm run build` passes
  - real screenshot capture still depends on a live dashboard/backend and an unsandboxed browser launch in the local environment

## Shared Component Plan

- `AppShell`
  - Purpose: global navigation, runtime status, pinned items, command launcher, live actions.
  - Shape: fixed sidebar, sticky header, full-width main canvas.
  - Keep: route counts, current-page context, last sync, live-arm button, collapse state.

- `PageHero`
  - Purpose: page identity plus one short summary and one action cluster.
  - Shape: full row width, auto height, compact padding.
  - Keep: title, status pill, short aside, one primary action group.

- `Panel`
  - Purpose: shared section container.
  - Shape: full row width by default, auto height.
  - Keep: title, eyebrow, optional description, optional action.

- `StatCard` / `ScanStat`
  - Purpose: high-signal metrics only.
  - Shape: grid cards, auto height.
  - Keep: one metric and one short detail line.

- `DataTable` / `AgGridTable`
  - Purpose: dense row-heavy evidence surface.
  - Shape: full width panel, fixed table viewport height.
  - Keep: sort, filter, pagination, full-row modal.

- `RowDetailsDialog`
  - Purpose: full-record drilldown without bloating base rows.
  - Shape: modal, `max-h-[88vh]`.
  - Keep: on-demand details only.

- `WorkbenchRowActions`
  - Purpose: standard row actions across workbenches.
  - Shape: inline on desktop, compact menu on mobile.
  - Keep: `Open`, `Pin`, `Grafana`, `Copy`.

## Page Plan

### `/`

- Purpose: operational home.
- Layout order:
  - hero
  - exposure and queue stat cards
  - pinned-items strip
  - priority order panel
  - diagnostics panel
  - guardrails panel
  - provider pace panel
  - recent failures
  - recent events
- Width/height:
  - each section is full row width
  - panels auto size to content
  - keep the page visually shallow by limiting cards to two rows max

### `/candidates`

- Purpose: triage workbench.
- Layout order:
  - hero
  - bucket scorecards
  - sticky sort/search bar
  - queue panel
- Width/height:
  - bucket cards span one full-width row grid
  - queue table is full width
  - table viewport should stay around `h-[min(62vh,43rem)]`
- Functionality:
  - bucket switching
  - sort switching
  - URL-backed search
  - row actions
  - row details modal

### `/candidates/[id]`

- Purpose: explain why the candidate matters now.
- Layout order:
  - hero
  - `Now` summary card
  - `Why it matters now`
  - `Decision trace`
  - `Filter trace`
  - `Stored metadata`
  - `Snapshot history`
  - collapsed provider payloads
- Width/height:
  - stacked full-width panels
  - evidence sections auto height
  - raw payloads last and collapsed

### `/positions`

- Purpose: risk-first book view.
- Layout order:
  - hero
  - open-book / closed-book scorecards
  - sticky sort/search bar
  - positions panel
- Width/height:
  - scorecards are one full-width row grid
  - table is full width
  - table viewport should stay around `h-[min(62vh,43rem)]`
- Functionality:
  - book switching
  - sort switching
  - URL-backed search
  - row actions
  - row details modal

### `/positions/[id]`

- Purpose: explain what needs action.
- Layout order:
  - hero
  - `Now` summary card
  - `What needs action`
  - `Decision trace`
  - `Linked candidate`
  - `Stored metadata`
  - `Fill trail`
  - `Snapshot history`
- Width/height:
  - stacked full-width panels
  - history tables stay inside table viewport limits

### `/discovery-lab`

- Purpose: the only complex workbench.
- Layout order:
  - compact header
  - sticky action bar
  - message/error banner
  - tabs
- Tabs:
  - `Results`
  - `Builder`
  - `Runs`
- Width/height:
  - sticky bars stay narrow and full width
  - tab bodies fill the remaining page width

### `/discovery-lab` `Results`

- Purpose: current-run review and live strategy staging.
- Layout order:
  - live strategy pack panel
  - token board
  - raw hits disclosure
  - research summary disclosure
- Width/height:
  - live pack panel full width
  - desktop token board full width, around `h-[min(62vh,40rem)]`
  - immersive mode can expand to `h-[calc(100vh-22rem)]`
  - mobile degrades to stacked cards
- Functionality:
  - filter/search
  - market-regime strip
  - manual trade entry
  - full-screen review
  - token details modal

### `/discovery-lab` `Builder`

- Purpose: edit packs and strategies.
- Layout order:
  - market regime suggestions
  - package editor
  - package library
  - strategy studio
  - validation rail
- Width/height:
  - full-width primary column
  - optional narrow support rail on wide screens
- Functionality:
  - draft package edit
  - basics/thresholds tabs
  - strategy search, add, duplicate, remove, reorder
  - validation
  - apply regime overrides

### `/discovery-lab` `Runs`

- Purpose: launch and monitor runs.
- Layout order:
  - run center
  - CLI preview
  - run summary
  - live log
  - run history
  - support rail
- Width/height:
  - main panels full width
  - logs scroll inside their own panel
- Functionality:
  - start/poll runs
  - reopen run details
  - inspect stdout/stderr

### `/telemetry`

- Purpose: faults first.
- Layout order:
  - hero
  - live summary aside
  - active issues
  - provider stat cards
  - provider pressure table
  - endpoint faults table
- Width/height:
  - tables are full-width panels
  - keep stats compact and secondary

### `/settings`

- Purpose: draft → validate → dry run → promote.
- Layout order:
  - hero
  - promotion rail
  - summary card
  - error/message banners
  - section navigator
  - selected section editor
  - validation summary
  - dry-run review
  - sticky bottom actions
- Width/height:
  - full-width panels
  - bottom action bar is sticky and compact

## Removal / De-duplication Targets

- Keep only one page-level action surface where a global shell action already exists.
- Merge or remove duplicate summaries in `/settings`.
- Collapse `/telemetry` stat cards into a smaller live summary if space gets tight.
- Consider dropping `/discovery-lab` raw-hits disclosure first if the page needs to shrink.
- Merge candidate/position `Stored metadata` and `Filter trace` if the detail pages feel too long.

## Next Steps

1. Rework the dashboard around the compact page plan above.
2. Keep every page to one hero, one primary work surface, and at most one support rail.
3. Move secondary facts into modals or disclosure panels.
4. Re-check widths/heights after any future browser pass.

## Durable Notes Updated

- `notes/sessions/index.md`
