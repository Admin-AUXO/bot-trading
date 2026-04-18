# Solana Memecoin Strategy Packs — v2 Draft (10 Packs + Adaptive Engine)

**Status:** design draft, not yet wired into `STRATEGY_PRESETS`.
**Scope:** Birdeye Lite (meme-list + detail) + Helius Developer (RPC + webhooks).
**Shape:** every pack is drop-in compatible with the existing `StrategyPreset` type in [strategy-presets.ts](trading_bot/backend/src/services/strategy-presets.ts). The `filterOverrides` and `exitOverrides` below are *base* values; the **adaptive layer** (§3) mutates them at evaluation time based on live conditions.

---

## 1. Design philosophy

The existing 3 presets (`SCALP_30_60_FAST`, `FIRST_MINUTE_POSTGRAD_CONTINUATION`, `LATE_CURVE_MIGRATION_SNIPE`) all sit in the same narrow band: fresh graduates, 1m/5m tape, TP1 ≈ 1.3×, TP2 ≈ 2×. That's one regime. Real memecoin flow has at least four distinct regimes we're leaving on the table:

| Regime | What fires it | Current coverage |
|---|---|---|
| **Fresh graduation continuation** | <15 min post-grad pump | ✅ 3 presets |
| **Pre-grad curve snipe** | bonding curve ≥98.5% | ✅ 1 preset |
| **Consolidation breakout** | sideways after pump, volume surge | ❌ missing |
| **Smart-money follow** | known wallet cluster buys | ❌ missing |
| **Reclaim / VWAP bounce** | –40% retrace then bid returns | ❌ missing |
| **High-conviction hold (runner)** | top-decile score, >30min hold | ❌ missing |
| **Micro-cap scalp (<$200k MC)** | fast 1.2×/1.4× on thin float | ❌ missing |
| **Defensive / capital preservation** | low-conviction ticket, tight SL | ❌ missing |

The 10 packs below fill these gaps while staying inside the Birdeye Lite call budget.

---

## 2. Ten strategy packs

Each pack lists: thesis, discovery recipe (for `discovery` field), base filters, base exits, Helius needs, and adaptive axes. IDs follow the existing `SCREAMING_SNAKE_CASE` convention.

### Pack 1 — `SCALP_30_60_FAST` *(keep existing, minor tune)*
Already solid. Only change: move `tp1SellFraction: 0.55 → 0.50` and enable **momentum extension** (§3.4) so TP1 stretches to 1.34× when 1m buy pressure is accelerating. Keeps existing callers working.

### Pack 2 — `CONTINUATION_BALANCED` *(rename of `FIRST_MINUTE_POSTGRAD_CONTINUATION`)*
Keep as the "default safe" live pack. Apply adaptive MC ceiling (§3.2) — the hard `5M` cap gets scaled down to `2M` during off-hours and up to `8M` during US peak.

### Pack 3 — `MIGRATION_SNIPE_AGGRESSIVE` *(rename of `LATE_CURVE_MIGRATION_SNIPE`)*
Keep. Add **curve-progress taper**: if progress ≥ 99.8% and last_trade < 30s, tighten SL to 12% and TP1 to 1.25× (graduation-moment fills get less room to breathe).

### Pack 4 — `BREAKOUT_COIL_15M` *(new)*
**Thesis:** Token pumped +60–200% in last hour, went sideways 10–20 min (≤12% range), then breaks prior-20m high on 2× avg volume. Bull-flag in meme-time.
- `discovery.mode: "graduated"`, `sortBy: "volume_5m_change_percent"`, `graduatedWithinSeconds: 3600`, `minLiquidityUsd: 40_000`
- **Filter overrides:** `minLiquidityUsd: 40_000`, `maxMarketCapUsd: 10_000_000`, `minHolders: 250`, `minVolume5mUsd: 10_000`, `minBuySellRatio: 1.18`
- **Extra evaluation gate** (new field — `custom.breakoutCheck`): current 5m volume > 2× trailing 25m avg; current price > prior-25m high; holders still climbing
- **Exits:** SL 8%, TP1 1.20× @ 50%, TP2 1.45× @ 30%, trail 8% on last 20%. Time stop 5 min / hard 12 min
- **Helius:** none beyond standard auth checks
- **Birdeye cost:** moderate — `/trade_data` needed every 30s for candidates in watchlist; cap watchlist at 4

