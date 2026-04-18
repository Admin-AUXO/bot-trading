# Credit Tracking — Birdeye + Helius Budget Accounting

Companion to [draft_index.md](draft_index.md), [draft_helius_integration.md](draft_helius_integration.md), [draft_database_plan.md](draft_database_plan.md), [draft_grafana_plan.md](draft_grafana_plan.md).

**Scope:** account for every external API credit consumed, estimate per-session burn before starting, and alert before a day/month budget breach. Today we have `ProviderBudgetService` gating Birdeye; this doc generalizes it to all paid providers (Birdeye, Helius) and wires reporting + alerts.

**Non-goals:** no per-request billing integration with providers (their dashboards remain source of truth for invoicing). No automated throttling that silences a lane — we prefer operator-visible back-pressure.

---

## 1. Design principles

1. **One slot per call.** Every paid provider request goes through `ProviderBudgetService.requestSlot(provider, purpose)`; call without slot = bug, alert.
2. **Tag by purpose.** Purpose codes map to pipeline stages (discovery / evaluate / enrich / exit-monitor / webhook). Cost attribution depends on purpose.
3. **Record with context.** Every slot write carries `sessionId`, `packId`, `configVersion`. Post-hoc we can answer "what did session S cost?"
4. **Forecast, don't just track.** Nightly forecast vs. monthly plan, not just a ledger of past spend.
5. **Alert on slope, not just level.** A sudden 3× burn rate should page before the absolute budget flips red.

---

## 2. Credit cost reference (authoritative values)

