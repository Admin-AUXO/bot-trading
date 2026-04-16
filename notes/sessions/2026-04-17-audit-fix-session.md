---
type: session
status: active
area: backend + dashboard + devops
date: 2026-04-17
source_files:
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/engine/exit-engine.ts
  - trading_bot/backend/src/engine/execution-engine.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/live-trade-executor.ts
  - trading_bot/backend/src/engine/constants.ts
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/.env.example
  - trading_bot/docker-compose.yml
  - trading_bot/dashboard/app/api/[...path]/route.ts
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/operational-desk/overview/page.tsx
  - trading_bot/dashboard/components/positions-grid.tsx
  - trading_bot/dashboard/components/candidates-grid.tsx
  - trading_bot/dashboard/lib/use-trading-search-params.ts
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
graph_checked: 2026-04-17
---

# Session - Comprehensive Audit Fix Session

## Findings / Decisions

### Backend Critical Fixes
- **No API auth on any backend endpoint** — added `authMiddleware` checking `Authorization: Bearer` or `X-API-Key` against `CONTROL_API_SECRET`. Public routes: `/health`, `GET /api/status`, `GET /api/settings`.
- **Settings PATCH handler missing** — `app.patch('/api/settings')` was absent, causing silent failures on settings save.
- **Exit engine race condition** — `closePosition` calls were not serialized. Now go through `execution.runExclusive()`. In-flight set now auto-evicts stale entries after 90s.
- **No idempotent state recovery** — `persistLiveBuy/Sell` could create duplicate fills on retry. Added `findBySignature()` check and `reconcilePhantomFills()` startup scan.
- **Wallet crash on bad env var** — `Keypair.fromSecretKey()` threw at module-boot on bad key. Now wrapped, returns `null` with clear error.
- **Runtime loop death on DB error** — `getDelayMs()` throwing terminated the schedule loop permanently. Added try/catch with 30s fallback + operator alert after 3 consecutive failures.
- **Silent price-skip in exit engine** — Birdeye returning null/zero was swallowed silently. Now logs warning + fires `OperatorEvent` after 3 consecutive skips per position.
- **Birdeye budget exhaustion** — added `emitBudgetWarning()` on all exhausted paths + `BIRDEYE_BUDGET_EMERGENCY_BYPASS=true` env flag.
- **Hardcoded `"singleton"`** — extracted to `src/engine/constants.ts` as `BOT_STATE_ID`.

### Dashboard Critical Fixes
- **API proxy only handled GET/POST** — PUT/PATCH/DELETE were silent no-ops. Added all methods. Now forwards `Authorization` and `X-API-Key` headers. Added 10s timeout.
- **Position detail page read-only** — added Close position, Adjust stop loss (modal), View on explorer (Solscan), Intervention priority badge (red/amber/green).
- **Candidate detail page read-only** — added Promote to position, Block permanently, Adjust filters.
- **No P&L on overview** — added `DeskPnlWidget` with realized PnL today/7d, win rate, and 7-day bar sparkline from events data.
- **6 redirect-chain pages** — moved all to `next.config.ts` as proper redirect rules.
- **No loading skeletons** — added `app/loading.tsx` with pulsing skeleton UI.
- **URL state duplicated across pages** — created `use-trading-search-params.ts` shared helper with `buildPositionDetailHref`, `buildCandidateDetailHref`, `firstParam`, etc.

### Schema & DevOps
- **Docker resource limits added** — postgres: 1GB RAM limit; bot: 512MB; dashboard: 256MB.
- **postgres ulimits + shm_size** — `nofile` 1024/2048, `shm_size: 128m`.
- **Grafana healthcheck** — replaced brittle `wget | grep` with `curl -f http://localhost:3000/api/health`.
- **New `ResearchFill` model** — tracks research-mode fills with mint, side, price, amount, slippage, score.
- **New `ExitEvent` model** — audit trail for exits (positionId, reason, profile, price, PnL).
- **Candidate indexes** — added on `creator`, `platformId`, `(mint, strategyPresetId, status)`.
- **`CONTROL_API_SECRET` in `.env.example`** — documented with required setup note.
- **`DATABASE_POOL_SIZE`** — added to `.env.example` with guidance.
- **OperatorEvent retention** — documented 30-day weekly cleanup in `prisma-and-views.md`.

### Studio UX Audit Findings
- **60+ filter fields in flat select** — propose searchable accordion (`AddFilterPanel` component).
- **Builder mixes threshold editing + recipe editing** — propose two-panel layout: left rail (pack/source/profile) + right workspace (tabbed editor).
- **No visual diff for threshold overrides** — `ThresholdControlCard` has no indicator when value differs from default. Propose 3px left accent border + "modified" badge.
- **Sort picker has 100+ options** — propose collapsible accordion with search (SortPicker component).
- **No threshold effect preview** — user must run lab to see impact. Propose `ThresholdPreviewBadge` (client-side heuristic).
- **Threshold panel buried in "Config" tab** — rename to "Thresholds", add preview badge visible in editor header.

### Manual Trade UX Audit Findings
- **Modal requires scrolling** — propose two-column layout: left (sizing/exit params), right (sticky price preview panel).
- **Exit profile no visual tier indicator** — propose `ExitProfileTierCard` component (scalp/balanced/runner as stacked visual cards).
- **No pre-confirmation step** — direct submit with no review screen. Propose two-step modal (edit → read-only summary → confirm).
- **No price chart** — propose `TradeSparkline` SVG component using last 30 OHLCV candles. Falls back to arrow indicator.
- **No retry on API failure** — propose "↻ Retry" button in error banner instead of forcing modal close.

### Free DEX API Recommendations
| API | Best for | Free tier | Integration effort |
|-----|----------|-----------|-------------------|
| DexScreener | Discovery signals, new pairs, liquidity | Unlimited, no key | ~2h |
| Pump.fun | Graduated tokens (free, no key) | Unlimited | ~1h |
| DexTools | Price/volume + DEX metadata | Free, key optional | ~2h |
| Raydium V2 | Liquidity pool state | Free REST, no auth | ~3h |
| Orca Whirlpool | Fee tiers, concentrated liquidity | SDK free | ~4h |

**Recommendation**: Use DexScreener + Pump.fun for the discovery path to reduce Birdeye credit consumption. Birdeye remains for security data and pricing.

## Important Notes

### Docker rebuild required after schema changes
After modifying `schema.prisma`, you MUST rebuild the containers:
```bash
cd trading_bot && ./scripts/update-compose-stack.sh
```
This runs `db:generate` + `db:migrate` inside the build, then recreates containers.

### Prisma optional marker syntax
Optional fields on `Decimal` types use attribute-order syntax, NOT trailing `?`:
```prisma
# WRONG
score Decimal @db.Decimal(8, 6)?

# CORRECT
score Decimal? @db.Decimal(8, 6)
```

### CONTROL_API_SECRET is now required
The backend will reject all `/api/control/*` and `/api/operator/*` requests without a valid `CONTROL_API_SECRET`. Set it in `backend/.env` before restarting.

### Auth header forwarding in proxy
The dashboard proxy now forwards `Authorization` and `X-API-Key` headers. If using the dashboard to send authenticated requests to the backend, the secret must match `CONTROL_API_SECRET` on the backend.

## Next Action
- Run `npm run db:generate` locally (or rebuild containers) to apply new `ResearchFill` and `ExitEvent` models
- Test the PATCH `/api/settings` flow end-to-end with the new auth middleware
- Test simultaneous exit-check triggers to verify the race condition is fixed
- Implement the Studio UX two-panel layout (next high-value improvement)
