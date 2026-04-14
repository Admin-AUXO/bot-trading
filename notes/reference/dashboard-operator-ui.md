---
type: reference
status: active
area: dashboard
date: 2026-04-14
source_files:
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/components/pinned-items.tsx
  - trading_bot/dashboard/components/workbench-row-actions.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/discovery-lab/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/backend/src/services/operator-desk.ts
graph_checked: 2026-04-14
next_action: Browser-verify the redesigned discovery workflow against real Birdeye or Helius envs so run polling, package save/delete, strategy edits, and large current-run result tables are checked outside build-only validation.
---

# Dashboard Operator UI

Purpose: document the current UI contract for the Next.js operator desk so later sessions do not undo the dashboard back into a verbose admin panel.

## Naming

- Product-facing dashboard name: `Graduation Control`
- Use `graduation` language in active docs and UI copy
- Do not put the legacy `S2` label back into operator chrome or current repo docs unless the naming is deliberately changed again

## Visual Direction

- Dark-first surface model:
  black and near-black base surfaces
  white and neutral gray text
  restrained `#A3E635` accents for success, focus, and selective active state
- Do not wash whole pages or large cards in green
- Do not reintroduce glassmorphism, blur-heavy panels, or decorative glow layers
- Corners should be tighter than the first redesign:
  heroes, panels, cards, tables, forms, nav items, and sticky bars use moderate radii
  the dashboard should feel engineered, not soft

## Typography

- Body copy: `Manrope`
- Headings: `Space Grotesk`
- IDs, hashes, mints, and tabular numeric surfaces: `Geist Mono`
- The goal is not font variety for its own sake. The split exists to make hierarchy obvious:
  body stays readable
  headings get identity
  identifiers stay precise

## Shell Contract

- Sidebar owns primary route navigation
- Sidebar active state must follow nested routes, so detail pages keep their parent section selected
- Sidebar also carries one compact shell-state block:
  mode
  queued count
  open positions
  alert count
- Sidebar carries one compact current-page context block beneath navigation with route-specific quick links or focus chips
- Desktop sidebar can collapse into an icon rail and should remember that state locally so the workbench can expand without losing route access
- Sidebar can carry one compact pinned-items watchlist below navigation when the operator desk needs repeated jumps back into the same candidate and position records
- Top bar owns:
  mode and health pills
  last sync
  command launcher
  refresh shell
  global runtime actions
- Sticky page bars under the shell must anchor from the real shell-header height, not a route-local magic number
- When the backend boots in `LIVE`, the primary action should read as an explicit live-arm control rather than pretending live trading is already running
- Do not duplicate shell truth in extra footer summaries or decorative chrome

## Command Launcher

- Global launcher lives in the shell on `⌘K`
- It is for fast page jumps and shell actions
- Keep it compact and keyboard-first
- Do not turn it into a full search product or an unbounded command registry

## Page Jobs

- `/`: current control desk only
- `/candidates`: triage workbench by blocker bucket
- `/positions`: open-risk-first book and closed-book review
- `/discovery-lab`: results-first discovery workspace with three top tabs (`Results`, `Builder`, `Runs`), a sticky action bar for core package and run actions, market-regime guidance, and same-page full result review
- `/telemetry`: current diagnostics and faults, not trend analysis; active issues should lead before summary cards
- `/settings`: draft, validate, dry run, promote

## Detail Page Order

- Candidate detail pages answer `why this matters now` first
- Candidate detail pages show decision trace second
- Candidate detail pages keep normalized gate state and raw provider evidence below the top summary
- Candidate detail pages can collapse raw provider payload metadata behind a disclosure; snapshot history stays directly visible
- Position detail pages answer `what needs action` first
- Position detail pages keep execution and exit reasoning separate from raw fill and snapshot history
- Raw evidence belongs last unless a current blocker depends on it

## Workbench Rules