### Pack 5 — `SMART_MONEY_FOLLOW` *(new, highest EV, highest build cost)*
**Thesis:** Maintain 40–60 proven wallets (Birdeye `smart-money` endpoint + Helius-derived PnL list). When ≥2 buy same mint within 15 min, front-run retail.
- **Discovery:** driven by Helius `transactionSubscribe` webhooks on each wallet, not Birdeye polling. Discovery recipe is a stub — real signal comes off webhook.
- **Filter overrides:** `minLiquidityUsd: 25_000`, `maxMarketCapUsd: 15_000_000`, `minHolders: 100`, mint + freeze renounced
- **Exits:** SL 12% (wider — smart wallets play volatility), TP1 1.22× @ 50%, TP2 1.55× @ 30%, trail 10%. **Additional exit trigger:** close on first sell from any tracked wallet holding the same mint (new `smartMoneyExitWatch: true` flag → exit-engine hook).
- **Helius:** `transactionSubscribe` per wallet, monthly refresh of wallet list
- **Birdeye cost:** near-zero scanner cost, all evaluation triggered reactively

### Pack 6 — `MICRO_CAP_SCALP` *(new, aggressive)*
**Thesis:** Sub-$200k MC graduates that are still in buy-pressure window. Tiny ticket (capital modifier 0.5×), fast 1.18×/1.35× cash-out. Win rate targeted at 60%+ because the math on small MC is mean-reverting.
- `graduatedWithinSeconds: 480`, `sortBy: "trade_1m_count"`
- **Filter overrides:** `minLiquidityUsd: 6_000`, `maxMarketCapUsd: 200_000`, `minHolders: 25`, `minBuySellRatio: 1.25`, `maxTop10HolderPercent: 38`, `maxSingleHolderPercent: 15` (tighter — small floats rug harder)
- **Exits:** SL 9%, TP1 1.18× @ 65%, TP2 1.35× @ 25%, trail 7%. Time stop 90s / hard 4 min
- **Capital modifier:** 0.5 (half-ticket, always)
- **Helius:** dev wallet SPL-transfer watch is **required** (tight creator-dump risk)

### Pack 7 — `RUNNER_HOLD` *(new, defensive patience)*
**Thesis:** Entries with `entryScore ≥ 0.85`, strong structure, >$50k liquidity, deserve to run. Most of our EV bleed is exiting 2× winners at 1.3×.
- Uses `CONTINUATION_BALANCED` discovery
- **Filter overrides:** `minLiquidityUsd: 50_000`, `minHolders: 150`, `minBuySellRatio: 1.15`, score threshold in evaluator: reject if `entryScore < 0.82`
- **Exits:** SL 15%, TP1 1.60× @ 35%, TP2 2.50× @ 30%, trail 18% on last 35%. Time stop 10 min / hard 25 min
- **Capital modifier:** 1.5× (bigger ticket only when conviction is top-decile)

### Pack 8 — `VWAP_RECLAIM_BOUNCE` *(new, counter-trend)*
**Thesis:** Token pumped then dumped –35 to –55% from local high, now reclaiming VWAP on returning bids. Mean-reversion play, not momentum.
- `discovery.mode: "graduated"`, `sortBy: "trade_5m_count"`, `graduatedWithinSeconds: 7200`
- **Filter overrides:** `minLiquidityUsd: 30_000`, `maxMarketCapUsd: 4_000_000`, `minHolders: 300`, `minVolume5mUsd: 8_000`, `minBuySellRatio: 1.25` (strict — need real bid return), `maxNegativePriceChange5mPercent: -2` (require positive recent move, contradicting the dump narrative)
- **Extra gate:** `priceChange1hPercent between -55 and -20` AND `priceChange5mPercent > 0`
- **Exits:** SL 10%, TP1 1.22× @ 60%, TP2 1.45× @ 30%, trail 9%. Time stop 4 min / hard 10 min
- **Capital modifier:** 0.75× (counter-trend edge, smaller ticket)

