---
type: trading-memory
status: active
area: trading/providers
date: 2026-04-11
source_files:
  - trading_bot/backend/src/services/birdeye-client.ts
  - trading_bot/backend/src/engine/graduation-engine.ts
graph_checked: 2026-04-11
next_action: Re-check this note before adding any new meme-list discovery gate that looks tempting enough to push into the provider request.
---

# Trading Memory - Birdeye Meme List Filter Limit

## What Happened

Birdeye `GET /defi/v3/token/meme/list` returned `400` with `Maximum 5 concurrently filters` when the dry-run discovery request tried to send six filters at once.

## Signal

If a research dry run fails immediately on the first Birdeye discovery call and the raw payload shows a `400`, count the request filters before blaming transport, auth, or pacing.

## Interpretation

This endpoint has a provider-side filter ceiling that is tighter than the repo originally assumed. Coarse discovery filters belong in the API request. Secondary screens like minimum holder count can be applied locally after the response without changing operator expectations.

## Reuse Rule

Keep Birdeye meme-list requests at five concurrent filters or fewer. When discovery logic needs another gate, prefer local post-filtering unless the provider-side filter is materially required to keep response size or budget under control.

## Watchouts

- A failing discovery call can still burn real Birdeye units, so persist provider usage even when the run status is `FAILED`
- If telemetry looks inflated, check whether the client is recording the same failure on both the bad response path and the thrown-error path
- A desk that hides raw provider failure pressure is lying; check homepage diagnostics and the research failure note together

## Linked Notes

- [`../../investigations/2026-04-11-birdeye-dry-run-filter-limit-and-failure-surfacing.md`](../../investigations/2026-04-11-birdeye-dry-run-filter-limit-and-failure-surfacing.md)
- [`../../reference/api-surface.md`](../../reference/api-surface.md)
