# Market Stats Page Upgrade + Bundle Stats + Free-Provider Integration

Reference doc on the free/paid data providers the Market Intel surfaces call. See [draft_index.md](draft_index.md) for the docs map. Clients wire into `TokenEnrichmentService` (backend plan §4.4).

Status snapshot as of **2026-04-18**:
- The 8 free-provider client files already exist.
- `TokenEnrichmentService` fanout and `/api/operator/enrichment/:mint` also landed.
- The market pages now consume this data, but evaluator ownership, live hardening, and provider-specific validation still remain.

---

## A. Free provider reference — call pattern · TTL · limits · role · weight

Eight providers complement the paid Birdeye/Helius surface. Every client is gated by `ProviderBudgetService.requestSlot('...', purpose)` even though the call is free — so rate limits count against a global slot quota.

| # | Provider | Endpoint used | Free-tier limit | Cache TTL | Role | Composite weight |
|---|---|---|---|---|---|---:|
| 1 | **Trench.bot** | `GET api.trench.bot/api/v1/bundle/bundle_advanced/{mint}` | public (≈ 10 rps observed; no documented cap — verify) | 10 m (30 s for hot candidates in evaluator) | Bundle / sniper detection; dev-bundle flag | 25 % |
| 2 | **Bubblemaps** | `GET api-legacy.bubblemaps.io/map-data?token={mint}&chain=sol` | public, unthrottled in practice; cap self to 1 rps | 30 m | Wallet-cluster concentration + decentralization score | 15 % |
| 3 | **Solsniffer** | `GET solsniffer.com/api/v2/token/{mint}` | 10 req/min free | 15 m | Broad security score (freeze / mint / upgradeable / sellable test) | 20 % |
| 4 | **Pump.fun public** | `GET frontend-api.pump.fun/coins/{mint}` | public (unofficial — unannounced limits, self-cap 2 rps) | 60 s | Bonding-curve progress, creator, KOTH, replies | 5 % |
| 5 | **Jupiter Token API** | `GET tokens.jup.ag/token/{mint}` | free, unlimited (community hygiene) | 60 m | Strict-list / verified tag, organic-volume proxy | 5 % |
| 6 | **GeckoTerminal** | `GET api.geckoterminal.com/api/v2/networks/solana/tokens/{mint}/pools` | 30 req/min free | 5 m | Per-pool age + liquidity split (fake-LP detection) | 10 % |
| 7 | **DefiLlama** | `GET api.llama.fi/summary/dexs/{mint}` (when present) | free, unlimited | 15 m | LP TVL + 7-day holder chart (when indexed) | 5 % |
| 8 | **Cielo Finance** | `GET api.cielo.finance/v1/feed?token={mint}` | free with key; ~100 req/min | 2 m | Smart-wallet buys vs sells last 24 h | 15 % |

Weights sum to 100 %. See §C for the composite security/signal score formula.

### A.1 Per-provider integration notes

- **Trench.bot** — the single highest-signal free add. Response returns `bundles[]`, `bundleSupplyPct`, `devBundle`, `sniperCount`. Persist into `BundleStats` (see [draft_database_plan.md](draft_database_plan.md)). Fall back to Padre.gg or self-build via Helius `getSignaturesForAsset` if Trench returns 5xx for > 30 s.
- **Bubblemaps** — 30 min TTL is generous; clusters are stable at the timescale we trade at. Store top-cluster % and cluster-count in `EnrichmentFact` with `factType='cluster'`.
- **Solsniffer** — rate-limit-bound; never enrich > 8 mints/min. Response includes 20+ flags; we persist the score + the top-3 flags only.
- **Pump.fun public** — single most volatile endpoint. If it 5xx's for > 2 min, flip the panel to "Pump.fun unavailable" rather than fall back silently.
- **Jupiter Token API** — cheap; call on every accepted candidate. `tags[]` includes `'strict'`, `'verified'`, `'birdeye-trending'`.
- **GeckoTerminal** — 30/min cap is the binding constraint. Call only post-accept, never during discovery.
- **DefiLlama** — only covers mints with a named DEX protocol; skip gracefully for unknown mints.
- **Cielo** — poll-based today; if they ship a websocket we drop the polling client. For now, 2 m TTL matches a reasonable "smart-money warm" feel on the market page.

### A.2 Composite security/signal score (one sortable number)

```
score =
    0.20 * solsniffer.normalizedScore          // 0..1, (100 - their score) inverted
  + 0.25 * trench.bundleRisk                   // 1 - min(bundleSupplyPct / 0.25, 1)
  + 0.15 * bubblemaps.clusterRisk              // 1 - min(topClusterPct / 0.20, 1)
  + 0.10 * rugcheck.riskComposite              // existing Rugcheck
  + 0.15 * cielo.smartMoneyNet24h              // positive net buys → 1
  + 0.05 * jupiter.strictOrVerified            // 1 if strict/verified
  + 0.05 * pumpFun.grad500kOk                  // 1 if past $500k MC grad
  + 0.05 * geckoTerminal.liquidityConcentrated // 1 if liq in single healthy pool
```

Normalize to 0..1; surface on `/market/trending` as a sortable column and on `/market/token/:mint` as a ring. Weights live in pack config so each pack can tune.

### A.3 Concrete additions to the market-stats page

