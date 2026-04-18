# Solana Memecoin Bot: +20% Scalp Trading Strategy

## Overview

**Goal:** Consistent +20% profits on new meme tokens  
**Capital:** $100 starting (scales to $500+/month by month 4-5)  
**Execution:** Jupiter API + Jito tips  
**Subscriptions:** Birdeye $40 (Standard tier) + Helius $50 (Developer)  
**Target Win Rate:** 50–65% with +20–25% avg winner, –8 to –10% avg loser

---

## Peak Trading Times (IST)

Solana memecoins follow US timezone activity. Optimal bot operation:

| Time (IST) | US Equivalent | Activity Level | Bot Status |
|---|---|---|---|
| **10:00 PM – 2:00 AM** | US morning / mid-day | High | Active |
| **2:00 AM – 6:00 AM** | US afternoon / evening | **PEAK** | **Primary window** |
| **6:00 AM – 9:00 AM** | US late night | Medium | Active (selective) |
| **9:00 AM – 1:00 PM** | US sleep / Asia mid-day | **LOW (dead zone)** | **PAUSE** |
| **1:00 PM – 7:00 PM** | Europe / Asia | Medium | Light mode |
| **7:00 PM – 10:00 PM** | US pre-market | Medium-High | Ramping up |

**Key insight:** Dead zones (9 AM–1 PM IST) have thin liquidity and poor slippage. Bot should auto-pause.

---

## Fee Budget (Jupiter + Jito, $100 trade)

| Cost Component | Amount | % |
|---|---|---|
| Raydium LP fee (entry + exit) | 0.50% | 0.50% |
| Slippage at $100 size | 1.0–1.8% | 1.2% avg |
| Jito tip (entry + exit) | $0.15 | 0.15% |
| **Total round-trip friction** | — | **~1.85–2.4%** |

**Implication:** Minimum winner to break even = **+2.5% net**. Target winner = **+20% gross (~+18% net after fees)**.

---

## Three Core Strategies

### Strategy A: Fresh Graduation Momentum
**Frequency:** 3–8 trades/day  
**Win Rate:** 45–55%  
**Avg Winner:** +20% net  
**Avg Loser:** –9% net  
**EV per trade:** ~+4.6%

**When it fires:**  
2–15 minutes after Pump.fun token graduates to PumpSwap/Raydium. Jupiter aggregators, DexScreener, and bot discovery create a mechanical +20–60% pump.

**Birdeye scan parameters (poll every 10 sec):**
```
sort_by: graduated_time
sort_type: desc
graduated: true
min_graduated_time: now() - 600 (last 10 min)
max_graduated_time: now() - 120 (not last 2 min)
min_volume_5m_usd: 15000
min_trade_5m_count: 80
min_liquidity: 35000
min_holder: 180
```

**Entry conditions (ALL required):**
1. `volume_5m_change_percent` > +40%
2. `price_change_5m_percent` between –5% and +25%
3. `trade_5m_count` > `trade_30m_count / 6 × 1.5`
4. Helius validation:
   - Top 10 holders < 25% (excl. LP, burn, CEX)
   - No single holder > 6%
   - Mint/freeze authority renounced
   - Dev wallet inactive 10+ min

**Exit ladder:**
- 40% out at +15% net
- 30% out at +22% net (target reached)
- 20% out at +35% net
- 10% with 10% trailing stop

**Safety exits:**
- Hard stop: –10% net
- Time stop: 8 minutes with no movement
- Volume invalidation: `volume_1m_change_percent` < 0 for 60s

---

### Strategy B: Smart Money Follow
**Frequency:** 1–3 trades/day  
**Win Rate:** 55–65%  
**Avg Winner:** +25% net  
**Avg Loser:** –10% net  
**EV per trade:** ~+9.25%

**The thesis:**  
Track 40–60 high-conviction wallets (proven >$50K+ PnL on memes). When 2+ buy the same token within 15 min, you're front-running retail by 30–90 minutes.

**Smart wallet sources:**
- Nansen Smart Money lists
- Dune Analytics (top PnL trackers)
- Cielo Finance wallets
- Custom Helius queries (wallets with >$50K realized PnL on Pump.fun)

**Update frequency:** Monthly (smart money rotates seasonally)

**Trigger (Helius webhooks):**
- Register webhook on each smart wallet for swap transactions
- Alert when 2+ wallets buy same token within 15 min
- Entry gate: token has >$25K liquidity, >100 holders, mint renounced

**Entry:**
- Buy within 30 sec of 2nd confirmation
- 2% max slippage
- 0.0015 SOL Jito tip

