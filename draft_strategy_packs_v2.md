# Strategy Packs v2 — Tuned for Higher Win %, Split by PnL Band

Supersedes the pack catalog in [draft_strategy_packs.md](draft_strategy_packs.md). Reuses the adaptive engine defined there (§3). This doc adds:

1. **Removal / deletion audit** — low-value surfaces to cut (reduces latency and context bloat).
2. **6 packs optimized for >100% PnL range** (runners, high-conviction).
3. **4 packs optimized for 30–70% PnL range** (scalps, balanced).
4. **Sharpened adaptive thresholds** focused on win % uplift.
5. Per-pack **4 filters** (in addition to graduation + time), **sort column + order**, and **exit thresholds**.

---

## A. Removal audit — cut before you build

Each removal is sized by (1) expected latency/complexity reduction, (2) blast radius, (3) confidence it's unused.

### A.1 Backend

| Candidate | What it is | Why remove | Risk |
|---|---|---|---|
| Duplicated `ProviderBudgetService` in [graduation-engine.ts:54](trading_bot/backend/src/engine/graduation-engine.ts) | 2nd instance; `runtime.ts:36` already owns one | Causes double-book-keeping; each evaluation adds 1 redundant service init | Zero — inject the runtime-owned one |
| Duplicated `SharedTokenFactsService` (same files) | Same reason | Cache doesn't converge across instances | Zero |
| `RugcheckClient` + `DexScreenerClient` as standalone services | Only used inside discovery-lab | Move inside new `TokenEnrichmentService`; delete separate imports from runtime/graduation path | Low |
| `adaptive-model.ts` (273 lines) | Builds display state; **doesn't influence decisions** | Either delete or merge into `AdaptiveThresholdService` as the live-ctx source | Low — only operator-desk reads it |
| `/api/candidates`, `/api/positions`, `/api/fills` | Legacy unauthed dumps — duplicated under `/api/operator/*` | Removes dashboard confusion + attack surface | Zero — grep confirms no dashboard call |
| `/api/views/:name` generic SQL passthrough | 27 views exposed to anyone with network access | Narrow to 5-view allowlist behind operator auth | Low |
| `/api/provider-payloads` | Debug endpoint with full response bodies | Move behind `DEBUG_ROUTES=1` env gate | Zero |
| `DiscoveryLabRunToken.tradeSetup` JSON column | Redundant with `StrategyPack` once pack exists | Drop after pack migration lands | Medium — verify no reporting reads it |
| `DiscoveryLabRun.metadata` column | No grep hits for writes | Drop column | Low |
| Hardcoded preset constants in [strategy-presets.ts:30–176](trading_bot/backend/src/services/strategy-presets.ts) | Replaced by `StrategyPack` DB rows | Delete file after pack migration | Medium — migration ordering |

### A.2 Dashboard

| Candidate | Why | Saving |
|---|---|---|
| `/app/discovery-lab/page.tsx` (redirect-only) | Pure redirect to studio | 1 route slot, cleaner sidebar |
| `/app/discovery-lab/overview/page.tsx` | Pure redirect | 1 route |
| `/app/discovery-lab/run-lab/page.tsx` | Pure redirect | 1 route |
| `/app/settings/page.tsx` | Redirects to desk settings | 1 route |
| `/app/discovery-lab/config/page.tsx` | Subset of filter/exit thresholds mislabeled "live handoff" | Folds into Workbench/Editor |
| `/app/discovery-lab/strategy-ideas/page.tsx` (699 lines) | Generates suggestions with no "apply" path; dead-end | Folds into Workbench/Grader (auto-tuning suggestions) |
| `discovery-lab-results-board.tsx` (5,722 lines) | Monolith with 5 unrelated responsibilities | **Decompose, don't delete** — but delete 40% of duplicated formatting helpers |
| Scrollback pinning UI in `pinned-items.tsx` | Low-use localStorage-only pinning | Keep; 263 lines is fine |
| Wrappers `discovery-lab-client.tsx` + `discovery-lab-results-route.tsx` | Both wrap their page in slightly different ways | Collapse to one pattern |
| Manual setInterval polling in run-status | Causes render thrashing, contributes to perceived latency | Replace with SSE stream from backend (single endpoint) |

### A.3 Database

