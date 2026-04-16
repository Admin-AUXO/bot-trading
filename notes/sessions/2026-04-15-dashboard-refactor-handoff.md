---
type: session
status: active
area: dashboard
date: 2026-04-15
source_files:
  - trading_bot/dashboard/package.json
  - trading_bot/dashboard/package-lock.json
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/page.tsx
  - trading_bot/dashboard/app/trading/page.tsx
  - trading_bot/dashboard/app/settings/page.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/components/ui-toast.tsx
  - trading_bot/dashboard/components/ui/button.tsx
  - trading_bot/dashboard/components/ui/card.tsx
  - trading_bot/dashboard/components/ui/badge.tsx
  - trading_bot/dashboard/components/ui/input.tsx
  - trading_bot/dashboard/components/ui/separator.tsx
  - trading_bot/dashboard/components/ui/cn.ts
  - trading_bot/dashboard/components/workflow-ui.tsx
  - trading_bot/dashboard/components/ag-grid-table.tsx
  - trading_bot/dashboard/components/candidates-grid.tsx
  - trading_bot/dashboard/components/positions-grid.tsx
  - notes/reference/dashboard-operator-ui.md
  - notes/reference/api-surface.md
graph_checked:
next_action: Follow up on remaining UI-heavy slices only if needed: Trading adaptive explanation and any leftover Builder polish.
---

# Session - Full Dashboard Refactor Handoff

This handoff is aligned to the original approved plan:

- `Desk`
- `Trading`
- `Discovery Lab`
- `Settings`
- discovery-led adaptive live-strategy model
- repo-local Radix + shadcn-style component layer

The structure below marks the original phases and contracts as `done`, `partial`, or `left`.

## Verified UI Outcomes

- Discovery Lab no longer has redundant in-page section controls on studio, run, or results.
- Studio and config transitions are route-owned instead of local tab-state driven.
- Results should surface completed runs only.
- `/discovery-lab/overview` remains a dedicated page and now matches the shared theme/workflow language.
- Typography and spacing were tightened globally with two font packages and smaller sizing.

## Current Status Against The Original Plan

### Summary and information architecture

Status: `partial`

Done:

- top-level route model is now effectively:
  - `/` -> `Desk`
  - `/trading` -> merged lifecycle workbench
  - `/discovery-lab`
  - `/settings`
- `/candidates`, `/positions`, and `/telemetry` were reduced to compatibility redirects
- telemetry content was folded into `Desk`
- candidate and position list workbenches were folded into `Trading`

Left:

- detail pages still exist as routed pages
- the long-term plan to replace more of that depth with contextual full-screen review is not finished

### Product model and adaptive live strategy

Status: `partial`

Done:

- Discovery Results now shows winner cohort and adaptive-band preview surfaces
- Desk now has an adaptive-live status block
- Settings now includes live-strategy governance cards for active vs draft live strategy

Left:

- current cohort and band surfaces are UI-derived summaries, not backend-backed contracts
- no real token-level adaptive explanation fields exist yet in candidate/position payloads
- active adaptive model state is not yet exposed from backend in the full shape the plan asked for

### Route contract: Desk

Status: `partial`

Done:

- Desk is now the operational home
- telemetry/faults and provider pressure are embedded into Desk
- intervention ranking, pinned items, recent failures, and recent events are visible
- adaptive-live status has a dedicated surface

Left:

- adaptive model block does not yet show real backend-backed:
  - active source run / pack
  - band count / status
  - stale / degraded calibration warnings
  - whether automation is using adaptive logic

### Route contract: Trading

Status: `partial`

Done:

- `/trading` exists and is the merged lifecycle route
- candidate intake and position lifecycle are managed from one route
- shared URL state exists for candidate and position slices
- detail pages now return into `/trading`

Left:

- Trading does not yet show real adaptive visibility per candidate/position:
  - matched band
  - key live metrics
  - changed entry posture
  - changed size posture
  - changed exit posture
- row-level adaptive badges and explanation are still missing

### Route contract: Discovery Lab

Status: `partial`

Done:

- discovery sections are route-owned rather than driven by an in-page section rail
- `/discovery-lab/overview` stays as a dedicated landing page
- Results remains the review-first surface and should only surface completed runs
- current-run review, manual entry, market-regime strip, token board, full-screen token review, and cohort/band preview are present
- shared theme, typography, and spacing now match the rest of the dashboard
- shadcn-style component adoption improved result controls and layout rhythm

Left:

- `Builder` has not been fully rewritten to the planned grouped editing model
- no full implementation yet for:
  - `FormSection`
  - `ThresholdEditor`
  - `StrategyEditorList`
  - `BandRuleEditor`
  - `ValidationRail`
  - `LiveImpactSummaryCard`
- adaptive band authoring is not yet a real persisted builder flow

### Route contract: Settings

Status: `partial`

Done:

- Settings is no longer a plain settings dump
- it now includes:
  - promotion rail
  - validation summary
  - dry-run review
  - promotion review
  - live-strategy governance view

Left:

- still missing the fuller contract the plan described:
  - richer draft-vs-active comparison surface
  - stronger automation/live control surface
  - clearer breakdown of what runtime behavior changes on promote
  - more explicit separation between low-risk edits and live-affecting sections

### Deep review model

Status: `partial`

Done:

- Discovery token review is already on a full-screen surface
- candidate and position detail pages remain structured around decision-first ordering

Left:

- candidate review, position review, run review, and adaptive-band review are not yet consolidated into a unified full-screen review system
- route-based detail pages still carry more of the load than the original plan intended