### Pack 9 — `DEFENSIVE_LOW_VOL` *(new, dead-zone pack)*
**Thesis:** During the 9 AM–1 PM IST dead zone, don't stop trading — just get *really* picky. Only top 1% of setups, max one position.
- Same discovery as `CONTINUATION_BALANCED` but `limit: 40` (smaller fetch)
- **Filter overrides:** every threshold tightened ~30% vs balanced: `minLiquidityUsd: 25_000`, `minHolders: 120`, `minUniqueBuyers5m: 30`, `minBuySellRatio: 1.25`, `maxSingleHolderPercent: 14`, `minVolume5mUsd: 7_500`
- **Exits:** tight — SL 7%, TP1 1.15× @ 70%, trail 6%. Time stop 2 min / hard 5 min
- **Capital modifier:** 0.4× (small ticket, low-conviction regime)
- **Runtime flag:** auto-activated when `currentHourIST in [9, 10, 11, 12]`; overrides whatever was selected

### Pack 10 — `HIGH_CONVICTION_PUMP_LEADER` *(new, trend-following)*
**Thesis:** Identify the day's strongest performer (>+200% 24h, >$1M vol 24h, >500 holders) that's still trending, enter on continuation dips. This is the "already proven" play.
- `discovery.mode: "graduated"`, `sortBy: "volume_24h_usd"`, `graduatedWithinSeconds: 86_400`, `minLiquidityUsd: 80_000`
- **Filter overrides:** `minLiquidityUsd: 75_000`, `maxMarketCapUsd: 25_000_000`, `minHolders: 500`, `minVolume5mUsd: 15_000`, `minBuySellRatio: 1.10`, `maxGraduationAgeSeconds: 86_400`
- **Extra gate:** `priceChange24hPercent > 150` AND `priceChange15mPercent between -8 and +5` (dip buy into uptrend)
- **Exits:** SL 12%, TP1 1.35× @ 40%, TP2 1.80× @ 30%, trail 12% on last 30%. Time stop 15 min / hard 40 min
- **Capital modifier:** 1.25×

---

## 3. Adaptive entry/exit engine

Static thresholds are the main thing burning EV. Every filter and every exit number in the packs above is a **base value** — the runtime multiplies or shifts them by axes below before the evaluator sees them.

### 3.1 Axes (all derived from data we already pay for)

| Axis | Source | Cadence |
|---|---|---|
| `timeSinceGraduationSec` | Birdeye meme-list payload | per-candidate |
| `marketCapBucket` | `detail` (already cached in `SharedTokenFact`) | per-candidate |
| `volume1mUsd`, `volume1mDelta` | `trade_data` | per-candidate |
| `buyPressure5m` = `buys5m / trades5m` | `trade_data` | per-candidate |
| `liquidityBucket` | `detail` | per-candidate |
| `sessionRegime` | hour-of-day IST → {peak, active, off, dead} | runtime global |
| `recentWinRate20` | last 20 closed positions | runtime global, recomputed on exit |
| `dailyRealizedPnlPct` | `BotState` | runtime global |
| `currentOpenExposure` | runtime | per-candidate |

### 3.2 Filter mutators (applied before evaluation gates)