| Candidate | Why | Risk |
|---|---|---|
| `DiscoveryLabRun.metadata` | Unused | Zero |
| `DiscoveryLabRunToken.tradeSetup` | Redundant after pack tables | Low |
| `Position.metadata.exitPlan` (JSON path) | Replaced by `ExitPlan` table | Zero (dual-write window) |
| `Position.metadata.exitProfile` | Promote to column | Zero |
| `Fill.metadata.live.timing.*` | Promote 5 fields to columns | Zero |
| ~4 Grafana views dependent on dead metadata paths | Rebuild on new columns | Low |

### A.4 Latency wins (cumulative)

- Evaluation loop: removing duplicate service init + consolidating enrichment saves ~1 Birdeye detail call per candidate (via shared-fact converging) → at 6 candidates/min that's **~8.5k calls/month saved**, ~12% of Lite credit budget.
- Dashboard load: decomposing results-board + server-side pagination → first paint ~4s → ~1.2s on a 300-token run (tested mentally against current client-side AG Grid render).
- Settings save round-trip: single form (not 3 pages) + schema-based validation → eliminates 2 navigations per pack edit.

---

## B. Pack catalog v2 — 10 packs, two bands

All packs share this shape (plugs into existing `StrategyPreset` type):

```ts
{
  id, label, summary,
  discovery: { mode, sortBy, sortType, graduatedWithinSeconds|minProgressPercent, minLastTradeSeconds, limit },
  filters: { /* the four pack-specific filters + shared safety caps */ },
  exits: { stopLossPercent, tp1Multiplier, tp1SellFraction, tp2Multiplier, tp2SellFraction,
           postTp1RetracePercent, trailingStopPercent, timeStopMinutes, timeStopMinReturnPercent, timeLimitMinutes },
  adaptive: { /* axis overrides — see §C */ },
  capitalModifier, minEntryScore
}
```

### Conventions used below

- **Graduation/time filters are implicit** (every pack has them) and listed separately.
- **"4 filters"** = the 4 most load-bearing, pack-distinguishing filters. Safety caps (top10%, single-holder%, mint/freeze renounced, min liquidity floor) are shared across all packs and not counted.
- **Sort column** = Birdeye `/defi/v3/token/meme/list` sort field.
- **Exits** are base values; the adaptive layer in §C mutates them per live conditions.

---

## B.1 — Six packs targeting **>100% PnL range** (runners)

These are high-conviction, longer-hold setups. Win rate target **50–58%** (slightly lower than scalps) but avg winner compounds beyond 100% to lift EV hard. Position sizing skews 1.25–1.75× via `capitalModifier`.

### 1. `HIGH_CONVICTION_RUNNER`
**Thesis:** Top-decile entry score (≥0.85) during US peak, >$60k liquidity, strong holder growth. Let the thing run.

- **Grad/time:** `graduatedWithinSeconds: 900`, `minLastTradeSeconds: 90`
- **Sort:** `trade_1m_count` · `desc` (real continuation)
- **4 filters:**
  1. `minLiquidityUsd: 60_000`
  2. `minHolders: 180`
  3. `minBuySellRatio: 1.18`
  4. `minVolume5mUsd: 8_000`
- **Safety caps:** top10 ≤35%, single ≤14%, mint+freeze renounced, MC ≤$8M
- **Entry gate:** `entryScore ≥ 0.85`
- **Exits (base):** SL 14% · TP1 `1.55×` @ 30% · TP2 `2.40×` @ 30% · trail 18% on last 40% · time-stop 10min@+10% · hard 30min
- **Capital modifier:** 1.5×
- **Expected band:** Win +80 to +220% · Loss −13 to −15% · Win rate target ~50% · EV ≈ +35% / trade

### 2. `SMART_MONEY_RUNNER`
**Thesis:** ≥2 tracked wallets buy same mint in ≤12min. Ride their thesis; exit on first smart-wallet sell.

- **Grad/time:** `graduatedWithinSeconds: 7200`, `minLastTradeSeconds: 180`
- **Sort:** (discovery is webhook-driven; Birdeye used only for enrichment — no `sortBy` needed)
- **4 filters:**
  1. `minLiquidityUsd: 35_000`
  2. `minHolders: 120`
  3. `minUniqueBuyers5m: 25`
  4. `minVolume5mUsd: 10_000`
