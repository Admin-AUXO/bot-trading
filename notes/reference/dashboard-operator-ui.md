---
type: reference
status: active
area: dashboard
date: 2026-04-15
source_files:
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/candidates-grid.tsx
  - trading_bot/dashboard/components/positions-grid.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/components/pinned-items.tsx
  - trading_bot/dashboard/components/workbench-row-actions.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/market/trending/page.tsx
  - trading_bot/dashboard/app/workbench/editor/page.tsx
  - trading_bot/dashboard/app/workbench/runs/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/backend/src/services/operator-desk.ts
graph_checked: 2026-04-14
next_action: Browser-verify the workbench and market routes against real Birdeye or Helius envs so pack editing, run review, deployment flow, and token lookup are checked outside build-only validation.

## Audit Log — 2026-04-19

### Docker API fix
- `compose.env` `API_URL` changed from `127.0.0.1:3101` to `bot:3101`
- Ensures container-to-container API routing works in Docker Compose setups

### TTL fixes (token-enrichment-service.ts)
- `pump.fun` TTL: increased to **60 min**
- `cielo` TTL: increased to **15 min**
- Both providers now have appropriately aggressive caching for production use

### Stat grid optimization
- Reduced stat columns from 5-6 to **3-4** per row
- Improves readability on standard viewports

### Back links
- Added back links to `/market/token/[mint]` page
- Preserves navigation context when drilling into token details

### Workbench routes
- `grader` and `sandbox` routes now show content instead of redirecting
- `/workbench/grader` and `/workbench/sandbox` are functional

### StatusTone utility
- Extracted status tone logic to `dashboard/lib/status.ts`
- Centralizes status coloring/tone decisions for reuse across components

### API routes
- All 12 API routes verified working end-to-end
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

- Body copy: `Plus Jakarta Sans`
- Headings: `Space Grotesk`
- IDs, hashes, mints, and tabular numeric surfaces: fallback monospace stack
- The goal is not font variety for its own sake. The split exists to keep hierarchy obvious with two font packages, smaller sizing, and tighter spacing.

## Shell Contract

- Sidebar owns primary route navigation
- The dashboard no longer adds app-level Basic Auth before rendering, and the local backend route surface no longer depends on mirrored dashboard control secrets
- Sidebar should present three grouped areas:
  `Operational desk`, `Strategy workbench`, and `Market intel`
- Sidebar item labels should match the route job directly:
  `Overview`, `Trading`, `Settings`, `Packs`, `Editor`, `Runs`, `Sessions`, `Trending`, `Watchlist`
- Sidebar active state must follow nested routes, so detail pages keep their parent section selected
- Sidebar also carries one compact shell-state block:
  mode
  open positions
  queued count
  sync
- Keep shell-state density high; do not repeat blocker, mode, health, and sync as separate large cards in both the sidebar and the header
- Sidebar should not carry a second current-page summary card beneath navigation; the shell rail stays for route navigation plus one compact shell-state row only
- The shell no longer duplicates discovery destinations under the primary groups. If a route belongs to workbench or market intel, reach it through that section instead of re-adding a second quick-link rail.
- Page headers should not repeat route-jump button rows when the sidebar already exposes those destinations; header actions stay for page-local work such as refresh, Grafana pivots, or run/apply controls
- Sync labels in the shell should prefer relative recency such as `5m ago` over full timestamps
- Desktop sidebar can collapse into an icon rail and should remember that state locally so the workbench can expand without losing route access
- Sidebar can carry one compact pinned-items watchlist below navigation when the operator desk needs repeated jumps back into the same candidate and position records
- When nothing is pinned, prefer hiding the watchlist in the sidebar instead of rendering another empty state
- Top bar owns:
  mode and health pills
  last sync
  command launcher
  refresh shell
  global runtime actions
- Browser-side writes that go through the dashboard proxy should trigger a route-level data refresh so post-action screens do not sit stale after pack runs, session starts, or settings applies
- Client components that seed local state from server props must resync when the route refreshes, unless they are intentionally preserving unsaved local edits
- Sticky page bars under the shell must anchor from the real shell-header height, not a route-local magic number
- When the backend boots in `LIVE`, the primary action should read as an explicit live-arm control rather than pretending live trading is already running
- Do not duplicate shell truth in extra footer summaries or decorative chrome

## Command Launcher