1. **Bundle & Snipers panel** (Trench) — bundle %, sniper count, dev-bundle flag, top-5 bundle wallets linked to Solscan. Single highest-signal add for meme filtering.
2. **Cluster map thumbnail** (Bubblemaps) — top-cluster % of supply. Red banner if one cluster > 20 %.
3. **Creator history row** (Helius — see [draft_helius_integration.md §2.2](draft_helius_integration.md)) — `searchAssets(creator)` + `getSignaturesForAsset` on creator: prior launches, rug rate, funding source (CEX vs fresh).
4. **Pools mini-table** (GeckoTerminal) — pools with age + liquidity split; catches fake-liquidity splits.
5. **Security composite** — the weighted score in §A.2, sortable.
6. **Pump.fun origin** — replies, KOTH duration, grad timestamp, initial buy size, creator % cashed at grad.
7. **Holder velocity sparkline** — computed from existing snapshots; rising line during price chop = continuation signal.
8. **Smart-money activity strip** — Cielo + Birdeye `smart-money-v1/token-list`: last 6 smart-wallet actions on this mint.

New clients as siblings to existing `RugcheckClient` / `DexScreenerClient`:

```
trading_bot/backend/src/services/enrichment/
  trench-client.ts
  bubblemaps-client.ts
  solsniffer-client.ts
  pumpfun-public-client.ts
  jupiter-token-client.ts
  geckoterminal-client.ts
  defillama-client.ts
  cielo-client.ts
  token-enrichment-service.ts     (fanout, polymorphic cache on EnrichmentFact)
```

---

## B. Call-sequence — when each provider fires

```
                            ┌──────────────────────────────────┐
candidate accepted by       │  TokenEnrichmentService.load(m)  │
evaluator                   └──────────────────────────────────┘
                                          │
                                          ▼
                            ┌─────────────┴──────────────┐
                            │ cache lookup per (mint,    │
                            │   source) in EnrichmentFact│
                            └─────────────┬──────────────┘
                                          │  some miss / stale
                                          ▼
          parallel fanout (each guarded by requestSlot)
    ┌─────────────┬─────────────┬─────────────┬───────────────┐
    │   Trench    │ Bubblemaps  │  Solsniffer │  Jupiter tag  │
    │  (10 m TTL) │  (30 m)     │  (15 m)     │  (60 m)       │
    └─────────────┴─────────────┴─────────────┴───────────────┘
    ┌─────────────┬─────────────┬─────────────┬───────────────┐
    │  GeckoTerm  │   Cielo     │  Pump.fun   │   DefiLlama   │
    │   (5 m)     │   (2 m)     │  (60 s)     │   (15 m)      │
    └─────────────┴─────────────┴─────────────┴───────────────┘
                                          │
                                          ▼
                               writes → EnrichmentFact
                               computes → composite score
                                          │
                                          ▼
                              returns EnrichmentBundle
                                          │
                                          ├──▶ evaluator (filter gates)
                                          ├──▶ /api/operator/enrichment/:mint
                                          └──▶ /market/token/:mint cards
```

Discovery stage never calls free providers — discovery only pulls Birdeye trending + DexScreener. Free providers fire only post-accept or on operator navigation to `/market/token/:mint`.

---

## C. Bundle stats — three sources ranked

1. **Trench.bot** *(recommended primary)* — `GET /bundle/bundle_advanced/{mint}` returns bundle count, bundle supply %, dev-bundle flag, per-bundle wallet list, holding %, sold %.
2. **Padre.gg public scraper** — similar data, less stable. Only if Trench is out.
3. **Self-build via Helius** *(fallback)* — `getSignaturesForAsset` on mint → first 50 buy txs → cluster by slot (same/adjacent slot, shared fee payer / funded wallet). Accurate but ~50–100 Helius credits per token.

Persist to `BundleStats` (see [draft_database_plan.md §1](draft_database_plan.md)). Stale > 30 min triggers a refresh on next evaluator hit.

---

## D. Failure / unavailability policy

| Provider | Behavior if degraded | Surface message |
|---|---|---|
| Trench | Flip to self-build via Helius; bump mint cost to ~80 credits | "Trench unavailable — using on-chain bundle build" |
| Bubblemaps | Skip cluster card; keep trade | "Clusters unavailable — check Bubblemaps later" |
| Solsniffer | Omit from composite; weight redistributes | "Security partial (Solsniffer 5xx)" |
| Pump.fun | Omit panel | "Pump.fun unavailable" |
| Jupiter token | Omit tag | silent (not user-visible) |
| GeckoTerminal | Omit pool list | "Pool list unavailable" |
| Cielo | Omit smart-money strip | "Smart-money feed unavailable" |
| DefiLlama | Silent skip | — |

Composite score always emits when ≥ 4 sources responded; otherwise shows as `?` in the UI.

---

## E. Acceptance criteria

- Each of the 8 clients exists as a single file with typed response shape and a test fixture.
- `TokenEnrichmentService` calls are idempotent and respect TTLs (no double-fetch within TTL window).
- `EnrichmentFact` row count is bounded (composite index on `(mint, source)` + daily prune of rows stale > 7 days).
- Composite score formula lives in pack config; each pack can override weights.
- `/api/operator/enrichment/:mint` p95 < 1.5 s on warm cache; < 4 s on full cold fanout with one provider slow.
- Degraded-provider paths tested — no panel hard-fails when a single client 5xx's.

---

## F. Sources

- [Trench.bot](https://trench.bot/)
- [Bubblemaps Solana](https://bubblemaps.io/)
- [Chainstack Pump.fun guide](https://docs.chainstack.com/docs/solana-creating-a-pumpfun-bot)
- [Solsniffer](https://solsniffer.com/)
- [Jupiter Token API](https://station.jup.ag/docs/token-list/token-list-api)
- [GeckoTerminal API](https://apiguide.geckoterminal.com/)
- [DefiLlama API](https://defillama.com/docs/api)
- [Cielo Finance](https://cielo.finance/)