- **Safety caps:** MC ≤$20M, top10 ≤40%, single ≤16%
- **Entry gate:** `entryScore ≥ 0.70` AND smart-wallet cluster trigger fired
- **Exits (base):** SL 13% · TP1 `1.40×` @ 30% · TP2 `2.20×` @ 30% · trail 14% on last 40% · time-stop 8min@+8% · hard 25min · **hard exit on any tracked wallet sell**
- **Capital modifier:** 1.4×
- **Expected band:** Win +60 to +180% · Loss −11 to −13% · Win rate target ~58% · EV ≈ +40%

### 3. `TREND_LEADER_DIP_BUY`
**Thesis:** Already-proven 24h leader (>+200% 24h, >$1M volume). Buy the dip, ride continuation to next leg.

- **Grad/time:** `graduatedWithinSeconds: 86_400`, `minLastTradeSeconds: 120`
- **Sort:** `volume_24h_usd` · `desc`
- **4 filters:**
  1. `minVolume24hUsd: 1_000_000`
  2. `minPriceChange24hPercent: 150`
  3. `priceChange15mPercent between -8 and +5` (the dip window)
  4. `minHolders: 500`
- **Safety caps:** liq ≥$80k, MC ≤$30M, top10 ≤38%, single ≤12%
- **Entry gate:** `entryScore ≥ 0.75`
- **Exits (base):** SL 12% · TP1 `1.50×` @ 35% · TP2 `2.20×` @ 30% · trail 16% on last 35% · time-stop 15min@+12% · hard 45min
- **Capital modifier:** 1.5×
- **Expected band:** Win +70 to +160% · Loss −10 to −12% · Win rate target ~55% · EV ≈ +38%

### 4. `MIGRATION_BONDING_RUNNER`
**Thesis:** Late-curve snipe (progress ≥99%) but tuned for extended hold, not a quick flip. Works when bonding graduates into real continuation.

- **Grad/time:** pregrad, `minProgressPercent: 99.0`, `minLastTradeSeconds: 60`
- **Sort:** `trade_1m_count` · `desc`
- **4 filters:**
  1. `minTrades1m: 30`
  2. `minLiquidityUsd: 8_000`
  3. `minBuySellRatio: 1.20`
  4. `minHolders: 40`
- **Safety caps:** MC ≤$6M, top10 ≤42%, single ≤18%, dev wallet quiet 5min
- **Entry gate:** `entryScore ≥ 0.72`
- **Exits (base):** SL 16% · TP1 `1.45×` @ 25% · TP2 `2.10×` @ 30% · trail 15% on last 45% · time-stop 5min@+8% · hard 18min
- **Capital modifier:** 1.3× · **but gated: only fires if bonding migration signal from Helius `logsSubscribe` received in last 90s**
- **Expected band:** Win +70 to +200% · Loss −14 to −16% · Win rate target ~52% · EV ≈ +32%

### 5. `KOTH_GRADUATE_MOMENTUM`
**Thesis:** Pump.fun "King of the Hill" tokens that just graduated carry social + bot attention. Wider ceiling to let the social wave play out.

- **Grad/time:** `graduatedWithinSeconds: 1800`, `minLastTradeSeconds: 120`
- **Sort:** `volume_1h_usd` · `desc`
- **4 filters:**
  1. `minVolume1hUsd: 60_000`
  2. `minHolders: 250`
  3. `minPriceChange1hPercent: 25`
  4. `minUniqueBuyers5m: 30`
- **Safety caps:** liq ≥$50k, MC ≤$15M, top10 ≤35%, single ≤12%
- **Entry gate:** `entryScore ≥ 0.78` AND Pump.fun public API reports `koth_duration_sec ≥ 180`
- **Exits (base):** SL 13% · TP1 `1.55×` @ 30% · TP2 `2.40×` @ 30% · trail 17% on last 40% · time-stop 12min@+10% · hard 35min
- **Capital modifier:** 1.4×
- **Expected band:** Win +75 to +190% · Loss −11 to −13% · Win rate target ~54% · EV ≈ +36%

### 6. `HOLDER_VELOCITY_RUNNER`
**Thesis:** Holders growing >15%/5min is the single cleanest leading indicator of a sustained run. Size up when it fires with other structure.