- Global launcher lives in the shell on `⌘K`
- It is for fast page jumps and shell actions
- Keep it compact and keyboard-first
- Do not turn it into a full search product or an unbounded command registry

## Page Jobs

- `/operational-desk/overview`: current control desk only, including compact diagnostics and provider fault surfaces
- `/operational-desk/trading`: unified lifecycle workbench for candidate intake and position management, with compact KPI header and segmented intake and book controls
- `/operational-desk/settings`: smaller runtime-control surface for desk-facing capital and cadence edits with direct apply
- `/workbench/packs`: pack library with list-first selection, clone/open/start-run actions, and no fake analytics filler
- `/workbench/editor`: pack editing and run launch in one focused workbench surface
- `/workbench/runs`: recent-run inspection, token-result review, grading, tuning suggestions, and apply-to-session review
- `/workbench/sessions`: deployment history and active session lifecycle
- `/market/trending`: market-wide pulse check with real fields only
- `/market/watchlist`: operator-owned watchlist for names worth reopening
- `/market/token/[mint]`: single-token detail and lookup target from candidate and market flows
- compatibility routes:
  `/`, `/trading`, `/settings`, `/discovery-lab/*`, `/candidates`, `/positions`, and `/telemetry` remain as redirects so old links keep working while primary navigation stays compact
- Redirect-only app route files should not linger in `app/` once `next.config.ts` owns the redirect. Delete the page file instead of keeping dead wrappers around.

## Detail Page Order

- Candidate detail pages answer `why this matters now` first
- Candidate detail pages show decision trace second
- Candidate detail pages keep normalized gate state and raw provider evidence below the top summary
- Candidate detail pages can collapse raw provider payload metadata behind a disclosure; snapshot history stays directly visible
- Position detail pages answer `what needs action` first
- Position detail pages keep execution and exit reasoning separate from raw fill and snapshot history
- Raw evidence belongs last unless a current blocker depends on it

## Workbench Rules

- Trading lifecycle keeps candidates and positions as dense tables, not card grids
- Main operator tables use shared native dashboard table primitives with compact defaults:
  sticky headers, compact inline actions, and scan-first columns
  content-heavy text columns should auto-wrap and expand naturally
  metric columns should align consistently and use subtle emphasis when ranking matters
  row actions should behave like normal links and buttons without grid-specific event traps
