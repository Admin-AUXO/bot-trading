---
type: session
status: active
area: providers/runtime
date: 2026-04-11
source_files:
  - trading_bot/backend/src/config/env.ts
  - trading_bot/backend/src/engine
  - trading_bot/backend/src/services
  - trading_bot/backend/.env.example
  - notes/reference/strategy.md
  - notes/reference/prisma-and-views.md
  - notes/trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md
graph_checked: 2026-04-11
next_action: Re-run bounded dry runs in fresh pump windows before loosening concentration or quality floors again.
---

# Session - Provider And Runtime Workstream Summary

## Findings / Decisions

- The desk is pump-first right now. `DISCOVERY_SOURCES` and `TRADABLE_SOURCES` default to `pump_dot_fun`.
- Strategy presets, shared token facts, and score-aware exits are live. Live and dry-run lanes now carry separate preset intent.
- The dry-run path is healthy again. The remaining problem is market quality, not a broken execution path.
- Birdeye `meme/list` stays the discovery surface. Do not resurrect `token/list`, and do not exceed the five-filter ceiling.
- `pump_dot_fun` is still the only serious source in recent quality-pack sweeps. `moonshot` and `raydium_launchlab` are dead weight until the market proves otherwise.

## What Changed

- Added strategy-preset-aware discovery and evaluation flow, plus shared Birdeye and Helius fact caching.
- Widened discovery and evaluation lookbacks so research discovery no longer starves immediately.
- Fixed Birdeye filter-limit failure handling and surfaced research failures truthfully in the operator desk.
- Tightened the repo defaults back toward a pump-only trading desk and aligned docs with that reality.
- Validated Birdeye and Helius MCP setup and stored the durable provider lessons in `notes/trading-memory/providers/`.

## What I Verified

- `cd trading_bot/backend && npm run db:generate && npm run build`
- `npm run db:setup` where schema and views mattered
- bounded dry runs after rebuilds and resets
- live Birdeye `meme/list` validation and lightweight Helius MCP checks
- quality-pack follow-up that kept `grad_4h_holder_liquidity` and `grad_4h_volume1h` as the best current pump shapes

## Remaining Risks

- Current windows can still return zero or low-quality names. That is a market problem until repeated runs prove the thresholds are wrong.
- The first experimental `30m` recipe is worth one more fresh-window check; the `1m` impulse shape is not.
- Real provider costs still matter more than theoretical recall. Keep discovery probes targeted and inspect reject reasons before touching thresholds again.

## Durable Notes Updated

- `notes/reference/strategy.md`
- `notes/reference/prisma-and-views.md`
- `notes/trading-memory/providers/2026-04-11-birdeye-quality-pack-source-ranking.md`
- `notes/trading-memory/providers/2026-04-11-birdeye-discovery-endpoint-selection.md`
- `notes/trading-memory/providers/2026-04-11-birdeye-meme-list-filter-limit.md`