```ts
function adaptFilters(base: FilterOverrides, ctx: AdaptiveContext): FilterOverrides {
  const { sessionRegime, recentWinRate20, dailyRealizedPnlPct, marketCapBucket } = ctx;

  // session tightening
  const sessionMult = {
    peak:   { liquidity: 0.85, volume: 0.85, holders: 0.90, buyRatio: 0.95 },
    active: { liquidity: 1.00, volume: 1.00, holders: 1.00, buyRatio: 1.00 },
    off:    { liquidity: 1.20, volume: 1.25, holders: 1.15, buyRatio: 1.05 },
    dead:   { liquidity: 1.50, volume: 1.60, holders: 1.40, buyRatio: 1.12 }, // auto-hands to pack 9
  }[sessionRegime];

  // performance feedback — if last 20 losses, demand more
  const perfMult = recentWinRate20 < 0.40 ? 1.25
                 : recentWinRate20 > 0.65 ? 0.90
                 : 1.00;

  // daily drawdown brake
  const ddMult = dailyRealizedPnlPct < -8  ? 1.35
               : dailyRealizedPnlPct < -4  ? 1.15
               : 1.00;

  const mult = sessionMult.liquidity * perfMult * ddMult;

  return {
    ...base,
    minLiquidityUsd:  Math.round(base.minLiquidityUsd  * mult),
    minVolume5mUsd:   Math.round(base.minVolume5mUsd   * sessionMult.volume  * perfMult),
    minHolders:       Math.round(base.minHolders       * sessionMult.holders * perfMult),
    minBuySellRatio:  base.minBuySellRatio * sessionMult.buyRatio,
    maxMarketCapUsd:  adaptMcCeiling(base.maxMarketCapUsd, sessionRegime, marketCapBucket),
  };
}
```

Rationale (the *why* for the numbers): dead-zone liquidity on Solana memes routinely prints 40–60% wider spreads; that's where the `1.5×` liquidity floor comes from. Drawdown brake is a discretionary trader's instinct — the bot gets pickier after losing days so a bad regime doesn't compound.

### 3.3 Capital sizing mutator

```ts
const ticketUsd = basePositionUsd
                * pack.capitalModifier          // static per pack (0.4–1.5)
                * scoreMultiplier(entryScore)   // 0.5 at score 0.5, 1.0 at 0.75, 1.3 at 0.9
                * exposureBrake(currentOpen)    // 1.0 at 0 open, 0.7 at 1 open, 0.4 at 2
                * drawdownBrake(dailyPnlPct);   // 1.0 at flat, 0.5 at –10% day
```

Floor `$8`, ceiling `$50` (Lite-plan realistic). This replaces the current `$10–30` band in [risk-engine.ts](trading_bot/backend/src/engine/risk-engine.ts) with a proper multiplicative chain.

### 3.4 Exit mutators (the high-leverage change)

The existing exit plan is static per profile. Replace with live-condition overlays:

| Live signal | Mutation |
|---|---|
| `volume1mDelta > +80%` sustained 2 bars | **extend TP1**: `tp1Multiplier *= 1.15`, raise `postTp1RetracePercent +2pp` |
| `volume1mDelta < -50%` at +5–12% gain | **early partial**: sell 40% immediately, tighten remaining trail to 5% |
| `buyPressure5m < 0.45` (sell pressure) | **exit 100%** regardless of profile |
| Large holder (>3%) outflow tx seen via Helius | **instant exit**, ignore TP ladder |
| Position age > `timeStopMinutes` AND gain < `timeStopMinReturnPercent` AND volume decayed >40% | **time stop fires early** (already exists; add volume predicate) |
| Position age < 30s AND gain > +15% | **lock 30% profit immediately** (scalp the ignition) |
| Session turns `dead` while position open | tighten trail to `trailingStopPercent × 0.7` |

### 3.5 MC-tiered exit base (applied before score shaping)

| MC bucket | SL | TP1 × / fraction | TP2 × / fraction | Trail | Time stop |
|---|---|---|---|---|---|
| <$200k | 9% | 1.18 / 0.65 | 1.35 / 0.25 | 7% | 90s / 4m |
| $200k–1M | 10% | 1.25 / 0.55 | 1.55 / 0.30 | 8% | 3m / 6m |
| $1M–5M | 12% | 1.35 / 0.50 | 1.85 / 0.30 | 10% | 5m / 12m |
| $5M–15M | 14% | 1.45 / 0.45 | 2.20 / 0.30 | 12% | 8m / 20m |
| >$15M | 16% | 1.60 / 0.40 | 2.80 / 0.30 | 15% | 15m / 45m |

