---
type: session
status: active
area: dashboard
date: 2026-04-15
source_files:
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/backend/src/services/discovery-lab-service.ts
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/lib/use-hydrated.ts
  - notes/reference/dashboard-operator-ui.md
  - graphify-out/GRAPH_REPORT.md
graph_checked: 2026-04-15
next_action: Browser-check the refreshed discovery flow and verify the hydration warning is gone on Desk, Settings, and Discovery Results after deferring client-local timestamp formatting until after mount.
---

# Session - Discovery Builder Field-First Filters

## Context

The previous discovery redesign fixed the high-level route model, but the builder still carried too much visual weight:

- the page opened with an extra score-strip that repeated context instead of helping decisions
- package selection still lived in a desktop side library
- strategy editing exposed a large hardcoded filter grid instead of a tighter pick-a-field flow
- the Birdeye meme-list filter ceiling existed in backend validation but was not obvious while editing a recipe

## What Changed

- Moved the workflow tabs to the top of the page so operators can switch `Strategy studio`, `Run lab`, and `Results` before parsing local page detail.
- Removed the discovery header score-strip and kept one compact context row instead of a second summary section.
- Collapsed the workflow tabs and the local discovery header into one compact workbench panel so the page starts with one scan-friendly control band instead of two stacked explainers.
- Replaced the package library side panel with an inline package dropdown plus quick actions to branch the selected pack or load a run snapshot into the draft.
- Compacted the pack frame so the selector, branch actions, and draft state now live in one tighter strip instead of a selector card plus a second workspace explainer card.
- Collapsed the builder back to one main column; validation and market-regime guidance now sit below the primary editing surfaces instead of competing in a side rail.
- Removed the manual strategy `mode` editor from the common path. The UI now derives stage from the active stage filters, shows it as a summary, and leaves the backend recipe mode normalized on validate and save.
- Removed the manual strategy-name editor from the common path. Strategy names are now auto-generated from the current selection set when the pack is validated, saved, or run, and the backend also normalizes them so blank or stale names do not leak into saved packs.
- Expanded sort metric selection into grouped repo-supported Birdeye meme-list sort options instead of the earlier short list.
- Rebuilt strategy filters around a field-first add-filter flow:
  - pick a Birdeye field
  - set the value
  - remove it when it no longer matters
- Exposed the repo-known Birdeye meme-list filter set from structured controls, including timing, liquidity, market-cap, FDV, holder, volume, price-change, trade-count, creator, platform, and graduated filters.
- Surfaced the live per-strategy provider filter count directly in the studio with the current `5`-filter Birdeye ceiling.
- Reframed thresholds as grouped dynamic gates so liquidity and size, participation, and concentration or drawdown are edited as coherent groups instead of one flat card wall.
- Added a runs-tab output inventory that shows what a completed run persists: query summaries, source summaries, winners, deep evaluations, calibration output, and the returned token fields.
- Kept raw JSON as an advanced escape hatch, but blank structured filter rows are stripped before validate/save/run so draft packs do not persist UI-only null placeholders.
- Seeded new blank strategies with `graduated: true` so the common post-grad path starts in a sane state.
- Patched a dashboard hydration warning caused by SSR-rendered client components formatting timestamps and relative times differently between server and browser locales. Desk, Settings, and Discovery Results now wait until hydration before showing browser-local timestamp strings.
- Added `<meta name="darkreader-lock">` in the dashboard root layout so Dark Reader stops mutating the DOM before hydration on this app.
- Reduced discovery workflow redundancy:
  - one compact context row instead of repeated run and pack chips across multiple surfaces
  - builder support collapsed into one secondary guidance row for validation plus regime hints
  - validation is now a disclosure instead of an always-open full panel
  - regime guidance now filters down to strategy-relevant thresholds plus live handoff stats from calibration when a completed run exists
  - runs no longer keep a separate always-open run-summary panel next to run center
  - run outputs moved behind disclosure
  - results-side cohort and adaptive synthesis moved behind disclosure so the token board stays primary
  - live strategy staging on results is now a collapsed summary-first section instead of another full always-open panel
- Narrowed the created pack catalog down to the two shapes that actually worked in the lab:
  - `created-fresh-burst-ladder`
  - `created-late-expansion-quality`
- Re-tuned both created packs so each now exposes four post-grad strategies mapped to explicit target profit bands instead of one generic mixed stack. The fresh pack widens the earliest recall windows while the late pack raises liquidity, holder, and participation requirements as the target range climbs.
- Added pack-level and strategy-level target PnL metadata plus a short pack thesis so operators can scan what a created pack is trying to capture before opening the strategy body.
- Extended query summaries with returned, selected, winner, and reject counts plus selection, pass, and winner-hit rates so the initial discovery fetch can be evaluated directly instead of only after deep eval.
- Reworked regime guidance from one opaque threshold suggestion into a compact post-run decision surface:
  - top-line fetch yield
  - strongest initial filters by winner-hit rate
  - three selectable threshold postures for `More tokens`, `Balanced winners`, and `Better quality`
- Updated the compact research summary cards so strategy leaders show returned rows, rejects, and winner-hit rate instead of only selected-count plus average score.

## Verification

- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run build`
- `node ./.codex/scripts/graphify-rebuild.mjs`

## Remaining Risk

- This pass was build-verified, not browser-verified. The new structured filter flow still needs one real local dashboard check to confirm spacing, dropdown scanning, and long filter-card stacks on laptop and mobile widths.
