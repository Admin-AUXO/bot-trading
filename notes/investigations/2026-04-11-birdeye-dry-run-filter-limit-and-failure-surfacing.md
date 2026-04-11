---
type: investigation
status: open
area: runtime/providers/dashboard
date: 2026-04-11
source_files:
  - trading_bot/backend/src/services/birdeye-client.ts
  - trading_bot/backend/src/engine/research-dry-run-engine.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/backend/src/services/operator-events.ts
  - trading_bot/dashboard/app/research/page.tsx
  - trading_bot/dashboard/components/dashboard-client.tsx
graph_checked: 2026-04-11
next_action: Watch the next organic provider failure to confirm the new research-failure event path and homepage diagnostics stay aligned under live error pressure.
---

# Investigation - Birdeye Dry Run Filter Limit And Failure Surfacing

## Trigger

The dry-run control path inside Docker returned `500` immediately when the dashboard launched a bounded research run. The user asked for both the backend failure and the dashboard blind spots to be fixed instead of just explained.

## Evidence

- `POST /api/control/run-research-dry-run` failed with `Birdeye /defi/v3/token/meme/list failed with 400`
- Raw payload capture for `/defi/v3/token/meme/list` returned `{"message":"Maximum 5 concurrently filters","success":false}`
- The outgoing request combined `source`, `graduated`, `min_graduated_time`, `min_liquidity`, `min_volume_5m_usd`, and `min_holder`
- Failed runs showed up on `/research`, but the page did not render the backend `errorMessage`
- `/api/desk/home` still presented an armed desk state because diagnostics were not considering recent payload failures
- Birdeye failure telemetry was double-counted because the client recorded the failed response before throwing and then recorded the thrown error again in `catch`

## Hypotheses

- Birdeye's meme-list endpoint accepts fewer concurrent filters than the client assumed
- `min_holder` is secondary enough to move to local post-filtering without changing the strategy contract
- The control desk mismatch was not one bug but two:
  failed research starts emitted no operator event
  homepage diagnostics ignored payload-failure pressure

## Findings

- Birdeye `/defi/v3/token/meme/list` rejects requests with more than five concurrent filters
- The repo can preserve the holder floor contract by fetching with five provider-side filters and applying the holder check locally after the response
- Failed research starts need provider-burn totals persisted on the run row before the engine exits, otherwise the operator loses the actual cost of the failure
- The homepage diagnostics strip must include recent payload failures or the desk will falsely present a healthy posture during live provider trouble
- Event rows tied to research runs are only useful if the UI can drill into the exact failed run from the desk

## Decision

- Removed `min_holder` from the Birdeye meme-list request and applied the holder minimum client-side
- Stopped duplicate failed API-event recording in the Birdeye client
- Updated failed dry runs to persist provider usage, store the error message, and emit a `research_failure` operator event
- Updated the dashboard so selected failed runs render the backend failure note and research-run events can link directly into the run view

## Next Action

If Birdeye discovery filters change again, count provider-side filters before shipping. If the next failure comes from a different provider boundary, check the raw payload capture and operator-event drill-in before touching UI copy.

## Linked Notes

- [`../trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md`](../trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md)
- [`../sessions/2026-04-11-dry-run-fixes-and-failure-surfacing.md`](../sessions/2026-04-11-dry-run-fixes-and-failure-surfacing.md)
- [`../reference/dashboard-operator-ui.md`](../reference/dashboard-operator-ui.md)
- [`../reference/api-surface.md`](../reference/api-surface.md)
