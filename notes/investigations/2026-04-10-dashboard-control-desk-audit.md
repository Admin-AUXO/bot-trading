---
type: investigation
status: active
area: dashboard
date: 2026-04-10
source_files:
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/engine/risk-engine.ts
  - trading_bot/backend/src/engine/research-dry-run-engine.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/backend/src/services/operator-events.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/services/provider-budget-service.ts
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/prisma/views/create_views.sql
graph_checked: 2026-04-11
next_action: Browser-verify the workbench row actions and the candidate-detail and position-detail Grafana pivots once the runtime has at least one candidate row and one position row to test against.
---

# Investigation - Dashboard Control Desk Audit

## Trigger

Audit the Next.js dashboard and the backend surfaces that feed it, then plan how to turn the UI into a dark, modern control desk while moving heavier analytics to Grafana.

## Evidence

- Repo docs define the dashboard as the operator shell and recommend Grafana for heavier analytics.
- Live dashboard reviewed in browser on `http://127.0.0.1:3100` with backend healthy on `http://127.0.0.1:3101/health`.
- The shell duplicates status in the sidebar, sticky header, and footer.
- The overview page changes identity based on `tradeMode`, so `/` becomes a research page in `DRY_RUN`.
- Most pages use the same pattern:
  hero copy -> stat cards -> raw evidence tables -> long empty states.
- Backend `GET /api/status` returns a broad mixed snapshot instead of a desk-specific contract.
- Backend reporting views are useful for analysis and Grafana, but they are too generic for primary operator workflows.

## Hypotheses

- The dashboard feels cluttered because it is mixing three jobs:
  control desk, evidence inspection, and analytics/reporting.
- The shell feels verbose because the same runtime truth is repeated across multiple layout bands.
- The frontend over-explains because the backend does not expose page-shaped operator contracts, so the UI compensates with prose and generic tables.

## Findings

### Dashboard

- The shell is carrying repeated runtime state across the sidebar, top header, and footer instead of one clear command surface.
- `/` is not a stable command center. In `DRY_RUN`, it becomes a research explainer with research notes, config snapshot, and run comparison.
- `Candidates`, `Positions`, and `Telemetry` are row-dump pages. They expose evidence, but not workflows.
- `Settings` is a form wall with read-only cadence fields occupying high-value space.
- `PageHero`, `StatCard`, `DataTable`, and related primitives bias the app toward large narrative panels instead of dense operator tooling.

### Backend

- `GET /api/status` returns `latestCandidates`, `latestFills`, `providerSummary`, `providerBudget`, and research status in one mixed snapshot.
- Control routes return only `{ ok: true }`, forcing the frontend to refresh to discover the new effective state.
- Candidate, position, fill, snapshot, and payload routes are mostly raw storage reads with `limit`, not task-shaped operator endpoints.
- SQL views are already suitable for Grafana:
  daily funnels, provider history, endpoint efficiency, reject reasons, trigger mix, position performance.
- Risk and config services already calculate valuable desk state:
  live readiness, pause reason, daily loss guard, consecutive losses, max-open cap, and validated settings constraints.
- Research is already isolated at the backend and should remain off the main control desk.

## Decision

Plan the redesign around a strict split:

- Dashboard = control desk plus drill-down evidence
- Grafana = historical analytics, trend analysis, and dense reporting

Do not redesign the current UI by polishing the existing page pattern. Replace the information architecture first.

## Resolved Planning Decisions

### Control Desk Operating Model

- `/` stays the stable control desk in both `LIVE` and `DRY_RUN`.
- The desk refresh model is action-triggered refresh plus background polling on a short interval. Do not require streaming for the first implementation.
- The shell must be aggressively simplified:
  one compact command bar, one compact sidebar status block, no repeated footer summary.
- Command bar content is limited to:
  mode, health, primary blocker, last sync, and global actions.
- Risky state-changing actions require confirmation:
  pause or resume, live-affecting config promotion, and any manual run trigger deemed dangerous in `LIVE`.
