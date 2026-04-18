# Execution Plan — Jupiter + Jito + Helius Priority Fees

Companion to [draft_index.md](draft_index.md), [draft_backend_plan.md](draft_backend_plan.md), [draft_helius_integration.md](draft_helius_integration.md), [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md).

Status snapshot as of **2026-04-18**:
- `services/helius/priority-fee-service.ts`, `services/execution/quote-builder.ts`, `swap-builder.ts`, and `swap-submitter.ts` are already landed.
- This draft is now mostly a hardening / cutover checklist for those seams, not a greenfield design.
- The older live execution path still exists, so any "production ready" pass must verify which path the engine actually uses before pretending the cutover is done.

**Scope:** how we turn an accepted candidate into a filled position (and later, a closed one) on Solana. Covers slippage sizing, quote construction, route restrictions, priority fees, Jito bundling, and retry ladders. Target latencies and failure modes are service-owned by `QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`, `ExitLoop`, and `LiveExitMutator` (see [draft_backend_plan.md §3](draft_backend_plan.md)).

**Non-goals:** no new router integrations (we stay on Jupiter v6). No LaserStream.

---

## 1. Design principles

1. **One quote per decision.** A stale quote = a different decision. Quotes older than 800 ms are re-fetched before signing.
2. **Slippage is a function of MC tier, not a constant.** Cap per tier; never let dynamic slippage exceed the cap.
3. **Priority fee floors by lane.** Scalps pay more than runners; exits pay more than entries; stop-losses pay more than TPs.
4. **Bundle only when it pays.** Jito tips cost SOL. Bundles are used for entries under pack 4/5 (`sub_10_mc_scalp`, `pump_fun_ape`) and for exit stop-loss legs where landing sequence matters. Otherwise we ride the regular lane.
5. **No silent route loosening.** `onlyDirectRoutes=false` is explicit and logged; `maxAccounts` caps are logged; `dexes` filter is logged per trade.
6. **Fail loud, once.** One retry after quote refresh, then surface to the operator. No exponential retry storms on the live path.

---

## 2. Slippage tier table (MC-bucket driven)

Slippage is the single biggest tax on memecoin entries. The tier below is the **cap** — Jupiter's dynamic slippage is allowed below it. Values are informed by observed pool impact on the 8–12 accepted buckets per day.

| MC bucket | Pack | Base BPS | Max BPS (cap) | Dynamic OK? | Notes |
|---|---|---:|---:|---|---|
| ≤ $10k | `sub_10_mc_scalp`, `pump_fun_ape` | 500 | 1500 | yes | Routes shallow; quote refresh before sign. |
| $10k–$50k | `early_graduation_runner`, `momentum_scalp` | 300 | 800 | yes | Most fills live here. |
| $50k–$250k | `high_conviction_runner`, `smart_money_runner` | 150 | 400 | yes | Multi-pool; prefer `onlyDirectRoutes=false`. |
| $250k–$1M | `bluechip_continuation_runner` | 100 | 250 | yes | Jupiter dynamic usually lands under 200. |
| $1M–$10M | `bluechip_continuation_runner` | 75 | 150 | yes | — |
| ≥ $10M | (rare) | 50 | 100 | yes | — |

**Exit slippage** is one tier higher than entry for stop-losses; one tier lower for TPs (we prefer to miss a TP than chase).

`pricePriorityLevel` on Jupiter quote: `veryHigh` for ≤ $50k, `high` for $50k–$1M, `medium` above. Always pass `restrictIntermediateTokens=true`.

---

## 3. Quote builder parameters (entry)

`QuoteBuilder.build({ mint, side, lamportsIn, packId, mcUsd })` emits the following Jupiter v6 `/quote` request. Every non-default is justified.

| Param | Value | Why |
|---|---|---|
| `inputMint` | SOL mint | — |
| `outputMint` | candidate mint | — |
| `amount` | `lamportsIn` | Lamports; integer. |
| `slippageBps` | `dynamic` with `maxBps = tier.maxBps` | See §2. |
| `onlyDirectRoutes` | `false` | We want multi-hop to split impact. |
| `restrictIntermediateTokens` | `true` | Avoid exotic intermediates that trap lamports. |
| `maxAccounts` | `24` for ≤ $50k MC, `40` above | Keeps tx size under 1232 bytes. |
| `dexes` | include `Raydium, Meteora, Pump.fun, Orca, Phoenix, Lifinity` | Exclude long-tail to reduce failure surface. |
| `asLegacyTransaction` | `false` | Always v0. |
| `swapMode` | `ExactIn` | Entry. |
| `platformFeeBps` | `0` | No referral skim. |
| `dynamicSlippage` | `true` | Paired with `maxBps` cap. |
| `computeUnitPriceMicroLamports` | resolved via `HeliusPriorityFeeService` (see §5) | — |