- Candidates and positions stay as dense tables, not card grids
- Discovery lab should feel like a compact research workbench:
  `Results` is the default entry tab
  top-level tabs are `Results`, `Builder`, `Runs`
  `Builder` combines package and strategy editing in one surface
  sticky core actions stay visible while scrolling: `New`, `Clone`, `Delete`, `Validate`, `Save`, `Run`, `Load run package`
  starter packages still need explicit `use`, `clone`, `load run package`, and `delete` actions so operators do not guess how to begin
  package editing remains split into `Basics` and `Thresholds`, with strategy editing directly below in the same builder tab
  active run progress must be visible while the CLI is still working
  the primary result surface should be a deduplicated token board keyed by mint, not a repeated per-strategy dump
  results should not spend vertical space on a duplicate outer frame before the token board
  the result table should prioritize decision metrics over prose and include run-relative heatmap cells on selected columns
  each token row should expose a direct details action that opens a full-screen review surface, not a route jump
  the result board should take full page width and support full-screen review mode
  token details should surface price and structure context plus derived setup, conservative EV, risk, and outcome metrics without bloating base rows
  a compact market-regime strip and refresh timestamp should remain visible above table controls so operators can interpret table scores in context
  market-regime suggestions belong in `Builder` with one-click apply to draft threshold overrides; they must never silently rewrite runtime settings
  source, strategy, and winner rollups should stay compact and secondary so the page does not drown the operator in helper tables
  raw per-strategy hits can stay available, but they should live behind a quieter secondary surface instead of dominating the page
  builder and runs support rails can stay present, but they should be narrow and collapsible on wide screens
  on narrow screens, discovery should open into an editing-first flow and results should degrade into stacked cards instead of forcing page-level horizontal scroll
- Both workbenches support URL-backed text filtering through `q` so operators can jump to a symbol, mint, blocker, or exit phrase without leaving keyboard flow
- Row actions belong inline on the workbench:
  `Open`
  `Pin`
  `Grafana`
  `Copy`
- Sticky workbench controls are acceptable when they keep sort, bucket, or book state visible during scan-heavy use
- `Pin` creates a local watchlist surface in the shell and on the homepage; it does not create backend state
- Mobile workbenches can collapse row actions behind a compact menu; desktop keeps inline `Open`, `Pin`, `Grafana`, and `Copy`
- Actionable rows should read differently from passive rows through density, tone, and urgency cues instead of extra prose

## Homepage Rules

- Keep only the exposure and queue stat cards above the fold
- Use the main body to rank interventions, surface diagnostics, and show the pinned watchlist
- When nothing is pinned yet, collapse the watchlist into a small inline hint instead of a full empty band
- Homepage diagnostics must surface fresh provider payload failures; a green desk summary while the backend is logging live provider errors is a broken contract
- Do not reintroduce a filler quick-routes panel if the shell and pinned strip already cover navigation
- Page headers across the app stay compact: short title, status, actions, and at most one concise aside summary block

## Copy Tone

- Use short operator-facing phrases
- Prefer labels like:
  `Snapshot`
  `Live checks`
  `Live faults`
  `Next actions`
  `Priority order`
- Avoid:
  explanatory hero paragraphs
  product-marketing tone
  “respectable box” filler copy
  repeating the same state in three different sentences
- If extra explanation is necessary, prefer tooltips or concise secondary text
- Use lime tint mainly for active route state, live-success state, and small functional emphasis surfaces, not for broad section fills

## Grafana Split

- Historical analytics stay in Grafana
- The app should provide precise outbound pivots, not attempt to host trend-heavy analytics itself
- Candidate and position details can link to Grafana with entity and time context
- Discovery lab is the exception for current recipe experiments: it is allowed to render the full current-run token table in-app because that output is operational research, not historical reporting
- Discovery lab can add focused current-run UI polish with small headless packages when they solve concrete workflow problems such as tabs, dialogs, tooltips, or autosizing editors
- If a question is about history, cohorts, or trend analysis, push it to Grafana rather than adding more dashboard clutter

## Interaction Rules

- Routed detail pages must preserve list context through query state and focus anchors
- Candidate and position detail return links must preserve `bucket|book`, `sort`, `q`, and `focus` when those params exist
- Event stream items should expose drill-ins when the backend provides a related entity
- Research-run events should not deep-link into removed dashboard routes
- Actions must feel trustworthy:
  explicit labels
  visible failure state
  no fake optimistic state

## Do Not Regress

- Do not widen page copy after the concise rewrite
- Do not add decorative gradients or glass overlays to “make it premium”
- Do not use green as a default fill for large sections
- Do not collapse all pages into the same hero-plus-cards cliché if the page job is different
- Do not weaken the Grafana split by dragging historical analytics back into Next.js
- Do not turn `/discovery-lab` into a generic BI page; it owns package editing, strategy editing, run control, and current-run evidence only
