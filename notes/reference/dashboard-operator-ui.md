---
type: reference
status: active
area: dashboard
date: 2026-04-11
source_files:
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/backend/src/services/operator-desk.ts
graph_checked: 2026-04-11
next_action: Re-run row-level browser verification when the runtime has live candidate and position rows so the inline actions and detail-page Grafana pivots can be tested against real entities.
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
- Sidebar also carries one compact shell-state block:
  mode
  queued count
  open positions
  alert count
- Sidebar can carry one compact pinned-items watchlist below navigation when the operator desk needs repeated jumps back into the same candidate and position records
- Top bar owns:
  mode and health pills
  last sync
  command launcher
  refresh shell
  global runtime actions
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
- `/telemetry`: current diagnostics and faults, not trend analysis
- `/settings`: draft, validate, dry run, promote
- `/research`: bounded dry-run review only
- `/research` must show the backend failure note when a run fails; a red status chip without the actual error is dead weight

## Detail Page Order

- Candidate detail pages answer `why this matters now` first
- Candidate detail pages show decision trace second
- Candidate detail pages keep normalized gate state and raw provider evidence below the top summary
- Position detail pages answer `what needs action` first
- Position detail pages keep execution and exit reasoning separate from raw fill and snapshot history
- Raw evidence belongs last unless a current blocker depends on it

## Workbench Rules

- Candidates and positions stay as dense tables, not card grids
- Both workbenches support URL-backed text filtering through `q` so operators can jump to a symbol, mint, blocker, or exit phrase without leaving keyboard flow
- Row actions belong inline on the workbench:
  `Open`
  `Pin`
  `Grafana`
  `Copy`
- Sticky workbench controls are acceptable when they keep sort, bucket, or book state visible during scan-heavy use
- `Pin` creates a local watchlist surface in the shell and on the homepage; it does not create backend state
- Actionable rows should read differently from passive rows through density, tone, and urgency cues instead of extra prose

## Homepage Rules

- Keep only the exposure and queue stat cards above the fold
- Use the main body to rank interventions, surface diagnostics, and show the pinned watchlist
- Homepage diagnostics must surface fresh provider payload failures; a green desk summary while the backend is logging live provider errors is a broken contract
- Do not reintroduce a filler quick-routes panel if the shell and pinned strip already cover navigation

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

## Grafana Split

- Historical analytics stay in Grafana
- The app should provide precise outbound pivots, not attempt to host trend-heavy analytics itself
- Candidate and position details can link to Grafana with entity and time context
- If a question is about history, cohorts, or trend analysis, push it to Grafana rather than adding more dashboard clutter

## Interaction Rules

- Routed detail pages must preserve list context through query state and focus anchors
- Candidate and position detail return links must preserve `bucket|book`, `sort`, `q`, and `focus` when those params exist
- Event stream items should expose drill-ins when the backend provides a related entity
- Research-run events should deep-link into `/research?run=<id>` when the event carries a run entity id
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