Plan levels we're on:
- **Birdeye:** Starter (paid). See [Birdeye pricing](https://docs.birdeye.so/docs/subscription-plans).
- **Helius:** Developer ($49/mo, 10M credits/mo, 50 rps baseline). See [Helius plans](https://www.helius.dev/pricing).

### 2.1 Birdeye (credits per call; Starter plan)

| Endpoint | Credits | Notes |
|---|---:|---|
| `defi/price` | 5 | per mint |
| `defi/multi_price` (≤ 100 mints) | 5 + 1/mint | batched |
| `defi/token_overview` | 30 | heavy |
| `defi/v3/token/market-data` | 15 | preferred over overview |
| `defi/v3/token/holder` | 30 | paginated |
| `defi/txs/token` | 15 | per page |
| `defi/history_price` | 50 | 1 chart |
| `smart-money/v1/token-list` | 50 | |
| `defi/v3/token/trade-data/single` | 20 | |
| `defi/v2/tokens/top_traders` | 30 | |

Attribution: every Birdeye response body carries `x-credits-used` header; persist it — don't estimate.

### 2.2 Helius (credits per call; Developer plan)

| Endpoint | Credits | Notes |
|---|---:|---|
| `getBalance` | 1 | |
| `getAccountInfo` | 1 | |
| `getTokenAccounts` | 10/page | |
| `getTokenBalances` | 10 | |
| `getAsset` | 10 | single or batched |
| `searchAssets` | 10 | |
| `getAssetsByOwner` | 10 | |
| `getSignaturesForAsset` | 10 | |
| `getTokenHolders` | ~20 | plus paging cost |
| `parseTransactions` | 100 | |
| `getWalletHistory` | 100 | |
| `getWalletTransfers` | 100 | |
| `getWalletBalances` | 100 | |
| `getWalletFundedBy` | 100 | |
| `getTransactionHistory` | ~110 | |
| `getPriorityFeeEstimate` | 1 | cheap — call often |
| Enhanced websocket subscription (tx / account) | 0/call, 100-sub cap per conn | does count against rate limit |
| Enhanced webhook event | 0 | delivery is free; setup call is free |

(Values mirror the MCP routing card; re-verify against the Helius billing page per release.)

---

## 3. Schema — `ProviderCreditLog`

New Prisma model (see [draft_database_plan.md Phase 6+ additions](draft_database_plan.md#phase-6-additions)).

```prisma
model ProviderCreditLog {
  id            BigInt   @id @default(autoincrement())
  provider      ProviderSource  // BIRDEYE | HELIUS | TRENCH | BUBBLEMAPS | ...
  endpoint      String           // "defi/v3/token/holder", "getSignaturesForAsset", ...
  purpose       ProviderPurpose  // DISCOVERY | EVALUATE | ENRICH | EXIT | WEBHOOK | PRIORITY_FEE | MANUAL
  creditsUsed   Int
  sessionId     String?
  packId        String?
  configVersion Int?
  mint          String?
  candidateId   String?
  positionId    String?
  httpStatus    Int
  latencyMs     Int
  errorCode     String?
  recordedAt    DateTime @default(now())

  @@index([provider, recordedAt])
  @@index([purpose, recordedAt])
  @@index([sessionId])
  @@index([packId, recordedAt])
}

enum ProviderSource { BIRDEYE HELIUS TRENCH BUBBLEMAPS SOLSNIFFER JUPITER GECKOTERMINAL CIELO PUMPFUN RUGCHECK }
enum ProviderPurpose { DISCOVERY EVALUATE ENRICH EXIT WEBHOOK PRIORITY_FEE SMART_MONEY MANUAL ADMIN }
```

Rows write-batched (flush every 500 ms or 100 rows, whichever first) so the hot path never blocks on a DB insert.

---

## 4. Views

Added to [create_views.sql](trading_bot/backend/prisma/views/create_views.sql):

```sql
-- Daily totals per provider
create or replace view v_api_provider_daily as
select
  date_trunc('day', "recordedAt") as day,
  provider,
  sum("creditsUsed") as credits,
  count(*) as calls,
  sum("creditsUsed") filter (where "httpStatus" >= 400) as failed_credits,
  count(*) filter (where "httpStatus" >= 400) as failed_calls
from "ProviderCreditLog"
group by 1, 2;

-- Cost attribution by purpose
create or replace view v_api_purpose_daily as
select
  date_trunc('day', "recordedAt") as day,
  provider, purpose,
  sum("creditsUsed") as credits,
  count(*) as calls
from "ProviderCreditLog"
group by 1, 2, 3;

-- Per-endpoint efficiency
create or replace view v_api_endpoint_efficiency as
select
  provider, endpoint,
  count(*) as calls_7d,
  sum("creditsUsed") as credits_7d,
  avg("latencyMs")::int as avg_latency_ms,
  sum(case when "httpStatus" >= 400 then 1 else 0 end)::float / nullif(count(*),0) as fail_rate
from "ProviderCreditLog"
where "recordedAt" >= now() - interval '7 days'
group by 1, 2;

-- Cost per pack / session (joins to TradingSession)
create or replace view v_api_session_cost as
select
  s.id as session_id,
  s."packId",
  s."packVersion",
  s.mode,
  s."startedAt",
  s."stoppedAt",
  coalesce(sum(l."creditsUsed") filter (where l.provider = 'BIRDEYE'), 0) as birdeye_credits,
  coalesce(sum(l."creditsUsed") filter (where l.provider = 'HELIUS'), 0) as helius_credits,
  coalesce(sum(l."creditsUsed"), 0) as total_credits
from "TradingSession" s
left join "ProviderCreditLog" l on l."sessionId" = s.id
group by s.id;

-- Hourly slope for alerts
create or replace view v_api_provider_hourly as
select
  date_trunc('hour', "recordedAt") as hour,
  provider,
  sum("creditsUsed") as credits
from "ProviderCreditLog"
where "recordedAt" >= now() - interval '48 hours'
group by 1, 2;
```

---

## 5. Session budget estimator

A session is **not allowed to start** without an up-front estimate. `SessionStartService` calls `CreditForecastService.estimate(packId, mode, durationH)` and blocks if the forecast exceeds remaining daily budget.

Estimator formula (one tick of the discovery → exit pipeline):

```
per_hour_credits =
    discovery.candidates_per_hour     * cost(DISCOVERY_CALLS_PER_CANDIDATE)
  + evaluator.accepted_per_hour       * cost(EVALUATE_CALLS_PER_ACCEPT)
  + enrichment.enrichments_per_hour   * cost(ENRICH_CALLS_PER_MINT)
  + exit.open_positions_avg           * cost(EXIT_CALLS_PER_TICK) * ticks_per_hour
  + webhook.expected_events_per_hour  * cost(WEBHOOK_CALLS_PER_EVENT)
```

Seed constants (initial — revise after one week of live data):

| Term | Birdeye credits | Helius credits |
|---|---:|---:|
| DISCOVERY_CALLS_PER_CANDIDATE | 8 (v3 list + price) | 2 (2 accountInfo) |
| EVALUATE_CALLS_PER_ACCEPT | 60 (overview + holder + smart-money) | 20 (1 getSignaturesForAsset + 1 getTokenHolders) |
| ENRICH_CALLS_PER_MINT | 0 (enrichment is non-Birdeye providers) | 30 (creator lineage partial) |
| EXIT_CALLS_PER_TICK (per position) | 10 (price + overview cached) | 1 (priority fee cached) |
| WEBHOOK_CALLS_PER_EVENT | 0 | 10 (parseTransactions on hit) |

Per-pack multipliers (pack `recipe.enrichment.enabled = { trench, bubblemaps, ...}`):

| Pack | Typical multiplier |
|---|---:|
| `sub_10_mc_scalp` | × 1.0 (fast churn but low enrichment) |
| `pump_fun_ape` | × 1.2 |
| `early_graduation_runner` | × 1.4 (heavy enrichment) |
| `smart_money_runner` | × 1.7 (smart-money list + creator lineage) |
| others | × 1.0 |

Estimator output format (shown to operator in the start-session dialog):

```
Forecast for 2 h of  early_graduation_runner @ v3 (DRY):
  Birdeye:   21 000 credits   (budget remaining 146 000 / day)
  Helius:     8 400 credits   (budget remaining 280 000 / day)
Start? [y/N]
```

If forecast > 40 % of remaining daily budget: hard warning.
If forecast > 70 % of remaining daily budget: requires `--allow-overbudget` flag (operator confirm).

---

## 6. Alert thresholds

Alert rules provisioned in Grafana (see [draft_grafana_plan.md §2.6](draft_grafana_plan.md)). Provider refers to Birdeye or Helius.

| Alert | Condition | Severity | Action |
|---|---|---|---|
| `daily_burn_50pct` | daily credits / daily_budget > 0.5 at local 12:00 | info | banner toast in dashboard |
| `daily_burn_80pct` | > 0.8 at any time | warning | Slack / webhook ping |
| `daily_burn_100pct` | > 1.0 | critical | block new sessions; in-flight lanes continue |
| `hourly_slope_3x` | last-hour credits > 3 × trailing-24h hourly median (provider) | warning | banner + slope panel highlight |
| `monthly_forecast_overbudget` | projected MTD credits > plan × 1.05 | warning | nightly cron digest |
| `purpose_anomaly` | `ENRICH` share > 40 % of the hour's credits and enrich pack unchanged | info | dashboard-only |
| `zero_throughput_spend` | credits spent > 5 % daily budget while `accepted_candidates = 0` for > 2 h | warning | operator paged — likely filter bug |
| `failed_call_share` | 15 m `failed_calls / calls > 0.2` | warning | per-provider card turns red |

"Block new sessions" is enforced by `SessionStartService`; a kill-switch env var `ALLOW_START_ON_BUDGET_CRITICAL=true` exists for emergencies.

---

## 7. Grafana panel spec — Credit Burn dashboard

One dashboard (also listed in [draft_grafana_plan.md §1](draft_grafana_plan.md)). Panels fit a 12-column Grafana grid.

```
┌─────────────────────────────────────────────────────────────────┐
│  [Stat] MTD Birdeye credits (vs plan)     │ [Stat] MTD Helius  │
│  [Stat] Today's credits (vs daily budget) │ [Stat] Today Helius│
├─────────────────────────────────────────────────────────────────┤
│ [Timeseries] Hourly credits by provider (last 48 h)            │
├────────────────────────────────┬────────────────────────────────┤
│ [Bar] Today's credits by purpose│ [Bar] Today by pack          │
├────────────────────────────────┴────────────────────────────────┤
│ [Table] Top 10 endpoints by 7 d credits (calls / credits / avg │
│  latency / fail rate)                                           │
├─────────────────────────────────────────────────────────────────┤
│ [Stat] Credits per accepted candidate (today)                  │
│ [Stat] Credits per filled position (today)                     │
├─────────────────────────────────────────────────────────────────┤
│ [Timeseries] Monthly forecast line vs plan ceiling             │
├─────────────────────────────────────────────────────────────────┤
│ [Alert list] Active credit-burn alerts                         │
└─────────────────────────────────────────────────────────────────┘
```

Panel SQL sources:
- MTD stats → `v_api_provider_daily` aggregated over the current month.
- Today hourly → `v_api_provider_hourly`.
- By purpose → `v_api_purpose_daily`.
- By pack → `v_api_session_cost` joined to `TradingSession`.
- Endpoints → `v_api_endpoint_efficiency`.
- Cost per accepted/position → denominator from `v_candidate_funnel_daily_source` and `v_position_cohort_daily`.
- Forecast → linear projection of hourly credits through month end; plan line is static.

Filters (required on every panel):
- `$provider` (default: all)
- `$pack` (default: all)
- `$configVersion` (default: all)
- `$purpose` (default: all)

---

## 8. Service wiring

```
Hot-path service                      ProviderBudgetService
     │                                         │
     │ requestSlot(p, purpose, ctx)            │
     ├────────────────────────────────────────▶│
     │◀── slot { id } ────────────────────────│
     │                                         │
     │ (HTTP call)                             │
     │                                         │
     │ releaseSlot(id, {creditsUsed,           │
     │   httpStatus, latencyMs, errorCode})    │
     ├────────────────────────────────────────▶│
                                               │
                                               │ batched flush → ProviderCreditLog
                                               ▼
                                        Postgres rows
```

Everything Helius/Birdeye-facing today already goes through some slot code; the phase 6 work:

1. Make `ProviderBudgetService` generic — enum-keyed by provider, not Birdeye-specific.
2. Extend `releaseSlot` to accept a purpose + full context (sessionId/packId/etc.).
3. Intercept Birdeye `x-credits-used` header; record actual.
4. For Helius, apply the lookup table in §2.2 at slot release time (Helius doesn't echo credit cost on the wire — we estimate from endpoint).
5. Wrap every webhook handler in a single slot write so even free deliveries are visible ("call count" panel).
6. Spawn `CreditForecastService` consuming `v_api_provider_daily` + seed constants.

---

## 9. Acceptance criteria

- No paid-provider call path exists that does not go through `ProviderBudgetService.requestSlot(...)`. Test: grep the backend for Birdeye/Helius URLs and ensure each call site is wrapped.
- `ProviderCreditLog` row written (eventually) for every call — integration test spins one discovery tick, counts rows.
- `v_api_provider_daily` and `v_api_session_cost` query < 300 ms on 7-day data.
- Starting a session shows the forecast dialog with both provider columns.
- Hitting 80 % daily triggers a Slack warning; 100 % blocks new sessions.
- Grafana Credit Burn dashboard renders with all 10 panels green on first load.

---

## 10. Open questions

1. Do we track Jupiter / GeckoTerminal / Trench etc. in the same table even though they're free? Proposed: yes — call volume is still a rate-limit risk, and the analytics are cheap.
2. Should smart-money Cielo calls be attributed to `SMART_MONEY` purpose vs `ENRICH`? Proposed: new enum value `SMART_MONEY` (done in §3).
3. Do we expose per-session cost on `/workbench/sessions`? Yes — single stat "API credits spent" on the session row.
4. Monthly plan ceilings sourced from env vars (`BIRDEYE_MONTHLY_BUDGET`, `HELIUS_MONTHLY_BUDGET`)? Yes — avoids a settings-UI detour.

---

## 11. Sources

- [Birdeye API pricing / credits](https://docs.birdeye.so/docs/subscription-plans)
- [Helius pricing + credit cost table](https://www.helius.dev/pricing)
- [Helius billing / credits docs](https://www.helius.dev/docs/billing/credits)
- [Jupiter API — free](https://station.jup.ag/docs/apis/swap-api)
- [GeckoTerminal — 30 req/min free](https://apiguide.geckoterminal.com/)