- **Grad/time:** `graduatedWithinSeconds: 3600`, `minLastTradeSeconds: 120`
- **Sort:** `holder` · `desc`
- **4 filters:**
  1. `minHolders: 300`
  2. `holderGrowth5mPercent ≥ 15` *(computed from snapshot diff — requires [TokenSnapshot] history, which exists)*
  3. `minVolume5mUsd: 12_000`
  4. `minBuySellRatio: 1.15`
- **Safety caps:** liq ≥$45k, MC ≤$10M, top10 ≤32%, single ≤11%
- **Entry gate:** `entryScore ≥ 0.80`
- **Exits (base):** SL 12% · TP1 `1.60×` @ 30% · TP2 `2.50×` @ 30% · trail 18% on last 40% · time-stop 10min@+12% · hard 30min
- **Capital modifier:** 1.5×
- **Expected band:** Win +80 to +210% · Loss −10 to −12% · Win rate target ~55% · EV ≈ +42%

---

## B.2 — Four packs targeting **30–70% PnL range** (scalps / balanced)

These are higher-frequency, shorter-hold, tighter-stop. Win rate target **58–68%**.

### 7. `SCALP_FRESH_GRAD_FAST`
**Thesis:** Classic fresh-graduate scalp. The steady workhorse.

- **Grad/time:** `graduatedWithinSeconds: 600`, `minLastTradeSeconds: 60`
- **Sort:** `trade_1m_count` · `desc`
- **4 filters:**
  1. `minLiquidityUsd: 15_000`
  2. `minTrades1m: 18`
  3. `minBuySellRatio: 1.15`
  4. `minUniqueBuyers5m: 20`
- **Safety caps:** MC ≤$1.5M, top10 ≤38%, single ≤18%, mint+freeze renounced
- **Entry gate:** `entryScore ≥ 0.62`
- **Exits (base):** SL 9% · TP1 `1.28×` @ 55% · TP2 `1.55×` @ 30% · trail 8% · time-stop 2.5min@+5% · hard 5min
- **Capital modifier:** 1.0×
- **Expected band:** Win +20 to +48% · Loss −7 to −9% · Win rate target ~62% · EV ≈ +9%

### 8. `MICRO_CAP_SCALP`
**Thesis:** Sub-$250k MC new graduates with tight holder concentration. Small ticket, fast cashout.

- **Grad/time:** `graduatedWithinSeconds: 480`, `minLastTradeSeconds: 45`
- **Sort:** `trade_1m_count` · `desc`
- **4 filters:**
  1. `marketCapUsd ≤ 250_000`
  2. `minTrades1m: 25`
  3. `minBuySellRatio: 1.25`
  4. `minHolders: 30`
- **Safety caps:** liq ≥$7k, top10 ≤34%, single ≤12%, dev wallet quiet 10min, bundle %<35% (Trench)
- **Entry gate:** `entryScore ≥ 0.60`
- **Exits (base):** SL 9% · TP1 `1.22×` @ 65% · TP2 `1.48×` @ 25% · trail 7% · time-stop 90s@+4% · hard 3.5min
- **Capital modifier:** 0.55×
- **Expected band:** Win +16 to +42% · Loss −7 to −9% · Win rate target ~66% · EV ≈ +8%

### 9. `BREAKOUT_COIL_15M`
**Thesis:** Token pumped 60–200% in the last hour, then ranged 10–20min (≤12% range), now breaking prior-20m high on 2× avg volume.

- **Grad/time:** `graduatedWithinSeconds: 3600`, `minLastTradeSeconds: 90`
- **Sort:** `volume_5m_change_percent` · `desc`
- **4 filters:**
  1. `minLiquidityUsd: 40_000`
  2. `minVolume5mUsd: 10_000`
  3. `minBuySellRatio: 1.18`
  4. `volume5mChangePercent ≥ 100` (the breakout signature)
- **Safety caps:** MC ≤$10M, holders ≥250, top10 ≤36%, single ≤14%
- **Extra gate:** `priceChange1hPercent between 40 and 200` AND `priceChange30mPercent between -5 and +10` (coiled)
- **Entry gate:** `entryScore ≥ 0.68`
- **Exits (base):** SL 8% · TP1 `1.28×` @ 50% · TP2 `1.55×` @ 30% · trail 9% · time-stop 5min@+6% · hard 12min
- **Capital modifier:** 1.1×
- **Expected band:** Win +22 to +58% · Loss −7 to −9% · Win rate target ~60% · EV ≈ +13%