- Strategy workbench should feel like a compact operator toolchain:
  packs owns library and selection
  editor owns pack edits and run launch
  runs owns reopen, result review, verdict, and tuning review
  sessions owns deployment history
  the page header should stay compact and contextual; do not bring back a large local hero or a duplicated score-strip ahead of the editor
  workbench surfaces should not repeat the same pack or run facts in the header, sticky bars, and local cards at the same time; one compact context row plus one active-action bar is enough
  workbench list and editor surfaces should refresh passively on an operator-friendly cadence so newly started runs or session state changes appear without requiring a manual reload
  the builder should no longer force raw JSON as the primary editing surface for recipes; structured controls with suggested values, selects, and numeric inputs should own the common path, with raw JSON kept as an advanced escape hatch
  created packs still need explicit `clone`, `edit`, `start run`, and `delete` actions so operators do not guess how to begin
  pack selection should use an inline list or dropdown field instead of a permanent duplicate route rail on desktop
  pack details should use shared dashboard form primitives; multiline reasoning belongs in compact textareas instead of pretending every note fits in a one-line input
  strategy filters should use a field-first add-filter flow rather than an always-visible wall of metric inputs
  all repo-supported package filter fields should be editable from structured controls before the operator has to fall back to JSON, including relative-time fields plus creator, platform, size, volume, price, and trade filters
  strategy `mode` should not be an operator-owned field in the common path; derive it from the active stage filters and keep it as a compact summary instead
  strategy names should auto-generate from the active selections when the draft is validated, saved, or run; do not make the operator hand-maintain a parallel naming field
  builder support surfaces such as validation and regime guidance should sit together as secondary guidance, not as repeated full-width blocks scattered between editing steps
  validation should default to a collapsed disclosure instead of another always-open block
  the builder should surface the current Birdeye meme-list filter ceiling inline on the selected strategy, with validation warning at `5` provider-side filters and blocking above that unless the operator explicitly allows overfiltered runs
  all known meme-list filter fields supported by the repo should be available from structured controls before the operator has to fall back to JSON
  sort metric selection should expose the full repo-supported Birdeye meme-list sort surface in grouped selects, not only a short hand-picked subset
  threshold editing should read as grouped dynamic gates, not as one flat wall of unrelated numeric cards
  regime guidance should show only the threshold and live-handoff stats that are relevant to the current strategy mix or completed-winner calibration, not the full metric wall every time
  active run progress must be visible while the CLI is still working
  results should avoid duplicating run center, run summary, and output inventory as three separate always-open blocks; secondary run structure belongs behind disclosure or in the support rail
  results should own live progress, run history reopen, and completed review in one page so the operator does not bounce between sibling routes
  the results header should carry the current run context once, ahead of the live strategy pack and token board, instead of repeating the same package and run facts in several stacked panels
  the token board should appear before live-strategy tuning so review remains the first action on the results tab
  result-side secondary synthesis such as cohort rollups and adaptive previews should default behind disclosure instead of sitting above the token board
  live-strategy staging should open as a compact summary first, with the full editor hidden behind a disclosure until the operator is ready to tune and apply the active model
  the primary result surface should be a deduplicated token board keyed by mint, not a repeated per-strategy dump
  results should not spend vertical space on a duplicate outer frame before the token board
  result controls should read in one strip: filters, search, score timestamp, run duration, and a small amount of scan-critical summary
  token-board row actions should stay inline and compact; stacked vertical buttons in dense tables are wasted motion
  the result table should prioritize decision metrics over prose and include run-relative heatmap cells on selected columns
  desktop token-board tables now run on shared native tables; mobile stays on stacked cards
  token rows should expose direct external pivots that matter during triage: Axiom meme view, DexScreener, Rugcheck, Solscan token, and creator account when known
  token rows should surface tracked-open-position state inline so the operator does not accidentally re-enter the same mint from the results board
  each token row should expose a direct details action that opens a full-screen review surface, not a route jump
  the result board should take full page width and support full-screen review mode
  token details should surface price and structure context plus derived setup, conservative EV, risk, and outcome metrics without bloating base rows
  full-screen token review should also surface provider-backed project links, socials, creator context, live market pulse, and security posture so the operator can make the go/no-go call without leaving the modal
  full-screen token review should scan in this order: setup summary, EV/risk, market structure, timing/liquidity, recipe consensus, then watchouts
  full-screen token review should keep secondary evidence such as security flags and watchouts collapsed by default so the primary decision path stays above the fold
  the token review modal should keep a persistent summary rail with outcome, overlap, best score, confidence-weighted setup profile, and manual-entry CTA visible while scrolling
  manual entry from results must open a full-screen trade ticket instead of a browser confirm; the ticket should let the operator customize final size and exit settings before sending the managed entry
  compact run-review surfaces may use an inline ticket rail instead of a modal, but the manual-trade action still needs to stay on the run page with suggested size, optional exits, and a direct pivot into the opened position
  the trade ticket should expose quick size presets, exit-profile presets, derived stop and take-profit previews, validation feedback, and current open-slot or cash context so the operator does not edit a raw numeric wall blind
  the trade ticket should prefer two dense edit sections and one compact final-check rail rather than splitting every numeric field into its own card stack
  session-start forms should keep the explicit confirmation contract while providing a one-click phrase fill so DRY_RUN starts do not feel like captcha
  result rows and modals should prefer progress bars, colored badges, compact percent deltas, and scan-first metric strips over nested box stacks
  manual entry should refuse duplicate-mint opens and clearly hand the operator into the tracked open position when one already exists
  a compact market-regime strip and refresh timestamp should remain visible above table controls so operators can interpret table scores in context
  the market-stats route should show the overall pulse and the single-token lookup in one scan path instead of burying the lookup inside results modals
  market-stats should merge lookup, view-switching, and source legend into one compact operator bar before the board
  market-stats and strategy-ideas should surface freshness, stale-vs-empty state, and refresh controls in the header so operators can tell when a paid provider pull is about to happen
  market-stats and strategy-ideas should present their primary boards as horizontal card carousels on desktop so the operator can scan rich cards without pushing the page into long vertical stacks
  desktop market-stats and strategy-ideas carousels should target two cards per viewport, not three or four squeezed cards
  market-stats should mark Birdeye-derived slices as paid and Rugcheck/DexScreener-derived slices as free in both the source legend and the primary board scan path
  strategy-ideas should present confidence, session fit, threshold ranges, and pack shape without forcing the operator through raw JSON first
  strategy-ideas should support a direct `create draft` handoff into the workbench editor so free-provider signal review can become an editable pack without manual copy-paste
  strategy-ideas should keep raw threshold override values behind disclosure; threshold bars and pack-shape summary own the first scan path
  discovery-owned config should keep the hot parameters dense and directly editable; two-column rows beat one long vertical wall when the page is in discovery mode
  market-regime suggestions belong in `Builder` with one-click apply to local threshold overrides; they must never silently rewrite runtime settings
  source, strategy, and winner rollups should stay compact and secondary so the page does not drown the operator in helper tables
  raw per-strategy hits can stay available, but they should live behind a quieter secondary surface instead of dominating the page
  builder should prefer one primary column; side rails are acceptable on runs when they stay narrow, collapsible, and hidden by default on wide screens
  on narrow screens, discovery should open into an editing-first flow and results should degrade into stacked cards instead of forcing page-level horizontal scroll
  pack selection should support operator-local favorites so a desk can pin its preferred created or workspace packs without mutating backend state; the current workspace library keeps `Scalp tape + structure` alongside the three repo-seeded workspace packs
