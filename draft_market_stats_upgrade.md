# Market Stats Page Upgrade + Bundle Stats + Strategy Pack Summary

Reference doc on free data providers and bundle-stat sources. See [draft_index.md](draft_index.md) for the full docs map.

---

## A. Free data providers to add to the market stats page

Current surface (see [discovery-lab-market-stats-service.ts](trading_bot/backend/src/services/discovery-lab-market-stats-service.ts)) uses Birdeye + DexScreener + Rugcheck. These free providers fill real gaps:

| Provider | Free tier | What it adds | Integration |
|---|---|---|---|
| **Trench.bot** (`api.trench.bot`) | public, rate-limited | Bundle detection: group of wallets that sniped same block, bundle supply %, sniper count, dev bundle flag | `GET /bundle/bundle_advanced/{mint}` → cache 10m |
| **Bubblemaps** (`api-legacy.bubblemaps.io`) | public JSON | Wallet-cluster graph, supply % held by connected clusters, decentralization score | `GET /map-data?token={mint}&chain=sol` → cache 30m |
| **Pump.fun public API** (`frontend-api.pump.fun`) | public | Bonding curve progress, creator address, initial buy size, reply count, KOTH status | `GET /coins/{mint}` → cache 60s |
| **Solsniffer** (`solsniffer.com/api`) | freemium (free ≤10/min) | 0–100 security score, 20+ flags (mint auth, freeze, upgradeable, sellable-test) — broader than Rugcheck | `GET /token/{mint}` → cache 15m |
| **Jupiter Token API** (`tokens.jup.ag`) | free unlimited | Verified/community tag, strict-list membership, organic-volume estimate | `GET /token/{mint}` → cache 1h |
| **GeckoTerminal** (`api.geckoterminal.com`) | 30 req/min free | Pool list with age, fee tier, reserves per pool → spot secondary Raydium/Meteora pools | `GET /networks/solana/tokens/{mint}/pools` → cache 5m |
| **DefiLlama** (`api.llama.fi`) | free | Aggregated LP TVL, 7d holder chart | cache 15m |
| **Cielo Finance feed** | free read | Top-wallet sentiment on mint (buys vs sells 24h) | `GET /api/v1/feed?token={mint}` |
| **Helius (already paid)** | underused | `getWalletFundedBy`, `getSignaturesForAsset`, holder velocity, `getTokenHolders` | add "creator lineage" panel |

### Concrete additions to the page

1. **Bundle & Snipers panel** (Trench.bot) — bundle %, sniper count, dev-bundle flag, top-5 bundle wallets linked to Solscan. Single highest-signal add for meme filtering.
2. **Cluster map thumbnail** (Bubblemaps) — top-cluster % of supply. Red banner if one cluster >20%.
3. **Creator history row** (Helius) — `getWalletFundedBy` + `getSignaturesForAsset` on creator: prior launches, rug rate, funding source (CEX vs fresh).
4. **Pools mini-table** (GeckoTerminal) — pools with age + liquidity split; catches fake-liquidity splits.
5. **Security composite** — weighted score of Rugcheck + Solsniffer + bundle % + cluster %. One sortable number.
6. **Pump.fun origin** — replies, KOTH duration, grad timestamp, initial buy size, creator % cashed at grad.
7. **Holder velocity sparkline** — computed from existing snapshots; rising line during price chop = continuation signal.
8. **Smart money activity strip** — Cielo + Birdeye `smart-money`: last 6 smart-wallet actions on this mint.

Structure-wise: add `TrenchClient`, `BubblemapsClient`, `PumpFunPublicClient`, `GeckoTerminalClient`, `SolsnifferClient` siblings to existing `RugcheckClient` / `DexScreenerClient`.

---

## B. Bundle stats — three options ranked

1. **Trench.bot** *(recommended primary)* — `GET /bundle/bundle_advanced/{mint}` returns bundle count, bundle supply %, dev-bundle flag, per-bundle wallet list, holding %, sold %.
2. **Padre.gg public scraper** — similar data, less stable. Only if Trench goes down.
3. **Self-build via Helius** *(fallback)* — `getSignaturesForAsset` on mint → first 50 buy txs → cluster by slot (same/adjacent slot, shared fee payer / funded wallet). Accurate but ~50–100 Helius credits per token.

Persist to a new cache table `token_bundle_stats`: `mint`, `bundleCount`, `bundleSupplyPct`, `devBundle`, `sniperCount`, `source`, `checkedAt`.

---

> **Pack summary table** (10 packs with PnL / hold / filters) lives in [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md). Not duplicated here.

---

## Sources
- [Trench.bot](https://trench.bot/)
- [Bubblemaps Solana](https://bubblemaps.io/)
- [Chainstack Pump.fun guide](https://docs.chainstack.com/docs/solana-creating-a-pumpfun-bot)
- [Solsniffer](https://solsniffer.com/)
- [Jupiter Token API](https://station.jup.ag/docs/token-list/token-list-api)
- [GeckoTerminal API](https://apiguide.geckoterminal.com/)
- [DefiLlama API](https://defillama.com/docs/api)
