---
type: session
status: active
area: dashboard
date: 2026-04-16
source_files:
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/docker-compose.yml
  - trading_bot/dashboard/components/settings-client.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/app/operational-desk/settings/page.tsx
  - trading_bot/dashboard/app/discovery-lab/config/page.tsx
  - notes/reference/api-surface.md
  - notes/reference/prisma-and-views.md
  - notes/reference/dashboard-operator-ui.md
  - notes/reference/tech-stack.md
graph_checked: 2026-04-16
next_action: If the repo keeps moving toward discovery-lab-first live sessions, the next backend step is to replace filesystem-only discovery-lab runs and packs with database-backed entities instead of pushing more workflow state into runtime config JSON.
---

# Session - Direct Apply Settings And Live Strategy

## Findings / Decisions

- The old settings workflow was solving for controlled promotion, but it was a poor fit for the actual operator job. End users need a lean direct-edit path, not draft state, dry-run gates, and a second promote phase.
- Discovery-lab live-strategy staging was also anchored to the same draft workflow, which made the results workflow heavier than necessary.
- The first coherent simplification seam was settings management, not discovery-lab pack editing. The repo can keep pack drafts locally for builder work while removing runtime-config draft state entirely.

## What Changed

- Removed the backend settings-draft workflow from runtime code and API routing:
  - deleted `/api/settings/control`, `/api/settings/draft`, `/api/settings/draft/discard`, `/api/settings/dry-run`, and `/api/settings/promote`
  - kept `GET /api/settings` and `POST /api/settings` as the active settings contract
  - `apply-live-strategy` now patches active settings directly instead of staging into a draft
- Removed runtime-config draft storage from Prisma schema:
  - dropped `RuntimeConfigDraft`
  - dropped `dryRunSummary` and `basedOnUpdatedAt` from `RuntimeConfigVersion`
- Rewrote the dashboard settings surface into a direct-apply editor:
  - one sticky action bar
  - local edit state only
  - no draft rail, no dry-run panel, no promote review
  - `/discovery-lab/config` now uses a hot-parameters mode tuned for recent-graduate pump-first trading and short sessions
- Discovery-lab results now load and save live-strategy state directly from active settings, and apply-run actions update active settings immediately.
- Updated the checked-in backend example defaults to a `4h` graduation window (`MAX_GRADUATION_AGE_SECONDS=14400`) so new setups start closer to the current operator goal.
- Reworked the database around discovery-lab ownership instead of the removed research workflow:
  - removed the old `ResearchRun`, `ResearchToken`, `ResearchPosition`, and `ResearchFill` table family plus the related reporting views
  - added `DiscoveryLabPack`, `DiscoveryLabRun`, `DiscoveryLabRunQuery`, and `DiscoveryLabRunToken`
  - extended `Candidate`, `Position`, and `Fill` with direct attribution, score, confidence, sizing, and live execution telemetry columns
  - widened `SharedTokenFact` so overview, metadata, and market stats can be cached and reused before making more provider calls
- Wired shared backend logic across live evaluation and discovery-lab:
  - live runtime scoring and discovery-lab evaluation now use the same entry scoring function
  - risk sizing now uses the shared planned-position-size helper instead of a duplicate engine-local formula
  - discovery-lab run reports persist backend-owned trade setup data so the dashboard does not need to invent a separate sizing or exit model
- Tightened execution persistence so buy and sell fills write direct execution reason, mode, latency, slippage, and quote-versus-actual fields into the database instead of relying only on nested JSON metadata.
- Added the next discovery-lab workflow slice:
  - `/api/operator/discovery-lab/market-stats` now returns a market-wide pulse built from Birdeye discovery rows, DexScreener pair data, Rugcheck summaries, and tracked-position state, with optional single-mint focus detail
  - `/api/operator/discovery-lab/strategy-suggestions` now returns five backend-owned pack ideas with confidence, session fit, threshold ranges, and pack drafts
  - dashboard routes `/discovery-lab/market-stats` and `/discovery-lab/strategy-ideas` now surface that data in scan-first pages instead of burying it inside the results route
- Hardened the two new discovery-lab pages against backend misses:
  - `/discovery-lab/market-stats` and `/discovery-lab/strategy-ideas` now render an operator-facing degraded state instead of crashing the full Next.js server render when the backing API route is stale, missing, or temporarily unavailable
  - the practical runtime dependency is compose-level: the dashboard pages only work when the dashboard container can reach a backend container that already serves the new discovery-lab routes
- Closed a compose/runtime availability gap that showed up during verification:
  - `runtime.ts` now falls back to direct `ApiEvent` aggregation when `v_api_provider_daily` is missing, so `/api/status` still returns a healthy payload instead of failing on the view
  - `docker-compose.yml` now forces `db-setup` and `bot` onto the container-safe `postgres` hostname instead of inheriting a host-only `localhost` `DATABASE_URL` from `backend/.env`
  - after rebuild, `/api/status` and the discovery-lab routes `/overview`, `/studio`, `/run-lab`, `/results`, `/config`, `/market-stats`, and `/strategy-ideas` all returned `200`

## What I Verified

- `cd trading_bot/backend && npm run db:generate`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- `cd trading_bot/backend && npx prisma validate --schema prisma/schema.prisma`
- `node ./.codex/scripts/graphify-rebuild.mjs`
- `docker compose -f trading_bot/docker-compose.yml up -d --build dashboard`
- `curl` against the live dashboard routes on port `3100` and backend routes on port `3101`

## Remaining Risks

- The discovery-lab catalog and run history are still filesystem-backed under `.local/discovery-lab`, even though run summaries and token outcomes now sync into the database. Full DB ownership is not finished yet.
- Existing databases will need `db:setup` or equivalent schema reconciliation before the removed research tables and the new discovery-lab tables match the checked-in Prisma schema.
- `cd trading_bot/backend && npm run db:setup` still failed locally with a generic Prisma schema-engine error against `postgres:5432`, so the checked-in schema is validated and generated but not yet applied in this environment.
- The direct-apply settings flow is much leaner, but it also means operators can change live-sensitive settings faster; the remaining safety now depends on runtime guardrails and clear copy rather than staged promotion.
- The new market-stats and strategy-ideas pages no longer hard-crash on missing data, but they still need browser verification against live provider responses, especially Rugcheck summary coverage, first-byte latency in the live dashboard path, and the quality of the suggestion heuristics under different market conditions.