- Action failure handling must be explicit:
  show the failure inline, emit an event, and do not optimistic-update the desk into a false state.

### Backend Contract Shape

- Do not keep extending `GET /api/status` for the new desk. Keep it only as a compatibility route during transition.
- Introduce a thin shell contract with global runtime facts only. It should include:
  mode, health, primary blocker, last sync, available global actions, and unread critical alerts.
- Introduce a dedicated home contract for the control desk body. It should include:
  readiness, guardrails, open exposure, queued work, provider pressure, recent failures, recent actions, and a compact diagnostics strip.
- Backend owns operator semantics. The frontend must not invent:
  primary blocker, intervention priority, candidate blocker buckets, or event meaning.
- Global actions should return action result metadata plus updated effective desk state in the same response.

### Event Model

- Build a real persisted operator and system event feed, not a derived fake one.
- The event feed should be backed by a dedicated backend-owned event store or table and populated by:
  command actions, runtime transitions, guardrail changes, provider degradation, and notable failures.
- The homepage event stream is a first-class control-desk component, not a decorative activity log.

### Page Model

#### `/`

- Purpose:
  stable command center for current state and recent evidence in both modes.
- Keep:
  readiness, blocker, guardrails, open exposure, queued work, provider pressure, compact diagnostics, and the unified event stream.
- Remove:
  research notes, config archaeology, run comparison, narrative hero copy, and trend-heavy analytics.

#### `/candidates`

- Purpose:
  operator workbench organised around intervention, not pipeline aesthetics.
- Primary segments should be operator decision buckets:
  ready, blocked by risk, blocked by provider, blocked by data quality.
- The backend assigns one primary blocker bucket plus optional secondary reasons.
- List state must preserve filters, sorting, and scroll position in the URL so operators can return without losing context.
- Candidate detail should be a dedicated routed page, not a transient drawer.
- Candidate detail should show:
  summary, normalized filter trace, snapshot history, and raw provider payload.

#### `/positions`

- Purpose:
  open-risk-first book management.
- Split into:
  open positions and closed positions.
- Open positions must sort by backend-computed intervention priority, not by recency.
- Intervention priority should be computed from:
  exit urgency, stop proximity, stale data, and guardrail pressure.
- Position detail should be a dedicated routed page with exit reasoning and fill trail.
- Long-horizon performance remains in Grafana.

#### `/research`

- Purpose:
  isolated dry-run review only.
- Keep:
  run picker, run summary, token shortlist, mock positions, and comparison against previous run.
- Research state must not leak back onto `/`.

#### `/telemetry`

- Purpose:
  current-fault drill-down only.
- The homepage carries the compact diagnostics strip.
- If `/telemetry` remains, it should focus on current provider faults, ingest staleness, budget pressure, and config drift.
- Historical telemetry and trend analysis move to Grafana.

#### `/settings`

- Purpose:
  safe runtime control with explicit promotion, not one giant mutable form.
- Model settings as dual-layer state:
  draft settings and active settings.
- Group editable controls into:
  Capital, Entry, Exit, Research, and Advanced.
- Read-only cadence and low-frequency config stay under `Advanced`.
- The UI must show:
  validation summary, dirty diff summary, and explicit promotion state.

### Settings Promotion Rules

- Live-affecting changes must not go straight from edit to active.
- Promotion flow is:
  draft edit -> validate -> dry run -> operator review -> promote active.
- Dry-run gating is required for any change that can alter:
  entries, exits, sizing, budgets, or guardrails.
- A dry run counts as passing when:
  validation passes, no new blocker is introduced, and the run summary is shown for operator review before promotion.
- If active settings change while a draft is open, the draft must be versioned against active and forced through re-review or rebase before promotion.

### Diagnostics and Degraded States

- The homepage must include a compact diagnostics strip with:
  top issues, stale components, and one-click drill-in.
- Partial data failure must not blank the desk.
- The desk should render degraded cards with explicit stale or unavailable states instead of pretending cached data is current.

### Grafana Integration