Exit quotes use `swapMode=ExactIn` with partial-size requests computed from `ExitPlan.tp1SizePct` / `tp2SizePct`. SL exits go `ExactIn` on the full remaining balance.

---

## 4. Entry decision tree

```
candidate accepted by evaluator (pack P, MC bucket M)
    │
    ▼
capital brake OK? ───── no ──▶ reject.reason=CAPITAL_BRAKE
    │ yes
    ▼
concurrent-fill cap OK? ── no ──▶ queue (max 30 s)
    │ yes
    ▼
QuoteBuilder.build() ───── fail ─▶ retry once, then fail(reason=NO_ROUTE)
    │ ok
    ▼
priceImpact > tier.maxImpact ? ── yes ──▶ reject(reason=IMPACT_TOO_HIGH)
    │ no
    ▼
quote.age < 800ms ? ─ no ──▶ refetch
    │ yes
    ▼
sign + submit via Helius Sender (tip lane)
    │
    ├── landed (confirmed) ──▶ Position created; ExitPlan row written
    │
    ├── expired (blockhash) ─▶ retry once with fresh blockhash + re-quoted price
    │
    └── dropped (leader skip) ▶ bump tip by +25%, one retry; else fail(reason=LAND_FAILED)
```

Fill timing (p95 targets):
- Quote round-trip: < 150 ms
- Sign + serialize: < 80 ms
- Sender submit → confirmed: < 2 s for pack 4/5, < 4 s for pack 1/3

---

## 5. Priority fees and Jito tipping

**Implementation status:** `PARTIAL LANDED`. The priority-fee service and submitter exist. Remaining work is real cutover, soak verification, and making the retry / stale-exit behavior prove itself under live and mocked failure paths.

### 5.1 Priority fee via `getPriorityFeeEstimate`

We call Helius `getPriorityFeeEstimate` for every entry and every exit. Response feeds `computeUnitPriceMicroLamports` on the quote request.

Resolution table (per account-set involved in tx):

| Lane | Helius `priorityLevel` | Fallback if Helius down |
|---|---|---|
| Pack 4/5 entry (scalp) | `veryHigh` | `max(50_000, last5minMedian × 2)` |
| Pack 1/2/3 runner entry | `high` | `max(20_000, last5minMedian × 1.5)` |
| TP1 / TP2 exit | `high` | same as entry fallback |
| SL exit | `veryHigh` | double the entry fallback |
| Time-stop exit | `medium` | last5minMedian |

Cache `getPriorityFeeEstimate` response for 2 s (see [draft_helius_integration.md §2.7](draft_helius_integration.md)); always re-call on retry. Never let the microLamports go below 5_000 — we've seen unsigned txs drop under congested slots.

### 5.2 Jito bundle path

Conditions to bundle (all three must hold):

1. Pack ∈ {`sub_10_mc_scalp`, `pump_fun_ape`, stop-loss leg of any pack}
2. `routeAccounts.count ≤ 20` (bundle size ceiling fits three txs)
3. `tipLamports ≥ 10_000` (avoid bundles that would be dropped by validators filtering ≥ 10k sol tips)

Tip sizing (`tipLamports` routed via Jito-accepting Sender endpoint):

| Scenario | Tip | Notes |
|---|---|---|
| SL exit, high-volatility MC (< $50k) | `max(0.002 SOL, priceMove_bps × 10)` | We pay to land the stop; slippage on miss >> tip. |
| Pack 4 entry on fresh grad | 0.001 SOL | Sits above typical median tip. |
| Pack 5 entry on KOTH | 0.0015 SOL | Slight premium. |
| Retry after dropped bundle | previous tip × 1.5 | Single retry only. |

Bundle composition: `(compute-budget ix, priority-fee ix, swap ix, tip ix)` — tip ix is last, directed to a randomized tip account from the Jito tip accounts list. Never bundle more than one swap.

Current landed implementation uses the Helius Sender RPC endpoint for the regular lane and a direct Jito block-engine submission path for bundles. Keep that distinction straight; pretending everything routes through Sender is how people debug the wrong thing for two hours.

---

## 6. Exit decision tree

