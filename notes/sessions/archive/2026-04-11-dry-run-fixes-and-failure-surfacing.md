---
type: session
status: open
area: runtime/dashboard
date: 2026-04-11
source_files:
  - trading_bot/backend/src/services/birdeye-client.ts
  - trading_bot/backend/src/engine/research-dry-run-engine.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
  - notes/reference/dashboard-operator-ui.md
  - notes/reference/api-surface.md
  - notes/investigations/2026-04-11-birdeye-dry-run-filter-limit-and-failure-surfacing.md
  - notes/trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md
graph_checked: 2026-04-11
next_action: If the user wants evidence of the danger-state UI path, trigger one controlled provider failure and capture the resulting desk event plus research failure note on the live dashboard.
---

# Session - Dry Run Fixes And Failure Surfacing

## Context

The user asked for a dry run against the live Docker stack and then told Codex to fix every backend and dashboard issue that surfaced. The actual disease was not “the dry run failed.” It was a provider request that violated Birdeye's filter ceiling plus an operator desk that failed to tell the truth when the backend broke.

## What Changed

- Fixed Birdeye dry-run discovery by removing `min_holder` from the provider request and applying the holder floor client-side after the response
- Stopped duplicate failed API-event recording in the Birdeye client so provider usage is no longer double-counted on one bad call
- Updated failed research runs to persist provider burn and `errorMessage`, then emit a `research_failure` operator event
- Updated homepage diagnostics to include recent payload failures so `/` no longer looks healthy while provider errors are fresh
- Updated the research page to render the backend failure note for failed runs
- Updated event links so research-run events can drill into `/research?run=<id>`
- Synced the API and dashboard contract notes, added an investigation note, and stored the Birdeye filter-limit rule in provider memory

## What I Verified

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot && docker compose up -d --build bot dashboard`
- `POST http://127.0.0.1:3100/api/control/run-research-dry-run` returned `200` after the fix
- The latest dry run completed successfully with `birdeyeCalls=1` and `birdeyeUnitsUsed=100`
- `GET http://127.0.0.1:3100/` now includes `Recent payload failures` in the diagnostics strip instead of pretending the desk is clean

## Risks / Unknowns

- The new `research_failure` event path is implemented, but the post-fix verification run succeeded, so the live event-feed screenshot for that exact path still has to wait for the next controlled or organic failure
- Historical failed runs still carry the old zeroed provider-burn totals because this task fixed the runtime path forward, not past rows in the database
- If more discovery gates are pushed back into the Birdeye meme-list request without counting filters, this will break again

## Next Action

Leave the code alone unless there is a new provider symptom. The first thing to inspect next time is the raw payload capture plus the provider-memory note, not the dashboard chrome.

## Durable Notes Updated

- `notes/reference/dashboard-operator-ui.md`
- `notes/reference/api-surface.md`
- `notes/investigations/2026-04-11-birdeye-dry-run-filter-limit-and-failure-surfacing.md`
- `notes/trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md`