- Grafana links should be precise, not generic.
- Deep links should preserve entity and time context wherever possible:
  token, position, provider, route-specific filters, and relevant time window.
- Do not embed Grafana panels into the desk for the first pass.
- Good Grafana candidates remain:
  `v_candidate_funnel_daily`, `v_position_performance`, `v_api_provider_daily`, `v_api_endpoint_efficiency`, `v_candidate_reject_reason_daily`, `v_snapshot_trigger_daily`, `v_position_exit_reason_daily`.

## Implementation Sequence

1. Define the shell contract and the dedicated home contract in the backend.
2. Define and persist the operator/system event feed.
3. Refactor global actions so each returns action metadata plus updated effective desk state.
4. Rebuild the shell and `/` around the new contracts and compact diagnostics strip.
5. Rebuild `Candidates` around backend-assigned blocker buckets and routed detail pages.
6. Rebuild `Positions` around backend-computed intervention priority and routed detail pages.
7. Rework `Settings` into draft-vs-active promotion with validation, dry run, review, and promote.
8. Reduce `/telemetry` to current diagnostics only and move trend-heavy views to Grafana deep links.
9. Retire any desk dependence on generic reporting views once page-shaped operator endpoints are in place.

## Implementation Status

### Completed On 2026-04-10

- Added the thin shell contract, dedicated home contract, operator workbench routes, and persisted operator event feed in the backend.
- Reworked control actions so they return action metadata plus refreshed desk state instead of `{ ok: true }`.
- Rebuilt `/` as the stable control desk in both `LIVE` and `DRY_RUN`.
- Rebuilt `Candidates` and `Positions` around routed detail pages and backend-owned operator semantics.
- Reworked `Settings` into draft-versus-active control with validation, dry-run review, and explicit promotion.
- Reduced `/telemetry` to current diagnostics only.
- Added env-backed Grafana deep-link support in the dashboard for the desk, telemetry, candidate detail, and position detail surfaces.
- Added degraded-home fallback behavior so the desk renders explicit failure state instead of blanking on an initial home-contract failure.
- Rebuilt the code graph after the implementation landed.

### Completed On 2026-04-11

- Reworked [`../../trading_bot/dashboard/app/candidates/[id]/page.tsx`](../../trading_bot/dashboard/app/candidates/[id]/page.tsx) so the top section answers why the candidate matters now before dropping into gate evidence and raw payload history.
- Reworked [`../../trading_bot/dashboard/app/positions/[id]/page.tsx`](../../trading_bot/dashboard/app/positions/[id]/page.tsx) so the top section answers what needs action now before dropping into linked origin, metadata, fill trail, and snapshots.
- Tightened [`../../trading_bot/dashboard/app/telemetry/page.tsx`](../../trading_bot/dashboard/app/telemetry/page.tsx) into a clearer fault-console hierarchy.
- Tightened [`../../trading_bot/dashboard/app/research/page.tsx`](../../trading_bot/dashboard/app/research/page.tsx) into a clearer dry-run sandbox hierarchy.
- Rebuilt the code graph again after the page-contract updates landed.

### Verification

- Backend verification passed:
  `npm run db:generate`, `npm run typecheck`, `npm run build`
- Dashboard verification passed:
  `npm run build`
- Docker images were rebuilt for `bot` and `dashboard`, then the containers were restarted and returned healthy on `3101` and `3100`.
- Browser verification confirmed the running desk and workbench routes after the container refresh.
- Follow-up dashboard verification passed on 2026-04-11:
  `cd trading_bot/dashboard && npm run build`
- Follow-up route checks passed on 2026-04-11:
  `/`
  `/settings`
  `/candidates`
  `/positions`
  `/telemetry`
  `/research`
  all returned `200`
- Follow-up browser verification passed on 2026-04-11 using a temporary Playwright runtime against `http://127.0.0.1:3100`:
  homepage, settings, candidates, positions, telemetry, and research all rendered with the expected page jobs
  pinned-items persistence was verified across refresh and route change using the production local-storage key
