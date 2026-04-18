# Market Stats Page Upgrade + Bundle Stats + Strategy Pack Summary

Companion doc to [draft_strategy_packs.md](draft_strategy_packs.md). Covers data-provider improvements, bundle-stat integration options, and a per-pack summary table.

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

## C. Strategy pack summary

PnL numbers are operating *targets*, not guarantees. Hold time is median for closed positions. Filters are base values — the adaptive layer (see [draft_strategy_packs.md §3](draft_strategy_packs.md)) mutates them at runtime.

| # | Pack ID | Expected PnL (net, per trade) | Avg hold | Key filters |
|---|---|---|---|---|
| 1 | `SCALP_30_60_FAST` | Win +18–34% · Loss −8 to −10% · EV ≈ +5% | 2–4 min | grad ≤15min, liq ≥$15k, MC ≤$1.2M, holders ≥45, buyers5m ≥16, B/S ≥1.12, top10 ≤40%, single ≤20%, vol5m ≥$2.5k |
| 2 | `CONTINUATION_BALANCED` | Win +20–45% · Loss −10 to −14% · EV ≈ +5.5% | 4–8 min | grad ≤15min, liq ≥$12k, MC ≤$5M (adaptive $2–8M), holders ≥50, buyers5m ≥18, B/S ≥1.08, top10 ≤42%, single ≤22%, vol5m ≥$2.5k |
| 3 | `MIGRATION_SNIPE_AGGRESSIVE` | Win +25–60% · Loss −12 to −16% · EV ≈ +8% | 2–5 min | pregrad progress ≥98.5%, liq ≥$6k, MC ≤$7M, holders ≥30, buyers5m ≥12, B/S ≥1.05, trades1m ≥20, grad-age ≤3min |
| 4 | `BREAKOUT_COIL_15M` | Win +18–35% · Loss −7 to −9% · EV ≈ +6% | 5–10 min | grad ≤60min, liq ≥$40k, MC ≤$10M, holders ≥250, vol5m ≥$10k, B/S ≥1.18, vol5m >2× prior-25m avg, price > prior-25m high |
| 5 | `SMART_MONEY_FOLLOW` | Win +20–50% · Loss −10 to −13% · EV ≈ +9% | 6–15 min | ≥2 tracked wallets buy within 15min, liq ≥$25k, MC ≤$15M, holders ≥100, mint+freeze renounced |
| 6 | `MICRO_CAP_SCALP` | Win +15–28% · Loss −8 to −10% · EV ≈ +4% | 60–180 s | grad ≤8min, liq ≥$6k, MC ≤$200k, holders ≥25, B/S ≥1.25, top10 ≤38%, single ≤15%, dev quiet 10min |
| 7 | `RUNNER_HOLD` | Win +45–130% · Loss −13 to −16% · EV ≈ +12% | 12–25 min | entryScore ≥0.82, liq ≥$50k, holders ≥150, B/S ≥1.15, MC ≤$5M |
| 8 | `VWAP_RECLAIM_BOUNCE` | Win +18–35% · Loss −9 to −11% · EV ≈ +4.5% | 3–8 min | grad ≤2h, liq ≥$30k, MC ≤$4M, holders ≥300, vol5m ≥$8k, B/S ≥1.25, priceChange1h ∈ [−55,−20]%, priceChange5m >0 |
| 9 | `DEFENSIVE_LOW_VOL` | Win +12–20% · Loss −6 to −8% · EV ≈ +2% | 90 s – 3 min | liq ≥$25k, holders ≥120, buyers5m ≥30, B/S ≥1.25, single ≤14%, vol5m ≥$7.5k (auto-active 9–13 IST) |
| 10 | `HIGH_CONVICTION_PUMP_LEADER` | Win +30–70% · Loss −11 to −13% · EV ≈ +9% | 10–30 min | liq ≥$75k, MC ≤$25M, holders ≥500, vol5m ≥$15k, B/S ≥1.10, priceChange24h >+150%, priceChange15m ∈ [−8,+5]% |

EV assumes 45–60% win rate (pack-dependent), adaptive filters engaged, live exit mutators on. Packs 5 and 7 have the highest EV but also the most engineering cost.

---

## Sources
- [Trench.bot](https://trench.bot/)
- [Bubblemaps Solana](https://bubblemaps.io/)
- [Chainstack Pump.fun guide](https://docs.chainstack.com/docs/solana-creating-a-pumpfun-bot)
- [Solsniffer](https://solsniffer.com/)
- [Jupiter Token API](https://station.jup.ag/docs/token-list/token-list-api)
- [GeckoTerminal API](https://apiguide.geckoterminal.com/)
- [DefiLlama API](https://defillama.com/docs/api)