- The unified trading route keeps URL-backed text filtering so operators can jump to symbol, mint, blocker, or exit phrase without leaving keyboard flow
- Trading bucket and book selectors should read as compact count chips or segmented tabs, not as large scorecard rows
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

- Keep only the compact KPI rail plus `Next actions` and `System state` above the fold
- Prefer one shared compact header pattern across Desk and Trading:
  title
  status pills
  primary actions
  one dense summary stat strip immediately below
- Use the main body to rank interventions, surface diagnostics, and show the pinned watchlist
- Keep `System state` focused on current risk, queue, adaptive posture, and provider pace; push loop timestamps and guardrail chips behind disclosure instead of leaving them always open
- Provider and endpoint diagnostics tables should collapse behind a `Diagnostics detail` disclosure when they are empty or secondary
- Recent events should default behind disclosure so the desk keeps intervention ranking above the fold
- When nothing is pinned yet, collapse the watchlist into a small inline hint instead of a full empty band
- Homepage diagnostics must surface fresh provider payload failures; a green desk summary while the backend is logging live provider errors is a broken contract
- Do not reintroduce a filler quick-routes panel if the shell and pinned strip already cover navigation
- Page headers across the app stay compact: stacked title and description, status, actions, and a dense stat strip rather than a large hero void
- When a page is empty or degraded, swap broad stat walls and repeated empty cards for one compact warning/context row plus collapsed evidence
- Results, diagnostics, logs, and other secondary evidence should stay behind disclosure unless the page has active data that requires immediate attention

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
- Settings field help should use explicit tooltips, not native browser `title` hover text
- Use lime tint mainly for active route state, live-success state, and small functional emphasis surfaces, not for broad section fills
- Settings should avoid duplicating action rows; keep one sticky primary action bar and collapse validation or dry-run detail until review is necessary

## Screenshot Workflow

- Route inventory for page capture lives in `trading_bot/dashboard/scripts/dashboard-screenshot-manifest.mjs`
- Full-page capture lives in `trading_bot/dashboard/scripts/capture-dashboard-screenshots.mjs`
- Default commands:
  `cd trading_bot/dashboard && npm run screenshots:manifest`
  `cd trading_bot/dashboard && npm run screenshots:capture`
  `cd trading_bot/dashboard && npm run smoke:routes`
- The manifest should include real app routes plus compatibility redirects and add one candidate or position detail route when the backend has records available

## Grafana Split

- Historical analytics stay in Grafana
- The app should provide precise outbound pivots, not attempt to host trend-heavy analytics itself
- Candidate and position details can link to Grafana with entity and time context
- Discovery lab is the exception for current recipe experiments: it is allowed to render the full current-run token table in-app because that output is operational research, not historical reporting
- Discovery lab can add focused current-run UI polish with small headless packages when they solve concrete workflow problems such as tabs, dialogs, tooltips, or autosizing editors
- If a question is about history, cohorts, or trend analysis, push it to Grafana rather than adding more dashboard clutter

## Interaction Rules

- Routed detail pages must preserve list context through query state and focus anchors
- Candidate and position detail return links should route back into `/operational-desk/trading` while preserving the relevant `bucket|book`, sort, search, and focus state
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
- Do not turn the `/discovery-lab/*` area into a generic BI page; it owns package editing, strategy editing, run control, and current-run evidence only