- Screenshots captured during follow-up browser verification:
  `/tmp/dashboard-home-verify.png`
  `/tmp/dashboard-telemetry-verify.png`
  `/tmp/dashboard-research-verify.png`
- The dashboard container was updated from the fresh local build output and restarted healthy after the follow-up verification pass.

### Operational Caveats

- Earlier Prisma catalog trouble did not block the later Grafana rollout. A subsequent `db:setup` run completed successfully against the live Compose database after the `RuntimeConfigVersion` model and the Grafana reporting views were added.
- The repo now includes and runs a local Grafana service in Compose, provisioned from `trading_bot/grafana/`.
- Grafana pivots are no longer dormant. The desk and telemetry pivots now open provisioned dashboards on the local Grafana service.
- Candidate-detail and position-detail pivots still need real entity rows for end-to-end browser verification.
- The runtime currently has zero candidate rows and zero position rows across all workbench buckets and books, so row-level click-through checks are data-blocked rather than code-blocked.

### Remaining Next.js Dashboard Work

- Browser-verify the remaining data-gated flows once the runtime has real rows:
  inline workbench actions
  candidate detail Grafana pivot
  position detail Grafana pivot
  detail-page back-link round trip with bucket or book, sort, and focus
- Decide whether the homepage should expose additional Grafana exits beyond the current diagnostics-oriented path.
- Expand current-fault diagnostics only through backend-shaped operator fields. Do not let trend-heavy analytics leak back into the Next.js app.

## 2026-04-11 UX Planning Session

The user clarified the product shape through a question session before implementation. These answers narrow the redesign and should be treated as the current product direction unless contradicted later by a more deliberate decision note.

### Operator Priorities Confirmed

- Homepage job:
  command center for immediate action, not a passive status overview or executive summary
- Above-the-fold priority on `/`:
  top blockers and interventions
- `/candidates` primary job:
  fast triage by blocker and tradability
- `/positions` primary job:
  identify what needs intervention now
- Visual density:
  balanced operator UI, but table density should still lean toward a trading desk rather than a roomy SaaS console
- Copy rule:
  short labels only; explanation belongs in tooltips, not helper paragraphs
- First extra functionality worth adding:
  pinned watchlist plus inline quick actions
- Mobile:
  not a design driver for this pass
- Research:
  must stay visually and mentally separate from live operations
- Biggest current UX pain:
  settings flow first, then table scanability

### Resolution Update - 2026-04-11

- The pinned watchlist is no longer a pending design decision. It is implemented in the shell and homepage and browser-verified for local-storage persistence.
- The remaining uncertainty is strictly row-level verification once the runtime emits live entities again.

### Detailed Execution Plan

#### 1. Settings First

- Rework [`../../trading_bot/dashboard/components/settings-client.tsx`](../../trading_bot/dashboard/components/settings-client.tsx) around the explicit workflow:
  `Draft -> Validate -> Dry run -> Promote`
- Add:
  persistent step rail
  changed-field highlighting
  live-affecting badges
  inline diff against active values
  tooltip-only explanations for risky controls and promotion gates
- Remove:
  the generic form-editor feel
  low-signal summary-card dominance
  read-only advanced fields from the main path unless they actively affect the current review

#### 2. Candidates And Positions Workbenches

- Rework [`../../trading_bot/dashboard/app/candidates/page.tsx`](../../trading_bot/dashboard/app/candidates/page.tsx) and [`../../trading_bot/dashboard/app/positions/page.tsx`](../../trading_bot/dashboard/app/positions/page.tsx) into denser operator tables
- Add:
  stronger row emphasis for actionable rows
  sticky controls and clearer numeric alignment
  inline `Open`, `Pin`, `Grafana`, and `Copy` actions
  stronger urgency treatment for high-priority open positions
- Remove:
  flat same-weight row styling
  redundant framing that repeats what the table already says

#### 3. Global Shell

- Rework [`../../trading_bot/dashboard/components/app-shell.tsx`](../../trading_bot/dashboard/components/app-shell.tsx)
- Add:
  global pinned-items block in the sidebar
  route counts beside core nav items where backend data already exists or can be added cheaply
  tooltip-led explanation instead of extra copy
