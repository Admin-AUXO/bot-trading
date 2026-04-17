---
type: session
status: active
area: dashboard
date: 2026-04-18
source_files:
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-route.tsx
  - trading_bot/dashboard/components/shell/sidebar.tsx
  - trading_bot/output/playwright/studio-reloaded.png
  - trading_bot/output/playwright/results-reloaded.png
next_action: If the desk overview or trading route gets another density pass, keep the same rule set: one compact context row, one obvious action strip, stacked page headers, and every secondary evidence block collapsed unless active data demands it.
---

# Session - Dashboard UI UX Pass

## Findings / Decisions

- Discovery Studio still carried too many always-visible controls and too much filler copy for an operator workflow.
- Results was wasting a permanent side rail on run history and keeping secondary evidence too prominent.
- Sidebar route subtitles were extra scan tax after the route grouping work already made section intent obvious.
- Browser verification on a local ad hoc Next server failed because authenticated server reads need the real compose env, so the live compose dashboard was the only trustworthy verification target.

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