This table becomes a function: `baseExitForMcBucket(mcUsd)` → then pack overrides → then score shaping → then live mutators.

### 3.6 Graduation-age taper (continuation packs)

```
ageSec < 60   → tp1 × 0.95, sl × 1.15   (fresh ignition, volatile — give room, take quicker)
60–300        → baseline
300–600       → tp1 × 1.05, time-stop × 0.85   (momentum fading, act faster)
600–900       → tp1 × 1.10, time-stop × 0.70, sl × 0.90   (last-call continuation — tight)
>900          → reject entry (already in code)
```

---

## 4. Rollout plan (matches existing `discovery-lab` workflow)

1. **Add packs 4–10** as entries in `STRATEGY_PRESETS` with no adaptive layer — plain static overrides first. Run each in `discovery-lab` for 48h, measure candidate counts and expected-fill distributions. **Drop any pack that produces <3 setups/day or >40 setups/day** (signal/noise failure).
2. **Land adaptive layer §3.2 and §3.3** behind `settings.strategy.adaptive.enabled`. Default off. Turn on for one pack at a time; compare rejected-candidate counts and win rate over 100 trades vs. static baseline in the same pack.
3. **Land exit mutators §3.4** last — these touch live capital. Gate behind `settings.exits.liveMutators.enabled`. Require 30+ paper exits per mutator showing neutral-or-better PnL before enabling on live.
4. **Dashboard:** extend the preset selector to a grid, show per-pack rolling win-rate / avg-winner / avg-loser / EV. This is also where pack 9 auto-handoff should be visible ("session: dead, forced to DEFENSIVE_LOW_VOL").

## 5. API budget sanity check (Birdeye Lite)

Lite gives ~1 req/s, ~15k credits/day. Current lane-budgeted discovery spends ~40% on meme-list sweeps. New packs add:

- Packs 4, 8, 10 need `trade_data` for watchlist tokens — keep watchlist ≤4 per pack, poll every 30s → ~480 calls/h total across packs, well inside the reserve lane
- Pack 5 (smart money) is webhook-driven → near-zero Birdeye cost, moderate Helius cost (one `transactionSubscribe` per wallet, 40–60 wallets)
- Pack 9 (dead zone) actually *reduces* cost (smaller `limit`, fewer sweeps)

Projected monthly Birdeye credit usage with all 10 packs active: ~70% of Lite cap (vs. current ~45%). Comfortable.

---

## 6. Open questions for you

1. Do you want pack 5 (smart money) in v1, or defer it? It's the highest EV but also the most engineering (wallet curation pipeline, Helius webhooks, exit-watch hook).
2. Should pack 9 (dead-zone) auto-override the selected pack, or should I expose it as a user-facing setting (`autoDefensiveInDeadZone: true|false`)?
3. Current IST peak window is assumed 22:00–06:00. Want me to derive this from `BotState` session-regime fields, or hard-code?
4. Adaptive exit mutator §3.4 row "Helius large-holder outflow" requires a live webhook per open position. Helius Developer plan supports this but adds webhook churn — OK to build, or skip on live and keep only on research?

---

**Sources** (2026 practice notes):
- [telegramtrading.net — Best Solana Sniper Bots 2026](https://telegramtrading.net/best-solana-sniper-bot/)
- [AllenHark — PumpFun Sniper launch notes](https://allenhark.com/blog/pumpfun-sniper-launch)
- [QuickNode — Top 9 Pump.fun Sniper Bots 2026](https://www.quicknode.com/builders-guide/best/top-9-pump-fun-sniper-bots)
- [Chainstack — Creating a Pump.fun bot](https://docs.chainstack.com/docs/solana-creating-a-pumpfun-bot)
- [Tuna Launchpad — bonding curve with exit protection](https://www.hokanews.com/2025/12/tuna-launchpad-on-solana-rolls-out.html)
- [CoinLedger — Solana memecoin playbook 2026](https://coinledger.io/learn/solana-memecoin)