```
position P open with ExitPlan E
    │
    ▼
poll mark price (ExitLoop, cadence tier-dependent)
    │
    ▼
SL tripped? ─────────────────────────────── yes ─▶ exit(reason=STOP_LOSS, lane=Jito, tip=high, slippage=tier+1)
    │ no
    ▼
time-stop reached? ──────────────────────── yes ─▶ exit(reason=TIME_STOP, lane=regular, tip=med, slippage=tier)
    │ no
    ▼
TP2 tripped? ────────────────────────────── yes ─▶ partial exit(tp2SizePct, regular lane); update ExitPlan.residualSize
    │ no
    ▼
TP1 tripped? ────────────────────────────── yes ─▶ partial exit(tp1SizePct, regular lane); update ExitPlan.residualSize
    │ no
    ▼
AdaptiveThresholdLog mutator fired?
    ├── trail-tighten ──▶ update ExitPlan.trailBps; log
    ├── grad-age-taper ▶ update ExitPlan.timeStopSec; log
    └── sessionMult    ▶ noop on live position (session mult only affects new entries)
    │
    ▼
continue loop; escalate to operator if ExitLoop misses a scheduled tick by > 10 s
```

### 6.1 Exit lane rules

| Exit reason | Lane | Slippage | Priority fee |
|---|---|---|---|
| `STOP_LOSS` | Jito bundle | tier + 1 | `veryHigh` |
| `TP1` | regular | tier – 1 | `high` |
| `TP2` | regular | tier | `high` |
| `TIME_STOP` | regular | tier | `medium` |
| `MANUAL_FORCE_EXIT` | Jito bundle | tier + 1 | `veryHigh` |
| `ADAPTIVE_TRAIL` | regular | tier | `high` |
| `LP_REMOVAL_WEBHOOK` | Jito bundle | tier + 2 | `veryHigh` + tip × 1.5 |

Never retry an exit more than once on the live path. If the second attempt fails, flip the position to `STALE_EXIT` state and page the operator. Manual exit overrides every automated attempt.

---

## 7. Mapping — recommendation → surface

Each row is a concrete code change and the target file. Phase 6 slices are ordered to minimize coupling.

| # | Recommendation | Owner | Target file / seam |
|---|---|---|---|
| 1 | MC-tier slippage cap table as config, not constants | `QuoteBuilder` | `trading_bot/backend/src/services/execution/quote-builder.ts` (new) |
| 2 | Tier resolver uses `Candidate.mcUsd` (promoted column) | `QuoteBuilder` | same |
| 3 | `restrictIntermediateTokens=true` default | `QuoteBuilder` | same |
| 4 | `dexes` allowlist in pack JSON | `StrategyPack.recipe` | `StrategyPack.recipe.routing.dexes` |
| 5 | `maxAccounts` per MC bucket | `QuoteBuilder` | same |
| 6 | Quote TTL 800 ms before sign | `SwapBuilder` | `trading_bot/backend/src/services/execution/swap-builder.ts` (new) |
| 7 | `getPriorityFeeEstimate` call + 2 s cache | `HeliusPriorityFeeService` | `trading_bot/backend/src/services/helius/priority-fee-service.ts` |
| 8 | Fallback microLamports resolver | same | same |
| 9 | Lane enum: `REGULAR \| JITO_BUNDLE` | `SwapSubmitter` | `trading_bot/backend/src/services/execution/swap-submitter.ts` |
| 10 | Jito bundle composition (CU + fee + swap + tip) | same | same |
| 11 | Tip-account rotation (randomized) | same | same |
| 12 | One-retry ladder per lane | same | same |
| 13 | SL exit always via Jito lane | `ExitLoop` | `trading_bot/backend/src/engine/exit-engine.ts` |
| 14 | TP1/TP2 via regular lane | `ExitLoop` | same |
| 15 | LP-removal webhook triggers Jito SL | `HeliusWatchService` → `ExitLoop` | `trading_bot/backend/src/services/helius/watch-service.ts` |
| 16 | `MANUAL_FORCE_EXIT` goes Jito | `ExitLoop` | same |
| 17 | Fee/slippage/cu/tip per-tx attribution | `Fill` promoted columns | schema.prisma columns |
| 18 | Failure code enum: `NO_ROUTE, IMPACT_TOO_HIGH, LAND_FAILED, QUOTE_STALE, CAPITAL_BRAKE` | `SwapSubmitter` | same |
| 19 | Stale-exit flip after 2 failed exit attempts | `ExitLoop` | same |
| 20 | Operator page on stale-exit (toast + banner) | `events` stream | `trading_bot/dashboard/components/shell/*` |
| 21 | Unit test: slippage cap is enforced against dynamic | tests | `trading_bot/backend/tests/execution/quote-builder.test.ts` |
| 22 | Unit test: SL exits always go Jito lane | tests | `trading_bot/backend/tests/execution/exit-loop.test.ts` |
| 23 | Integration test: `getPriorityFeeEstimate` failure path uses fallback | tests | `trading_bot/backend/tests/helius/priority-fee.test.ts` |
| 24 | Grafana panel: "exit exec latency p95 by reason" | view + dashboard | `v_recent_fill_activity` + Grafana Exit RCA |
| 25 | Grafana panel: "bundle vs. regular land rate" | view | new `v_submit_lane_daily` |

