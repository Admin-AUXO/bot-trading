---
type: session
status: open
area: dashboard
date: 2026-04-10
source_files:
  - trading_bot/dashboard/app/layout.tsx
  - trading_bot/dashboard/app/globals.css
  - trading_bot/dashboard/app/page.tsx
  - trading_bot/dashboard/app/candidates/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/app/settings/page.tsx
  - trading_bot/dashboard/components/app-shell.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/dashboard-primitives.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/lib/format.ts
  - trading_bot/dashboard/lib/grafana.ts
graph_checked: 2026-04-10
next_action: Browser-check routed candidate and position detail pages with real rows once live data exists, then trim any remaining low-signal copy from research or settings if it still feels heavy.
---

# Session - Next.js Dashboard Improvement Handoff

## Implemented In This Pass

- Reworked the global shell, page hero, panel, table, and status primitives around a black plus `#A3E635` command-desk theme.
- Swapped the body font to `Manrope`, kept a stronger display face for headings, and tightened the chrome so the header, sidebar, and page hero stop competing.
- Reduced homepage narration and moved the homepage toward direct operator cues:
  readiness
  queue pressure
  provider pace
  diagnostics
- Refactored `/candidates`, `/positions`, `/telemetry`, `/research`, and `/settings` onto the shared page-level composition language instead of bespoke hero blocks.
- Added or strengthened Grafana pivots on the main operational pages without moving historical analytics back into Next.js.
- Tightened the workbench tables so token or position identity, blocker or intervention, and the key numeric columns read faster.
- Fixed a UI correctness bug in `trading_bot/dashboard/lib/format.ts` where `null` values could render as `0` because the formatter helpers were coercing `Number(null)`.

## Verified In This Pass

- `cd trading_bot/dashboard && npm run build`
- Browser render checked on a fresh local Next.js instance at `http://127.0.0.1:3201`
- Desktop and narrow mobile screenshots checked for `/`
- Desktop screenshot checked for `/settings`
- Route HTTP 200 confirmed for:
  `/`
  `/candidates`
  `/positions`
  `/telemetry`
  `/settings`
  `/research`
- Candidate and position detail round-trip behavior could not be fully browser-verified in this pass because the current local data set returned no rows for the sampled open-candidate and open-position endpoints.

## Context

The Grafana estate now exists and the dashboard pivots are real.

The user explicitly wants the Next.js app dashboard improved next.

That means the next agent should work on the operator UI itself:

- shell and homepage hierarchy
- workbench scanability
- consistency across routed pages
- mobile behavior
- visual polish that strengthens decision-making instead of decorating it

Do not treat this as permission to re-bloat the homepage with historical analytics that now belong in Grafana.

## Current UI Diagnosis

The app is materially better than the old view-dump, but it still has obvious debt.

### What Is Already Good

- `/` is a real control desk instead of a generic metrics landfill.
- The app respects backend-owned semantics:
  candidate buckets
  position books
  diagnostics state
  settings promotion flow
- Grafana is now the correct home for history and RCA.
- Query-state preservation on candidates and positions is already implemented and should stay.

### What Still Feels Weak

- The shell header, left nav, and homepage hero all compete for attention instead of establishing a clean top-down reading order.
- Cards and panels are visually consistent, but not strategically different enough. Too many surfaces use the same treatment even when urgency differs.
- Candidates and positions are still table-first workbenches with limited row emphasis, limited comparative cues, and too little visual separation between “actionable now” and “background context”.
- The telemetry page is honest but blunt; it reads more like a raw dump wrapped in decent CSS than a tightly-designed fault console.
- Reusable primitives exist, but page composition is still partly bespoke. Several pages hand-roll hero sections instead of leaning on a shared page-level pattern.
- Mobile works mechanically, but the information density and action placement still feel desktop-biased.

## Guardrails For The Next Agent

- Keep the current app role:
  operational desk and workbench
  current-state diagnostics
  safe settings promotion surface
- Keep Grafana links and the current external dashboard contract in `trading_bot/dashboard/lib/grafana.ts`.
- Do not move historical analytics back into Next.js just because they are easier to style there.
- Do not weaken backend-owned meaning by reintroducing frontend bucket logic or custom risk semantics.
- Preserve candidates and positions URL state:
  `bucket`
  `book`
  `sort`
  `focus`
- Preserve the dark command-center direction unless the user explicitly asks for a visual reset.

## Best Improvement Order

### 1. Fix Global Chrome First

Start with:

- `trading_bot/dashboard/components/app-shell.tsx`
- `trading_bot/dashboard/app/globals.css`
- `trading_bot/dashboard/components/dashboard-primitives.tsx`

Targets:

- make the sticky header calmer and more legible
- tighten hierarchy between shell status, primary blocker, and action buttons
- improve mobile nav readability and hit area
- create stronger surface tiers so urgent, routine, and passive panels do not all look equivalent

This is the highest-leverage pass because every routed page inherits it.

### 2. Tighten The Homepage Decision Flow

Then work on:

- `trading_bot/dashboard/components/dashboard-client.tsx`
- `trading_bot/dashboard/app/page.tsx`