- Modify:
  header into a compact command rail rather than a second hero band
- Remove:
  excess vertical weight in branding and blocker chrome

#### 4. Homepage Tightening

- Rework [`../../trading_bot/dashboard/components/dashboard-client.tsx`](../../trading_bot/dashboard/components/dashboard-client.tsx)
- Keep:
  exposure and queue cards
- Add:
  ranked intervention stack
  compact pinned-items strip
  stronger visual path from blocker to next action
- Remove:
  quick-routes filler once shell shortcuts and pinning exist
  secondary cards that restate shell truth

#### 5. Detail Pages

- Rework [`../../trading_bot/dashboard/app/candidates/[id]/page.tsx`](../../trading_bot/dashboard/app/candidates/[id]/page.tsx) and [`../../trading_bot/dashboard/app/positions/[id]/page.tsx`](../../trading_bot/dashboard/app/positions/[id]/page.tsx)
- Add:
  clearer sequencing:
  summary first
  decision trace second
  raw evidence last
  stronger "why this matters now" block
- Remove:
  metadata sprawl that does not change operator action

#### 6. Telemetry And Research Separation

- Rework [`../../trading_bot/dashboard/app/telemetry/page.tsx`](../../trading_bot/dashboard/app/telemetry/page.tsx) as a stricter fault console
- Rework [`../../trading_bot/dashboard/app/research/page.tsx`](../../trading_bot/dashboard/app/research/page.tsx) so it reads as sandboxed review, not live ops
- Remove:
  any visual parity that makes research feel like a production control surface

#### 7. Shared UI System

- Rework [`../../trading_bot/dashboard/components/dashboard-primitives.tsx`](../../trading_bot/dashboard/components/dashboard-primitives.tsx) and [`../../trading_bot/dashboard/app/globals.css`](../../trading_bot/dashboard/app/globals.css)
- Add:
  clearer severity ladder
  denser table primitives
  tooltip-friendly label patterns
- Remove:
  remaining samey panel treatment where important, passive, and risky surfaces feel too similar

### Explicit Keep / Remove / Modify Rules

- Keep:
  Grafana split
  backend-owned operator semantics
  URL-preserved list context
  dark restrained visual direction
- Remove:
  explanatory filler copy
  quick-route filler panels
  duplicate shell truth
  broad equal-weight card styling
- Modify:
  table ergonomics
  settings workflow
  shell usefulness
  homepage prioritization
  detail-page sequencing

### Recommended Execution Order

1. Settings workflow
2. Candidates and positions workbenches
3. Global shell
4. Homepage
5. Detail pages
6. Telemetry and research
7. Shared primitive cleanup pass

The implementation pass did not stop at the first visual cleanup. A later polish pass finished the parts that were still too soft or too verbose.

What changed after the original audit:

- Branding in the operator chrome is now `Graduation Control`
- The shell gained a keyboard-driven command launcher on `⌘K`
- The event stream became more actionable and can drill into related candidate or position pages when the backend provides entity context
- Typography is now a deliberate split:
  `Manrope` for body copy
  `Space Grotesk` for headings
  `Geist Mono` for IDs and tabular data
- Radii were reduced across the UI so the desk feels more like a trading tool and less like a consumer admin surface
- Copy across the home page, workbenches, detail pages, telemetry, research, and settings was rewritten into shorter operator-facing language

Current assessment:

- The original diagnosis still stands. The win came from fixing hierarchy and page jobs, not from decorative restyling.
- The dashboard is now materially closer to the intended split:
  app for control and evidence
  Grafana for history and trend analysis

## Linked Notes

- [Reference Index](../reference/index.md)
- [API Surface](../reference/api-surface.md)
- [Prisma And Views](../reference/prisma-and-views.md)
- [Tech Stack](../reference/tech-stack.md)
- [Decision - Grafana Dashboard Plan](../decisions/2026-04-10-grafana-dashboard-plan.md)