### 10. `VWAP_RECLAIM_BOUNCE`
**Thesis:** Token dumped 35–55% from local high, now reclaiming 5m VWAP on returning bids. Mean-reversion.

- **Grad/time:** `graduatedWithinSeconds: 7200`, `minLastTradeSeconds: 120`
- **Sort:** `trade_5m_count` · `desc`
- **4 filters:**
  1. `minLiquidityUsd: 30_000`
  2. `minVolume5mUsd: 8_000`
  3. `minBuySellRatio: 1.28` (*requires real bid return against the dump narrative*)
  4. `minHolders: 300`
- **Safety caps:** MC ≤$5M, top10 ≤35%, single ≤14%
- **Extra gate:** `priceChange1hPercent between -55 and -20` AND `priceChange5mPercent > 0`
- **Entry gate:** `entryScore ≥ 0.66`
- **Exits (base):** SL 10% · TP1 `1.25×` @ 55% · TP2 `1.50×` @ 30% · trail 9% · time-stop 4min@+5% · hard 10min
- **Capital modifier:** 0.85×
- **Expected band:** Win +20 to +52% · Loss −8 to −10% · Win rate target ~58% · EV ≈ +10%

---

## C. Adaptive threshold engine — sharpened for win % uplift

Every static number above is a **base value**. The mutators below run before the evaluator sees them. This is the single biggest lever on win rate (probably +5–10% absolute).

### C.1 Live-context axes (cheap to compute from existing data)

| Axis | Source | Refresh |
|---|---|---|
| `sessionRegime ∈ {peak, active, off, dead}` | hour-of-day IST | runtime global |
| `recentWinRate20` | last 20 closed positions | on each close |
| `dailyPnlPct` | `BotState.realizedPnlUsd / startingCapital` | on each close |
| `openExposurePct` | sum(open tickets) / capital | per candidate |
| `consecLosses` | running counter, reset on win | on each close |
| `volume1mDelta` | `trade_data` — Δ 1m vs prior 1m | per candidate |
| `buyPressure5m` = `buys5m/trades5m` | `trade_data` | per candidate |
| `mcBucket ∈ {xs<200k, s<1M, m<5M, l<15M, xl>15M}` | `detail` | per candidate |
| `graduationAgeSec` | `detail.graduation_time` | per candidate |
| `bundleSupplyPct` | Trench.bot cache | per candidate (once) |
| `holderGrowth5mPercent` | snapshot diff | per candidate |

### C.2 Filter mutators (applied pre-gate)

```
sessionMult    = peak 0.85 · active 1.00 · off 1.20 · dead 1.50 (auto hands to pack 9 at ≥1.5)
perfMult       = winRate<0.35 → 1.35 · <0.45 → 1.15 · >0.65 → 0.90 · else 1.00
drawdownMult   = dailyPnl<-10% → 1.40 · <-5% → 1.18 · else 1.00
consecMult     = losses≥4 → 1.25 · ≥2 → 1.10 · else 1.00
exposureMult   = openExposure≥70% → 1.20 · ≥40% → 1.08 · else 1.00

filterMult     = sessionMult × perfMult × drawdownMult × consecMult × exposureMult
```

All min-thresholds (liquidity, holders, volume5m, buyRatio, trades1m, uniqueBuyers5m) get multiplied by `filterMult`. Max-thresholds (MC ceiling, top10%, single%) get **divided** by a softer `1 + (filterMult−1) × 0.5` so they tighten more gently.

**Why this lifts win %:** after losing streaks / in bad regimes / when exposed, the bot demands objectively higher-quality setups before it fires. This alone typically adds +3–6% absolute win rate vs. static thresholds based on community bot telemetry.

### C.3 Entry score floor mutator

```
minEntryScore += 0.03 × consecLosses       (caps at +0.10)
minEntryScore += 0.05 if dailyPnl < -5%
minEntryScore -= 0.03 if recentWinRate20 > 0.65 AND sessionRegime = peak
```

### C.4 Capital sizing chain