---

## 8. Failure taxonomy and retry policy

| Failure | Retry? | Max retries | Action |
|---|---|---:|---|
| Jupiter `/quote` HTTP 5xx | yes | 1 | 150 ms backoff, then fail |
| Jupiter 400 (no route) | no | 0 | fail(`NO_ROUTE`) |
| Quote impact > cap | no | 0 | reject(`IMPACT_TOO_HIGH`) |
| Signer timeout | no | 0 | fail(`SIGNER_TIMEOUT`), page operator |
| Sender submit 429 | yes | 2 | exponential 200 → 400 ms |
| Sender submit 5xx | yes | 1 | bump priority fee × 1.25 |
| Blockhash expired | yes | 1 | refresh blockhash + re-quote |
| Jito bundle dropped | yes | 1 | +25 % tip |
| Sim revert (slippage) | yes | 1 | refetch quote (assume tape moved) |
| Sim revert (freeze / auth) | no | 0 | hard-reject; blacklist mint |
| Exit loop misses tick > 10 s | no | 0 | flip to stale-exit, page |

---

## 9. Observability

Every live trade emits one `FillAttempt` row with:

- `packId`, `packVersion`, `sessionId`, `configVersion`
- `mint`, `mcUsdAtQuote`, `tierBucket`, `slippageCapBps`, `slippageUsedBps`, `priceImpactBps`
- `cuPriceMicroLamports`, `tipLamports`, `lane`, `bundleLanded`
- `quoteLatencyMs`, `signLatencyMs`, `submitLatencyMs`, `confirmLatencyMs`
- `retries`, `failureCode?`

Grafana panels off these columns (see [draft_grafana_plan.md](draft_grafana_plan.md)):
- Lane land rate (Jito vs regular)
- Priority-fee microLamports over time by pack
- Slippage used vs cap by bucket
- Tip ROI (avg PnL on Jito-landed vs regular)
- Failure-code histogram per pack

---

## 10. Acceptance criteria

- `QuoteBuilder` enforces the cap table from §2; test proves dynamic slippage cannot exceed the cap.
- `SwapBuilder` re-quotes when the cached quote is ≥ 800 ms old at sign time.
- `HeliusPriorityFeeService` serves both live and fallback paths; test simulates Helius 5xx and confirms fallback lamports.
- `SwapSubmitter` supports both lanes and records `lane` + `bundleLanded` on every `FillAttempt`.
- SL exits always take the Jito lane (test).
- Operator receives a visible alert within 15 s of stale-exit.
- Grafana panel for "bundle vs. regular land rate" renders on first load.
- No retry loop exceeds the §8 max-retries budget in a 60 s window (alert rule covers this).

---

## 11. Open questions

1. Do we want a kill-switch that forces all exits to Jito during a paused session? Leaning yes; cheap insurance.
2. For pack 6 (`smart_money_runner`), should entry always ride Jito because signal latency is the whole edge? Revisit after 7-day ingest sample.
3. Should `MANUAL_FORCE_EXIT` bypass the capital-free check? Proposed: yes — manual intent overrides brakes.
4. Tip-ROI threshold for disabling bundle lane on a per-pack basis if observed ROI < break-even for 3 days.

---

## 12. Sources

- [Jupiter API — Quote & Swap](https://station.jup.ag/docs/apis/swap-api)
- [Jupiter — Dynamic Slippage](https://station.jup.ag/docs/apis/swap-api#dynamic-slippage)
- [Helius — Priority Fee Estimate](https://www.helius.dev/docs/methods/priority-fee)
- [Helius — Sender](https://www.helius.dev/docs/sender)
- [Jito — Block Engine / Bundles](https://docs.jito.wtf/lowlatencytxnsend/)
- [Jito — Tip Accounts](https://docs.jito.wtf/lowlatencytxnsend/#tip-accounts)
- [Solana Cookbook — Compute Budget](https://solanacookbook.com/references/basic-transactions.html#how-to-add-a-memo-to-a-transaction)