### Design system and package strategy

Status: `done` for foundation, `partial` for adoption depth

Done:

- repo-local shadcn-style primitives now exist under `trading_bot/dashboard/components/ui/`
- shared workflow wrappers exist in `trading_bot/dashboard/components/workflow-ui.tsx`
- added packages from the approved direction:
  - `@tanstack/react-form`
  - `zod`
  - `cmdk`
  - `sonner`
  - `class-variance-authority`
  - `tailwind-merge`
- global toast plumbing is mounted
- shell, desk, trading, discovery results, and parts of settings now consume the new shared layer

Left:

- the form stack is not yet actually used in Discovery Builder
- the shared component inventory from the plan is only partially realized in implementation

## Phase Status From The Original Plan

### Phase 1: foundation and shell

Status: `done`

Delivered:

- package dependencies added
- repo-local UI foundation layer created
- shell refactored
- toast system mounted
- shared page-level primitive adoption started

### Phase 2: Discovery Lab rewrite

Status: `partial`

Delivered:

- Results surface upgraded
- cohort and adaptive preview added
- existing run/manual-entry flows preserved

Left:

- Builder rewrite
- strategy-editing flow modernization
- adaptive-band authoring as a real product surface

### Phase 3: Trading lifecycle merge

Status: `partial`

Delivered:

- merged lifecycle route exists
- legacy list pages redirected
- unified URL state and workflow routing in place

Left:

- adaptive explanation in rows and review surfaces

### Phase 4: Desk and telemetry merge

Status: `done`

### 2026-04-16 Two-Area Dashboard Split

Status: `done`

Delivered:

- the dashboard shell now presents two grouped product areas:
  - `Operational desk`
  - `Discovery lab`
- nested routes were added under each area:
  - `/operational-desk/overview`
  - `/operational-desk/trading`
  - `/operational-desk/settings`
  - `/discovery-lab/overview`
  - `/discovery-lab/studio`
  - `/discovery-lab/run-lab`
  - `/discovery-lab/results`
  - `/discovery-lab/config`
- common shell components, page primitives, and the shared dark theme were kept intact across both areas so the split reads as one product family rather than two unrelated apps
- settings was refactored into scoped views:
  - operational desk keeps runtime, capital, cadence, and promotion review controls
  - discovery lab keeps strategy, filters, exits, and research-cap configuration
- compatibility redirects were preserved for:
  - `/`
  - `/trading`
  - `/settings`
  - `/discovery-lab`
  - `/candidates`
  - `/positions`
  - `/telemetry`

Verified:

- `cd trading_bot/dashboard && npm run build`

Remaining risks / follow-ups:

- browser-verify the new route tree in a live dashboard session, especially nested active state and route transitions between the two areas
- confirm the compatibility redirects stay stable as the new route tree continues to evolve
- keep the shared shell, shared primitives, and shared typography/layout rules aligned so the two areas do not drift visually or behaviorally

Delivered:

- telemetry moved into Desk
- Desk is now the live home

### Phase 5: Settings promotion governance

Status: `partial`

Delivered:

- governance framing and promotion review now exist

Left:

- deeper diffing and runtime-impact review
- stronger automation/live control surfaces

### Phase 6: cleanup and route retirement

Status: `partial`

Delivered:

- compatibility redirects exist
- docs were updated

Left:

- broader cleanup once deeper review surfaces replace more routed detail flows

## Verification Completed

- `cd trading_bot/dashboard && npm run build`

Additional fixed regressions during the refactor:

- hydration mismatch from `AppShell` client-only shell state
- AG Grid v35 theming warning by forcing current grids to `theme="legacy"` while CSS theme files remain in use

## Highest-Value Remaining Work

Do these next, in order:

1. Backend adaptive output contract
   - extend discovery/run/settings/status payloads to provide real:
     - winner cohorts
     - decision bands
     - active adaptive model state
     - token-level adaptive explanation

2. Trading adaptive explainability
   - show backend-backed adaptive fields in:
     - `/trading`
     - candidate detail
     - position detail

3. Discovery Builder rewrite
   - rebuild builder around the shared shadcn-style layer and the intended grouped editing flow
   - make adaptive-band authoring a real persisted workflow

4. Deeper full-screen review consolidation
   - replace more route-heavy detail flows where it materially improves scan speed

## 2026-04-15 Follow-On Update

Status update for item 1: `partial -> mostly done`

Delivered in this pass:

- backend now owns adaptive cohort and decision-band derivation instead of leaving those summaries UI-derived in Discovery Results
- staged live-strategy settings now persist:
  - `winnerCohorts`
  - `decisionBands`
- `/api/desk/home` now carries a backend-built `adaptiveModel` block with:
  - active source run and pack
  - band count
  - winner count
  - calibration confidence
  - stale and degraded warnings
  - whether live automation is actually using adaptive logic
- `/api/status` now also carries `adaptiveModel`
- candidate and position operator payloads now include backend-built `adaptive` token explanation objects so Trading/detail surfaces can stop inventing that explanation in the client
- Discovery Results now prefers backend-owned cohort and band payloads from `strategyCalibration`, with client derivation only as fallback

Still left inside item 1:

- surface the new candidate and position adaptive explanation fields in `/trading`, candidate detail, and position detail
- decide whether any additional status payload slice beyond `adaptiveModel` is still needed once Trading consumes the row-level fields

## Practical Warning

Do not spend the next pass re-polishing shell visuals.

The remaining gap versus the original plan is mostly contract depth and adaptive explainability, not more chrome work.