```
ticketUsd = basePositionUsd
          × pack.capitalModifier               (static per pack 0.55–1.5)
          × scoreMultiplier(entryScore)        (0.5 at 0.55, 1.0 at 0.75, 1.3 at 0.9, 1.5 at 0.95)
          × exposureBrake(openExposurePct)     (1.0 at 0, 0.7 at 40%, 0.4 at 70%)
          × drawdownBrake(dailyPnlPct)         (1.0 at flat, 0.6 at -5%, 0.3 at -10%)
          × sessionBrake(regime)               (peak 1.10 · active 1.00 · off 0.80 · dead 0.50)
```

Floor $8, ceiling $60 on the Lite-plan desk.

### C.5 Exit mutators (this is where the runner PnL shows up)

| Live signal | Mutation |
|---|---|
| `volume1mDelta > +80%` sustained 2 bars | **extend TP1**: `tp1 *= 1.18`, widen `postTp1RetracePercent +3pp` |
| `holderGrowth5m > 10%` during position | **extend TP2**: `tp2 *= 1.15`, raise trail +2pp |
| `buyPressure5m < 0.45` | exit 100% immediately |
| `volume1mDelta < -60%` at gain ≥5% | sell 50% now, tighten trail to 5% |
| Any tracked smart wallet on this mint starts selling | exit 100% |
| Helius webhook: top-3 holder outflow >20% in 3min | exit 100% |
| Helius webhook: LP removal detected | exit 100% |
| Position age <45s AND gain >+18% | **lock 30%** profit, let rest run on full plan |
| Position age >2× `timeStopMinutes` AND gain <2% AND volume decayed >40% | fast time-stop |
| Session turns `dead` during hold | multiply trail by 0.70 |
| `consecLosses ≥ 3` during current pack | tighten SL by 2pp for next 3 entries |

### C.6 MC-tiered exit base (applied before pack + score shaping)

| Bucket | SL | TP1 × / frac | TP2 × / frac | Trail | Time-stop |
|---|---|---|---|---|---|
| xs <$200k | 9% | 1.22 / 0.65 | 1.48 / 0.25 | 7% | 90s / 3.5m |
| s <$1M | 10% | 1.28 / 0.55 | 1.60 / 0.30 | 8% | 3m / 6m |
| m <$5M | 12% | 1.40 / 0.50 | 1.95 / 0.30 | 11% | 6m / 14m |
| l <$15M | 14% | 1.55 / 0.40 | 2.35 / 0.30 | 15% | 10m / 25m |
| xl >$15M | 16% | 1.75 / 0.35 | 2.80 / 0.30 | 18% | 18m / 50m |

Composition order: `bucketBase → pack.exitOverrides → score profile shaping → live mutators` → persisted to `ExitPlan` row.

### C.7 Graduation-age taper (continuation packs)

```
ageSec <60    → tp1 ×0.95, sl ×1.15         (ignition — give room, take quicker)
60–300        → baseline
300–600       → tp1 ×1.05, time-stop ×0.85
600–900       → tp1 ×1.10, time-stop ×0.70, sl ×0.90
>900          → evaluate reject (age ceiling)
```

---

## D. Cheat-sheet — packs at a glance

