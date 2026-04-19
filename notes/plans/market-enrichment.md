# Market Stats + Enrichment Fabric — Remaining

Companion to [backend.md §2.4](backend.md), [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

The enrichment fabric is mostly landed. This plan covers the remaining pieces: evaluator ownership, composite-score tuning, degraded-provider hardening, and live-mode policy.

## Audit adjustments

- The current repo already has the enrichment bundle and market token page; the critical path is evaluator cutover plus degraded-path proof, not inventing more bundle surfaces.
- Weight validation and the editor UI should stay close together but not block the evaluator cutover.
- Discovery-stage boundary is mostly a proof/lint task now, not a large implementation project.

---

## 1. What's landed

**Clients** — 8 free-provider clients at [trading_bot/backend/src/services/enrichment/](trading_bot/backend/src/services/enrichment/):

| Client | File | Test |
|---|---|---|
| Trench.bot | `trench-client.ts` | `tests/enrichment/trench-client.test.ts` |
| Bubblemaps | `bubblemaps-client.ts` | `tests/enrichment/bubblemaps-client.test.ts` |
| Solsniffer | `solsniffer-client.ts` | `tests/enrichment/solsniffer-client.test.ts` |
| Pump.fun public | `pumpfun-public-client.ts` | `tests/enrichment/pumpfun-public-client.test.ts` |
| Jupiter Token | `jupiter-token-client.ts` | `tests/enrichment/jupiter-token-client.test.ts` |
| GeckoTerminal | `geckoterminal-client.ts` | `tests/enrichment/geckoterminal-client.test.ts` |
| DefiLlama | `defillama-client.ts` | `tests/enrichment/defillama-client.test.ts` |
| Cielo Finance | `cielo-client.ts` | `tests/enrichment/cielo-client.test.ts` |

All clients gate through `ProviderBudgetService.requestSlot(...)`.

**Fanout + cache** — [token-enrichment-service.ts](trading_bot/backend/src/services/enrichment/token-enrichment-service.ts) (868 lines) fans out in parallel, caches via `EnrichmentFact(mint, source)`, writes `BundleStats`, and returns the unified bundle.

**API** — `GET /api/operator/enrichment/:mint` at [enrichment-routes.ts:5](trading_bot/backend/src/api/routes/enrichment-routes.ts).

**UI** — `/market/token/[mint]` page consumes the bundle.

---

## 2. Provider budgets + TTLs (reference)

| # | Provider | Call | Free limit | TTL | Composite weight |
|---|---|---|---|---|---:|
| 1 | Trench.bot | `api.trench.bot/api/v1/bundle/bundle_advanced/{mint}` | ~10 rps (unpublished) | 10 m | 25% |
| 2 | Bubblemaps | `api-legacy.bubblemaps.io/map-data?token={mint}&chain=sol` | public; self-cap 1 rps | 30 m | 15% |
| 3 | Solsniffer | `solsniffer.com/api/v2/token/{mint}` | 10 req/min | 15 m | 20% |
| 4 | Pump.fun | `frontend-api.pump.fun/coins/{mint}` | unofficial; 2 rps | 60 s | 5% |
| 5 | Jupiter | `tokens.jup.ag/token/{mint}` | unlimited | 60 m | 5% |
| 6 | GeckoTerminal | `api.geckoterminal.com/api/v2/networks/solana/tokens/{mint}/pools` | 30 req/min | 5 m | 10% |
| 7 | DefiLlama | `api.llama.fi/summary/dexs/{mint}` | unlimited | 15 m | 5% |
| 8 | Cielo | `api.cielo.finance/v1/feed?token={mint}` | ~100 req/min | 2 m | 15% |

Weights sum to 100%. Each pack may override weights via pack config.

---

## 3. Composite score formula

```
score =
    0.20 * solsniffer.normalizedScore
  + 0.25 * trench.bundleRisk                // 1 - min(bundleSupplyPct / 0.25, 1)
  + 0.15 * bubblemaps.clusterRisk           // 1 - min(topClusterPct / 0.20, 1)
  + 0.10 * rugcheck.riskComposite
  + 0.15 * cielo.smartMoneyNet24h
  + 0.05 * jupiter.strictOrVerified
  + 0.05 * pumpFun.grad500kOk
  + 0.05 * geckoTerminal.liquidityConcentrated
```

Normalize to 0..1. Surface as a sortable column on `/market/trending` and a ring on `/market/token/:mint`.

When < 4 sources respond, emit `?` and skip. Never silent-fallback.

---

## 4. Remaining work

### 4.1 Evaluator ownership (priority)

`GraduationEngine.evaluate(candidate)` still calls ad-hoc Birdeye + rugcheck paths directly. Route it through `TokenEnrichmentService.load(mint)` as the single contract. See [backend.md §2.4](backend.md).

Behavior:
- Bundle fetched first; filters consume bundle fields.
- Degraded bundle (< 4 sources) → candidate rejected with reason `enrichment-degraded`.
- Never fall back to ad-hoc. If a field is missing, the filter fails closed.

### 4.2 Pack-config weight overrides

Composite weights live in pack config (default: §3 above). Each `StrategyPackVersion.config.composite.weights` may override. Validate at pack save:
- Weights sum within `[0.99, 1.01]`.
- No negative weight.
- No weight on a provider the pack has globally disabled.

### 4.3 Degraded-provider hardening

Per-provider behavior when a client 5xx's for > 2 min:

| Provider | UI surface | Composite behavior |
|---|---|---|
| Trench | "Trench unavailable — using Helius bundle fallback" | Switch to `getSignaturesForAsset` self-build (80 credits) |
| Bubblemaps | "Clusters unavailable" | Weight redistributed |
| Solsniffer | "Security partial (Solsniffer 5xx)" | Weight redistributed |
| Pump.fun | "Pump.fun unavailable" | Weight redistributed |
| Jupiter | silent | Weight redistributed |
| GeckoTerminal | "Pool list unavailable" | Weight redistributed |
| DefiLlama | silent | Weight redistributed |
| Cielo | "Smart-money feed unavailable" | Weight redistributed |

"Weight redistributed" = lost weight spreads proportionally across responsive sources. Do not set it to zero without redistribution — that silently lowers scores.

One integration test per row in this table.

### 4.4 Discovery-stage boundary

Discovery (the `DiscoveryLabService` loop) must never call free providers. Only post-accept. This is currently enforced by construction (enrichment is called in `GraduationEngine`, not `DiscoveryLabService`), but add a lint: grep for enrichment imports inside discovery paths returns zero.

### 4.5 Market-stats page — remaining panels

`/market/token/[mint]` exists. Remaining panels to surface:

1. **Bundle & Snipers** — Trench: bundle %, sniper count, dev-bundle flag, top-5 bundle wallets linked to Solscan.
2. **Cluster map** — Bubblemaps thumbnail + top-cluster %; red banner if > 20%.
3. **Creator history** — Helius `searchAssets(creator)` + `getSignaturesForAsset`: prior launches, rug rate.
4. **Pools** — GeckoTerminal: pools with age + liquidity split.
5. **Security composite ring** — §3 formula.
6. **Pump.fun origin** — replies, KOTH duration, grad timestamp, creator % cashed at grad.
7. **Holder velocity sparkline** — computed from `TokenMetrics` snapshots.
8. **Smart-money strip** — last 6 smart-wallet actions (Cielo + Birdeye smart-money list).

Grader: load `/market/token/[mint]` on 3 mints and confirm every panel either renders data or shows the degraded banner.

### 4.6 Live-mode policy

In `mode=LIVE`:
- Enrichment cache TTL halved for hot candidates (mint is on an active session's watchlist).
- Composite score must have ≥ 5 sources responded (not just the 4-source minimum).
- Trench must be among the responsive sources — it's the highest-signal source for meme filtering; if it's degraded, reject.

Enforce in `TokenEnrichmentService.load(mint, { mode: 'LIVE' })`.

---

## 5. Parallel Work Packages

Enrichment + market-UI slice. WP-MK-1 is the same as rollout WP5; WP-MK-4 is the same as rollout WP13 — cross-referenced so an agent reading only this plan has enough context.

### WP-MK-1 — Evaluator cutover (= rollout WP5, = WP-BE-3)

**Owner:** `enrichment-integrator`.
**Scope:** [engine/graduation-engine.ts](trading_bot/backend/src/engine/graduation-engine.ts) filter-gate block only.
**Acceptance:** grep for direct Birdeye/Rugcheck calls in `GraduationEngine` returns zero; filters consume `bundle.fields`; degraded bundle (< 4 sources) rejects with `rejectReason: 'enrichment-degraded'`.

**Prompt:** See WP-BE-3 in [backend.md §4](backend.md) — identical scope.

### WP-MK-2 — Pack-config weight override validator

**Owner:** `enrichment-integrator`.
**Scope:** [services/workbench/strategy-pack-draft-validator.ts](trading_bot/backend/src/services/workbench/strategy-pack-draft-validator.ts) (extend), `tests/workbench/pack-weight-validator.test.ts` (new).
**Acceptance:** pack save rejects weights summing outside [0.99, 1.01], any negative weight, or any weight on a globally-disabled provider.

**Prompt:**
> Extend `strategy-pack-draft-validator.ts` to validate the `config.composite.weights` object on save: (a) sum within `[0.99, 1.01]`, (b) every value ≥ 0, (c) no key matches a provider in `settings.providers.disabled` list. Return structured errors `{ code, field, message }` consumed by the editor UI's red banner. Test each rule at `tests/workbench/pack-weight-validator.test.ts`. Do NOT modify the pack editor UI — that's WP-UI-B in [dashboard.md](dashboard.md).

### WP-MK-3 — Degraded-provider integration tests

**Owner:** `enrichment-integrator`.
**Scope:** 8 new test files under `trading_bot/backend/tests/enrichment/degraded/*.test.ts`.
**Acceptance:** one test per row in §4.3; each covers: client returns 5xx → bundle marks source `degraded` → UI copy matches the table → composite weight redistributes without setting source weight to 0.

**Prompt:**
> For each provider in §4.3 of [market-enrichment.md](market-enrichment.md), write `tests/enrichment/degraded/<provider>-degraded.test.ts` that mocks the client to return 5xx for > 2 min, calls `TokenEnrichmentService.load(mint)`, and asserts: `bundle.sources[<name>].status === 'degraded'`, `bundle.sources[<name>].degradedMessage === <exact UI copy from the table>`, composite score uses redistributed weights (no zeroing), `bundle.responsiveSourceCount` decremented. Use existing fixtures under `tests/enrichment/fixtures/` as templates; create new fixtures for the 5xx case.

### WP-MK-4 — 8 market panels (= rollout WP13)

**Owner:** `dashboard-decomposer`.
**Scope:** `dashboard/app/market/token/[mint]/components/*.tsx` (8 new components + compose in `page.tsx`).
**Acceptance:** every panel renders from `/api/operator/enrichment/:mint` bundle; each shows its degraded copy (from §4.3) when the source status is `degraded`.

**Prompt:**
> Under `trading_bot/dashboard/app/market/token/[mint]/components/`, implement 8 panel components consuming the enrichment bundle: `bundle-snipers-panel.tsx` (Trench), `cluster-map-panel.tsx` (Bubblemaps + red banner if top-cluster > 20%), `creator-history-panel.tsx` (Helius searchAssets + signatures), `pools-panel.tsx` (GeckoTerminal pools with age + LP split), `security-composite-ring.tsx` (§3 formula as a ring), `pumpfun-origin-panel.tsx` (replies, KOTH duration, grad ts, creator cashed %), `holder-velocity-sparkline.tsx` (from `TokenMetrics` snapshots via the existing trending API), `smart-money-strip.tsx` (last 6 Cielo + Birdeye smart-money events). Each panel reads `bundle.sources[<name>].status` — on `degraded`, render the exact UI copy from §4.3 of [market-enrichment.md](market-enrichment.md). Compose into `page.tsx`. Use shadcn + AG Grid 35 + Recharts per conventions. Do NOT modify the API route or enrichment service.

### WP-MK-5 — LIVE-mode source gate

**Owner:** `enrichment-integrator`.
**Scope:** [services/enrichment/token-enrichment-service.ts](trading_bot/backend/src/services/enrichment/token-enrichment-service.ts), `tests/enrichment/live-mode-gate.test.ts` (new).
**Acceptance:** `TokenEnrichmentService.load(mint, { mode: 'LIVE' })` returns `degraded` when < 5 sources responded or Trench is not among responders; TTL halved when mint is on an active session watchlist.

**Prompt:**
> Extend `TokenEnrichmentService.load(mint, options)`: when `options.mode === 'LIVE'`, require `responsiveSourceCount >= 5` AND Trench among responders — else mark bundle `degraded` with `reason: 'live-source-floor'`. When mint is on an active session watchlist (check via `TradingSessionService.getActiveWatchlist()`), halve the cache TTL for every `EnrichmentFact` read. Do NOT change behavior for non-LIVE modes. Test at `tests/enrichment/live-mode-gate.test.ts` covering: LIVE + 4 sources (degraded), LIVE + 5 sources without Trench (degraded), LIVE + 5 sources with Trench (ok), PAPER + 4 sources (ok), watchlist TTL (half).

---

## 6. Acceptance

- `GraduationEngine` consumes the bundle; grep for direct Birdeye calls in it is clean.
- 8 clients × 1 degraded-path integration test each, green.
- `/market/token/[mint]` renders all 8 panels with degraded fallback.
- `/api/operator/enrichment/:mint` p95 < 1.5 s warm, < 4 s cold (measured).
- Pack-config weight overrides validated at save.
- LIVE mode enforces the stricter source gate.