Targets:

- reduce repeated framing copy
- make the “what needs attention first” path visually unavoidable
- compress secondary context
- make recent failures and event stream easier to scan
- make provider pace and queue sections feel like decision tools, not just respectable boxes

The current homepage is conceptually correct. It mostly needs hierarchy, pacing, and better prioritization.

### 3. Improve The Two Workbenches

Then work on:

- `trading_bot/dashboard/app/candidates/page.tsx`
- `trading_bot/dashboard/app/candidates/[id]/page.tsx`
- `trading_bot/dashboard/app/positions/page.tsx`
- `trading_bot/dashboard/app/positions/[id]/page.tsx`

Targets:

- make row triage faster
- improve column emphasis and number formatting
- make links to detail pages feel more deliberate
- make detail pages read like investigation surfaces rather than just structured dumps
- preserve the existing back-link and focus behavior

This is the most likely place to create real operator value quickly.

### 4. Clean Up Supporting Pages

After that:

- `trading_bot/dashboard/app/telemetry/page.tsx`
- `trading_bot/dashboard/app/research/page.tsx`
- `trading_bot/dashboard/app/settings/page.tsx`
- `trading_bot/dashboard/components/settings-client.tsx`

Targets:

- align them to the same page-level composition language
- make empty states and action areas feel intentional
- keep telemetry current-state only
- keep settings obviously safety-first

## Specific Opportunities Worth Taking

- Use the existing `PageHero` primitive more consistently instead of repeating hand-built hero sections.
- Introduce a clearer “critical / warning / informational” visual ladder in CSS tokens and panel variants.
- Improve table ergonomics:
  denser headers
  better numeric alignment
  better row hover and focus state
  more obvious identifier styling
- Give the open-position and candidate rows stronger action cues without turning them into button soup.
- Revisit `StatusPill` colors and grouping so `CLOSED`, `ERROR`, and `REJECTED` do not all collapse into the same emotional meaning when that harms operator scanning.
- Make mobile page headers and shell actions less cramped.

## Things To Avoid

- Adding charts to the homepage just because the page has space.
- Copying Grafana semantics back into the app.
- Turning every page into the same hero-plus-cards template with no regard for the job the page performs.
- Adding local UI state that fights the backend contract.
- Rewriting typography and spacing randomly without first fixing hierarchy.

## Suggested Verification

- `cd trading_bot/dashboard && npm run build`
- Browser-check:
  `/`
  `/candidates`
  `/positions`
  `/telemetry`
  `/settings`
- Browser-check both desktop and a narrow mobile viewport.
- Confirm query-state round trips still work for:
  candidate list -> candidate detail -> back
  position list -> position detail -> back
- Confirm Grafana outbound links still render where expected.

## Related Notes

- [2026-04-10 Control Desk Implementation Handoff](2026-04-10-control-desk-implementation-handoff.md)
- [2026-04-10 Grafana Dashboard Portfolio Handoff](2026-04-10-grafana-dashboard-portfolio-handoff.md)

## 2026-04-11 Follow-Up

A second polish pass landed after the initial redesign. The direction is now much closer to a trading desk and much less like a styled internal admin page.

What changed:

- `S2` branding was replaced with `Graduation Control`
- the shell and page surfaces were flattened further toward black / white with restrained `#A3E635` accents
- green is now mostly used for state accents, focus, and selective active treatments instead of broad panel fills
- the remaining glassy treatment was stripped out in favor of harder surfaces and cleaner borders
- hero and panel copy was reduced again across home, telemetry, research, settings, candidate detail, and position detail
- more icon-led actions were introduced where they improve scanning rather than decorate
- candidate and position detail pages gained copy actions for IDs and mints
- the home page now has a command launcher in the global shell (`⌘K`) for fast page jumps and shell actions
- the event stream now uses clearer iconography and exposes direct drill-ins when an event has a related entity route

What still remains worth doing if another pass happens:

- add a lightweight watchlist or pinned-items concept for high-value mints / positions
- consider inline Grafana launches from more row surfaces if operator testing suggests that is where people naturally pivot
- verify entity-linked event drill-ins against live data once backend events start populating `entityType` and `entityId` more consistently

## 2026-04-11 Typography And Surface Pass

A later pass tightened the UI system again after feedback that the dashboard still felt too soft and too wordy.

What changed:

- swapped the font stack to a real split:
  body uses `Manrope`
  headings use `Space Grotesk`
  IDs and tabular surfaces keep `Geist Mono`
- reduced rounded corners across the shell, heroes, panels, cards, tables, forms, and sticky action bars
- tightened spacing and title sizing in shared primitives so sections align more consistently
- trimmed text across home, candidates, positions, telemetry, research, settings, and detail pages into shorter operator-facing copy
- added subtle background polish and type rendering tweaks without reintroducing the glass effect

Observed result:

- the live home page now reads cleaner and more intentional
- the tighter radii make the dashboard feel more like a trading tool and less like a consumer admin UI
- the new font pair gives headings more identity while keeping body copy easy to scan