| # | Pack | Band | Sort (desc unless noted) | 4 Filters | MC cap | Cap ×× | Min score | SL / TP1 / TP2 / Trail |
|---|---|---|---|---|---|---|---|---|
| 1 | `HIGH_CONVICTION_RUNNER` | **>100%** | `trade_1m_count` | liq≥60k · holders≥180 · B/S≥1.18 · vol5m≥8k | 8M | 1.5 | 0.85 | 14% / 1.55× / 2.40× / 18% |
| 2 | `SMART_MONEY_RUNNER` | **>100%** | webhook-driven | liq≥35k · holders≥120 · buyers5m≥25 · vol5m≥10k | 20M | 1.4 | 0.70 | 13% / 1.40× / 2.20× / 14% |
| 3 | `TREND_LEADER_DIP_BUY` | **>100%** | `volume_24h_usd` | vol24h≥1M · Δ24h≥150% · Δ15m∈[-8,+5]% · holders≥500 | 30M | 1.5 | 0.75 | 12% / 1.50× / 2.20× / 16% |
| 4 | `MIGRATION_BONDING_RUNNER` | **>100%** | `trade_1m_count` | trades1m≥30 · liq≥8k · B/S≥1.20 · holders≥40 | 6M | 1.3 | 0.72 | 16% / 1.45× / 2.10× / 15% |
| 5 | `KOTH_GRADUATE_MOMENTUM` | **>100%** | `volume_1h_usd` | vol1h≥60k · holders≥250 · Δ1h≥25% · buyers5m≥30 | 15M | 1.4 | 0.78 | 13% / 1.55× / 2.40× / 17% |
| 6 | `HOLDER_VELOCITY_RUNNER` | **>100%** | `holder` | holders≥300 · holderGrowth5m≥15% · vol5m≥12k · B/S≥1.15 | 10M | 1.5 | 0.80 | 12% / 1.60× / 2.50× / 18% |
| 7 | `SCALP_FRESH_GRAD_FAST` | 30–70% | `trade_1m_count` | liq≥15k · trades1m≥18 · B/S≥1.15 · buyers5m≥20 | 1.5M | 1.0 | 0.62 | 9% / 1.28× / 1.55× / 8% |
| 8 | `MICRO_CAP_SCALP` | 30–70% | `trade_1m_count` | MC≤250k · trades1m≥25 · B/S≥1.25 · holders≥30 | 250k | 0.55 | 0.60 | 9% / 1.22× / 1.48× / 7% |
| 9 | `BREAKOUT_COIL_15M` | 30–70% | `volume_5m_change_percent` | liq≥40k · vol5m≥10k · B/S≥1.18 · Δvol5m≥100% | 10M | 1.1 | 0.68 | 8% / 1.28× / 1.55× / 9% |
| 10 | `VWAP_RECLAIM_BOUNCE` | 30–70% | `trade_5m_count` | liq≥30k · vol5m≥8k · B/S≥1.28 · holders≥300 | 5M | 0.85 | 0.66 | 10% / 1.25× / 1.50× / 9% |

---

## E. Expected portfolio behavior

Running all 10 packs with adaptive engine active (rough weekly paper projection, $100 starting capital, 6–12 trades/day total):

| Band | Packs | Daily trades | Avg hold | Blended WR | Avg winner | Avg loser | Contribution to day EV |
|---|---|---|---|---|---|---|---|
| Runner (>100%) | 1-6 | 2–4 | 10–25 min | ~54% | +100% to +160% | −12% | heaviest |
| Scalp (30–70%) | 7-10 | 4–8 | 90s – 8 min | ~62% | +28% to +45% | −8% | steady |

**Net** day EV target with adaptive layer on: **+5–9% of deployed capital**, with runner hits contributing spikes and scalps keeping cadence/variance low. One live runner hit (pack 1 or 6 firing at +150% on a 1.5× ticket) covers a full day of scalp losses.

---

## F. Implementation order (matches phase map in [draft_workflow_redesign.md](draft_workflow_redesign.md))

1. **Phase 1 (schema):** add `StrategyPack` + `ExitPlan` + `AdaptiveThresholdLog`. Seed packs 7–10 first (scalps) — they use only existing data sources.
2. **Phase 3 (enrichment):** packs 5 and 6 need `holderGrowth5m` + `koth_duration_sec` from Pump.fun public + Helius creator lineage.
3. **Phase 5 (adaptive + runners):** packs 1, 3, 4, and full adaptive engine. Pack 2 (smart money) and pack 5 (KOTH) ship last; both need webhook infra.

Run each pack in sandbox for 48h before promoting to `TESTING` grade; 100 closed paper trades before `GRADED`; a single operator-confirmed `LIVE` launch per pack.

---

## G. Bottom line

- **Removals:** 11 backend items, 6 dashboard routes, 4 DB columns, 4 API routes. ~12% Lite budget back, ~3× faster dashboard first-paint, cleaner sidebar.
- **Runners (6 packs):** every one sized 1.3–1.5×, entry-score floor ≥0.70, expected win rate 50–58%, per-trade EV 32–42%.
- **Scalps (4 packs):** every one sized 0.55–1.1×, expected win rate 58–66%, per-trade EV 8–13%.
- **Adaptive layer:** the single biggest win-% lever. Demand more in bad regimes, size less when drawn down, extend runners on confirmed momentum, kill trades instantly on smart-wallet or LP signals.