**Exit ladder:**
- 50% out at +18% net
- 30% out at +30% net
- 20% trailing: exit when ANY smart wallet on list starts selling

**Safety exits:**
- Hard stop: –12% net (wider — smart money plays are volatile)
- Time stop: if no +10% in 20 min, exit
- Dev activity: instant exit on creator fund move

---

### Strategy C: Consolidation Breakout
**Frequency:** 2–5 trades/day  
**Win Rate:** 50–60%  
**Avg Winner:** +22% net  
**Avg Loser:** –8% net  
**EV per trade:** ~+7.0%

**The thesis:**  
Token pumped 80–200% then consolidated sideways 20+ min = coiling. On volume breakout above consolidation high, often runs +30–80% in 5–15 min (bull flag in meme time).

**Birdeye scan parameters (poll every 30 sec):**
```
sort_by: volume_5m_change_percent
sort_type: desc
min_liquidity: 80000
min_holder: 400
min_price_change_1h_percent: 40
max_price_change_30m_percent: 10
min_volume_30m_usd: 40000
min_volume_5m_change_percent: 100
```

**Entry conditions (breakout trigger):**
1. Token pumped 40–200% in last 1h BUT only moved 0–10% last 30 min
2. Current 5m volume > 2× prior 25-min average
3. Current price > highest price of prior 25-min window
4. Helius: holders still growing (not panic-selling into consolidation)

**Exit ladder:**
- 40% out at +15% net
- 40% out at +22% net (target reached)
- 20% with 8% trailing stop

**Safety exits:**
- Hard stop: –8% net (consolidation breaks that fail collapse fast)
- Time stop: 10 min
- Invalidation: price falls back into consolidation range

---

## Strategy Comparison

| Metric | A: Graduation | B: Smart Money | C: Breakout |
|---|---|---|---|
| Setups per day | 3–8 | 1–3 | 2–5 |
| Win rate | 45–55% | 55–65% | 50–60% |
| Avg winner | +20% | +25% | +22% |
| Avg loser | –9% | –10% | –8% |
| EV per trade | +4.6% | +9.25% | +7.0% |
| Complexity | Medium | High | Medium-High |
| **Recommended first?** | ✅ YES | After A | After A |

---

## Helius Validation Gates (Pre-entry, all required)

Run these checks via Helius before every trade (< 500ms total):

```
✓ Top 10 holders (excl. LP, burn, CEX) < 22% combined
✓ No single holder > 5–6% of supply
✓ Mint authority = null OR burn address (renounced)
✓ Freeze authority = null (renounced)
✓ Dev wallet: no outbound SPL transfers in last 10 min
✓ LP burned or locked (not withdrawable)
```

**Helius methods:**
- `getTokenLargestAccounts` → holder distribution
- `getAsset` (DAS API) → mint/freeze authority
- Enhanced Transactions API → dev wallet activity
- Webhooks → real-time LP removal alerts

---

## Critical Rules (Non-negotiable)

1. **One position at a time.** Multi-position dilutes edge and splits attention.

2. **Never widen stops.** If plan is –8%, it stays –8%. Moving wider = how accounts blow up.

3. **Never hold through catalysts:**
   - Strategy A: Don't hold past 15 min post-graduation
   - Strategy B: Exit immediately when smart money exits
   - Strategy C: Exit if price falls back into consolidation

4. **Track actual performance every 30 trades:**
   - Compute real win rate, avg winner, avg loser
   - If reality differs >5% from target, **pause and diagnose** before continuing

5. **Auto-pause during dead zones:** 9 AM–1 PM IST (thin liquidity, poor slippage)

6. **Position sizing: Stay small.**
   - Month 1: $100 trades
   - When capital reaches $300: scale to $150 trades
   - When capital reaches $1,000: scale to $250 trades
   - Never risk > 10% of bankroll on single trade

---

## Expected Performance

### Month 1 (Realistic calibration)

| Metric | Conservative | Target | Stretch |
|---|---|---|---|
| Starting capital | $100 | $100 | $100 |
| Trades executed | 80 | 120 | 150 |
| Win rate | 50% | 55% | 60% |
| Avg winner | +18% | +20% | +22% |
| Avg loser | –8% | –8% | –8% |
| Net EV per trade | +3.6% | +4.8% | +6.0% |
| Ending capital | $115 | $135 | $160 |

**What month 1 really delivers:** Proof that the strategy works. Data > Dollars.

### Month 2-3 (Scaling phase)

