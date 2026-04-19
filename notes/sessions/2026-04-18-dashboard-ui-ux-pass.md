---
type: session
status: active
area: dashboard
date: 2026-04-18
source_files:
  - trading_bot/dashboard/components/shell/sidebar.tsx
  - trading_bot/dashboard/components/workbench/workbench-editor-surface.tsx
  - trading_bot/dashboard/components/workbench/workbench-grader-surface.tsx
  - trading_bot/dashboard/components/market-trending-grid.tsx
  - trading_bot/output/playwright/workbench-packs-ui-verify.png
  - trading_bot/output/playwright/overview-ui-verify.png
next_action: If the desk overview or trading route gets another density pass, keep the same rule set: one compact context row, one obvious action strip, stacked page headers, and every secondary evidence block collapsed unless active data demands it.
---

# Session - Dashboard UI UX Pass

## Findings / Decisions

- Discovery Studio still carried too many always-visible controls and too much filler copy for an operator workflow.
- Results was wasting a permanent side rail on run history and keeping secondary evidence too prominent.
- Sidebar route subtitles were extra scan tax after the route grouping work already made section intent obvious.
- Browser verification on a local ad hoc Next server failed because authenticated server reads need the real compose env, so the live compose dashboard was the only trustworthy verification target.

## Follow-up - Draft Architecture Cleanup

- Re-read `draft_dashboard_plan.md` before touching shell/navigation again. The draft is now a cleanup map, not a speculative IA sketch.
- Removed the shell’s duplicate discovery quick-link rail so the sidebar now exposes only the three primary route groups: operational desk, strategy workbench, and market intel.
- Stopped main-nav route matching from aliasing discovery URLs as first-class workbench or market pages. Stale compatibility paths may still exist, but the shell no longer pretends they are the same surface.
- Moved redirect-only compatibility handling into `trading_bot/dashboard/next.config.ts` only where the compatibility URL still exists, then deleted the dead app route wrappers for `/settings`, `/workbench`, `/market`, `/discovery-lab`, `/discovery-lab/overview`, and `/discovery-lab/run-lab`.
- Deleted the remaining `app/discovery-lab/*` page entrypoints and the old discovery-only client bundles after the workbench and market routes became the real owner surfaces.
- Repointed shared settings and candidate-detail links at workbench and market routes so the live UI no longer navigates through deleted discovery pages.
- Added a neutral backend manual-entry route (`/api/operator/manual-entry`) for candidate detail so the dashboard no longer depends on the old discovery-specific endpoint name.
- Dropped the obsolete `root` / `overview` / `runLab` route constants and removed screenshot-manifest coverage for redirect-only compatibility pages so route inventory now points at the real workbench and market surfaces.
- Added `trading_bot/dashboard/app/error.tsx` so route-level fetch failures keep the shell visible and offer recovery pivots instead of dropping the operator into an opaque server error.
- Removed placeholder-only columns from `market-trending-grid.tsx`; the market board should not render fake metrics and apologize later.
- Reworked the workbench headers and list/detail layout so packs, editor, sandbox, grader, and sessions describe operator jobs instead of backend seam trivia.

## What I Verified In This Follow-up

- `cd trading_bot/dashboard && npm run screenshots:manifest`
- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run build`
- Local production-browser proof with Playwright against `npx next start -p 3333`:
  `/operational-desk/overview` renders the degraded desk state while keeping the shell visible when backend reads fail
  `/workbench/packs` renders the new global route-error surface inside the shell when the page fetch fails
  Artifacts:
  `trading_bot/output/playwright/overview-ui-verify.png`
  `trading_bot/output/playwright/workbench-packs-ui-verify.png`

## What Changed

- Rebuilt the Studio header around one compact stat strip with direct pivots to `Results` and `Live config`.
- Kept `Save` and `Run` as the primary pack actions and pushed `New`, `Duplicate`, `Validate`, and `Delete` behind a quieter `More tools` disclosure.
- Shortened Studio helper copy, collapsed threshold overrides by default, and moved validation issues behind disclosure so the recipe editor stays the first scan path.
- Exposed the full repo-supported structured package filter surface in Studio, including relative-time fields, creator/platform, size, volume, price, and trade filters, and kept grouped sort options visible in the editor flow.
- Tightened the live-session and latest-run summaries into smaller cards that keep capital, mode, requests, evaluations, and winners visible without adding another explainer block.
- Reworked Results so the token board gets full width and secondary surfaces (`Run history`, `Run diagnostics`) sit collapsed below it instead of consuming a permanent right rail.
- Removed the extra sidebar subtitle lines so route scanning stays label-first.
- Standardized compact page headers into a stacked title-and-description layout so route intent scans faster without adding a second hero row.

## What I Verified

- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npm run build`
- `docker compose build dashboard`
- `docker compose up -d --force-recreate --no-deps dashboard`
- Live browser screenshots against the compose dashboard for Studio, Results, and Overview

## Remaining Risks

- Studio is denser and cleaner, but the strategy editor still depends on native selects and a long single-screen recipe form; if operators keep adding strategy fields, the next pass should likely break the active recipe into subtabs rather than just shave more spacing.
- The local Windows `run-next.mjs` wrapper still throws `spawn EINVAL` when used outside Docker. That is unrelated to this UI pass, but it blocked the first local-browser verification attempt.