After 100+ logged trades with positive EV, inject capital:
- Add $200 if month 1 hit +30%
- Scale position size to $150–200
- Drop losing strategies, double down on winners

Expected outcome: $250–400 by end of month 3

### Month 4-6 (Consistent $500/mo)

Once bankroll is $1,500–2,000 and strategy is proven:
- Target becomes $300–400/month sustained
- Easy scaling to $500/mo
- Position size: $200–300

---

## Build Roadmap

### Week 1: Paper trading setup
1. Birdeye scanner for 1 strategy (recommend Strategy A)
2. Log all candidates that would have triggered
3. Manually compute hypothetical P&L
4. Validate expected vs. actual win rate

### Week 2: Helius enrichment layer
1. Pre-entry validation gates
2. Holder concentration checks
3. Webhook alerts for dev/LP moves

### Week 3: Execution layer
1. Jupiter API integration
2. Jito tip automation
3. Trade logging (timestamp, entry, exit, reason)

### Week 4: Paper deployment
1. Run live scanner with simulated execution (no real capital)
2. Log every hypothetical trade for 50+ setups
3. Measure real win rate vs. expected
4. If >50% win rate: approve for live trading

### Week 5+: Live deployment on real capital
1. Start with $100 capital, Strategy A only
2. Scale after 100 logged trades with +EV confirmed

---

## Failure Modes (Watch for these)

| Warning Sign | What It Means | What To Do |
|---|---|---|
| Win rate drops to <40% | Strategy degrading or market regime changed | Pause for 24h, review last 20 trades for pattern |
| Avg winner drops to <15% | Exits triggering too early, or slippage worse | Check liquidity filters, tighten volume pulse threshold |
| Consecutive 5+ losses | Random variance or systematic issue | Check if during dead-zone hours; if not, diagnostic review |
| Helius validation gate failing > 20% of triggers | rug/scam filter too loose | Tighten holder%, mint authority checks |
| Avg loser exceeding –12% | Stops not executing, or slippage shock | Check Jupiter slippage setting, ensure Jito tips arriving |

---

## Key Insights

- **Consistent small profits beat lottery wins.** A 50% win rate at +20% / –8% is better than 10% win rate at +200%.
- **Infrastructure is the edge.** Helius webhooks + Jito priority + fast Birdeye polling beat strategy alone.
- **Market regime matters.** In low-volume periods (dead zones), even good setups fail. Auto-pause is non-negotiable.
- **Smart money wins.** Strategy B has highest EV but hardest to build. Worth the effort once A is proven.
- **You're competing with bots.** The only edge is better filtering, faster execution, and discipline on stops. No shortcuts.

---

## Endpoints Reference

### Birdeye (`/defi/v3/token/meme/list`)
- Main discovery scanner for all strategies
- Poll: 10–30 sec depending on strategy
- Rate limit: ~1 req/sec on Standard tier

### Helius (Enhanced APIs)
- `getTokenLargestAccounts` → holder validation
- `getAsset` → authority checks
- Enhanced Transactions → dev wallet tracking
- Webhooks → real-time alerts

### Jupiter API
- `/quote` → slippage estimate
- `/swap` → execution
- Use 2.0–2.5% max slippage for $100 trades

### Jito
- Priority fee API for dynamic tip sizing
- Bundling (optional for safety on thin liquidity)
- Recommend: 0.001–0.002 SOL per transaction

---

## Next Steps

1. **Choose one strategy** (recommend Strategy A for first implementation)
2. **Set up paper trading** (48–72 hours of logged candidates)
3. **Validate win rate** (must exceed 50% to proceed)
4. **Deploy on $100 capital** (if win rate confirmed)
5. **Log every trade** with entry reason, exit reason, actual P&L
6. **Scaling gate:** After 100 trades with +EV, approve capital injection

**Success metric for month 1:** Positive net EV + >50% win rate, not dollar amount.

---

## Disclaimers

- Past performance does not guarantee future results
- Memecoins are highly volatile and speculative
- You can lose your entire $100 (and should budget for that)
- This strategy requires 24/7 monitoring or automation (bot running overnight IST)
- Market conditions change; strategies may require tuning
- Always use hard stops — discipline is your only edge against ruin

---

**Last updated:** April 18, 2026  
**Strategy type:** Multi-timeframe Solana memecoin scalp (20% target)  
**Capital:** $100 starting  
**Timeframe:** 2–15 minutes per trade  
**Expected profitability:** Month 1 +15–30%, Month 4+ $500+/mo on $1.5K+ capital