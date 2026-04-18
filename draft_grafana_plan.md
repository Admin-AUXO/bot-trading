# Grafana Plan — Dashboards v2 + Auto-Generator Extension

Companion to [draft_index.md](draft_index.md), [draft_database_plan.md](draft_database_plan.md), [draft_credit_tracking.md](draft_credit_tracking.md).

Status snapshot as of **2026-04-18**:
- The 7 dashboard builders and `scripts/build-dashboards.mjs` wiring already landed in `trading_bot/grafana/src/dashboard-generator/`.
- Generator output builds cleanly.
- Remaining work is operational hardening: alert provisioning, data validation against live traffic, and Grafana container / compose hardening.

**Scope:** keep the 9 existing dashboards, backfill the missing views, add **7 new dashboards** via the generator, harden docker-compose. **Never hand-author JSON.**

Confirmed path: **extend the auto-generator in [dashboard-generator/index.mjs](trading_bot/grafana/src/dashboard-generator/index.mjs)** and its theme modules.

---

## 1. Seven new dashboards

**Implementation status:** `LANDED IN GENERATOR; HARDENING REMAINS`.

| # | Dashboard | Primary job | Key panels | Backing views |
|---|---|---|---|---|
| 1 | **Session Overview** | Single pane for an active session | Current pack + version, mode pill, session age, realized PnL, capital free, open-pos count, last-fill age, pause reason, webhook cap %, lane RAG, intervention band | `v_runtime_live_status`, `v_runtime_lane_health`, `v_open_position_monitor`, `v_api_session_cost` |
| 2 | **Pack Leaderboard** | Decide which pack to promote / retire | WR, avg winner, avg loser, EV, hold-time, acceptance rate per pack; head-to-head A vs B; per-pack grade trend | `v_strategy_pack_performance_daily`, `v_kpi_by_config_window`, `v_strategy_pack_exit_profile_mix` |
| 3 | **Candidate Funnel** | Diagnose where candidates die | Waterfall discovered → queued → evaluated → accepted → filled → exited; rejection reason pie; hour-of-day; source breakdown; filter-firing heat strip | `v_candidate_funnel_daily_source`, `v_candidate_decision_facts`, `v_candidate_latest_filter_state` |
| 4 | **Exit Reason RCA** | Root-cause bad exits | Exit-reason histogram; realized PnL by reason; avg hold by exit profile; exit exec latency p95 by reason; bundle-vs-regular land rate on SL; stale-exit timeline | `v_position_exit_reason_daily`, `v_recent_fill_activity`, `v_submit_lane_daily`, `v_exit_plan_mutation_daily` |
| 5 | **Credit Burn** | Keep paid providers under budget | MTD vs plan (Birdeye + Helius); today vs daily budget; hourly credits by provider; credits by purpose; credits by pack; top-10 endpoints; credits per accepted candidate; credits per position; monthly forecast line; active alerts | `v_api_provider_daily`, `v_api_provider_hourly`, `v_api_purpose_daily`, `v_api_session_cost`, `v_api_endpoint_efficiency` |
| 6 | **Adaptive Telemetry** | See the adaptive engine in motion | Mutator firing rate by axis + reason; threshold drift over time; mutator → outcome correlation; per-mutator helped/hurt split; counterfactual delta distribution | `v_adaptive_threshold_activity`, `v_mutator_outcome_daily`, joined with `v_position_pnl_daily` |
| 7 | **Enrichment Quality** | Is the free/paid provider fabric healthy? | Per-source success rate; p95 latency; cache hit rate; stale share; composite-score coverage; provider-degraded timeline annotations | `v_enrichment_freshness`, `v_enrichment_quality_daily`, `v_api_endpoint_efficiency` filtered to enrichment providers |

Every panel supports **pack filter** (`$pack` = `strategyPackId`) and **config-epoch filter** (`$config_version`). Additional filters per dashboard listed in §2.4. All filters multi-select except decision-surface single-selects.

---

## 2. Auto-generator extension — how to add a new dashboard

The generator lives at [trading_bot/grafana/src/dashboard-generator/](trading_bot/grafana/src/dashboard-generator/). Shared helpers in `core.mjs`; definitions by theme in `scorecards.mjs`, `operations.mjs`, `analytics.mjs`, `research.mjs`. Entrypoint [scripts/build-dashboards.mjs](trading_bot/grafana/scripts/build-dashboards.mjs).

### 2.1 Theme assignment

| Dashboard | Theme module | Notes |
|---|---|---|
| Session Overview | `operations.mjs` | Replaces portions of existing live dashboard |
| Pack Leaderboard | `analytics.mjs` | Extend existing module |
| Candidate Funnel | `analytics.mjs` | — |
| Exit Reason RCA | `analytics.mjs` | — |
| Credit Burn | new `credits.mjs` | Dedicated theme (scales with providers) |
| Adaptive Telemetry | new `adaptive.mjs` | Dedicated theme |
| Enrichment Quality | new `enrichment.mjs` | Dedicated theme |

Each new module exports a single builder: `buildCreditBurnDashboard(ctx)` etc. Each builder returns `{ uid, title, panels, variables, annotations }`.

### 2.2 Wire in `build-dashboards.mjs`

**Implementation status:** `LANDED`.

Append each new builder to the dashboard list; pass the shared `ctx` (datasources, folder uids, config-version variable). Never push a handwritten dashboard JSON through.

### 2.3 Use shared helpers from `core.mjs`

- `panelTimeseries({ title, query, unit, legend })` — trend panels.
- `panelStat({ title, query, unit, thresholds })` — scorecards.
- `panelBar({ title, query, xField, yField, stack })` — by-purpose, by-pack.
- `panelTable({ title, query, columns, links })` — leaderboards.
- `panelHeatmap({ title, query, xField, yField, valueField })` — filter-firing heat strip.
- `variableQuery({ name, query, multi, includeAll })` — filters.
- `dashboardLink({ targetUid, title, keepTime=true, keepVariables=true })` — cross-dashboard pivots.
- `annotationsForConfigChanges(ctx)` — overlay `v_config_change_log` on every panel (reuse).
- `annotationsForProviderIncidents(ctx)` — **new**, reads from `ProviderCreditLog` when a source degraded for > 5 m.

### 2.4 Required filters per dashboard

Every dashboard must include:

```
$pack          = "select id, name from \"StrategyPack\" where status <> 'RETIRED'"  (multi, includeAll)
$configVer     = "select distinct config_version from \"ConfigSnapshot\" ..."        (multi, includeAll)
```

Additional per-dashboard filters:

| Dashboard | Extra filters |
|---|---|
| Session Overview | `$sessionId` single-select (defaults to current) |
| Pack Leaderboard | `$grade` multi |
| Candidate Funnel | `$source` multi (discovery source) |
| Exit Reason RCA | `$exitReason` multi, `$lane` multi |
| Credit Burn | `$provider` multi, `$purpose` multi |
| Adaptive Telemetry | `$axis` multi, `$mutatorCode` multi |
| Enrichment Quality | `$enrichmentSource` multi |

All panel SQL must reference `WHERE $__timeFilter(bucket) AND "strategyPackId" IN ($pack) AND config_version IN ($configVer)` (plus any dashboard-specific filter).

### 2.5 Regenerate + validate

```
cd trading_bot/grafana && node scripts/build-dashboards.mjs
node --check scripts/build-dashboards.mjs
```

Emitted JSON goes to `trading_bot/grafana/dashboards/**`. **Never hand-edit emitted JSON** — the generator rewrites it.

### 2.6 Alerting rules

**Implementation status:** `PENDING`.

Alerts on symptoms (not on "metric went up"). Pending periods required. Annotations: `summary`, `description`, `runbook_url`, `__dashboardUid__`, `__panelId__`. Provision in repo; no browser-only rules.

Phase 6 alert set:

| Rule | Condition | Severity |
|---|---|---|
| `session_paused_5m` | `sessionStatus = PAUSED` for > 5 m | warning |
| `exit_latency_p95_high` | `v_recent_fill_activity` exit p95 > 3 s for 15 m | warning |
| `sl_bundle_fail_rate` | `v_submit_lane_daily` SL land rate < 0.9 for 30 m | critical |
| `credit_burn_80pct` | today credits / daily budget > 0.8 | warning |
| `credit_burn_100pct` | > 1.0 | critical |
| `credit_slope_3x` | 1 h slope > 3× trailing-24h median | warning |
| `enrichment_source_degraded` | source fail_rate > 0.3 over 15 m | warning |
| `mutator_hurts_repeatedly` | `MutatorOutcome` `HURT` share > 0.6 per mutatorCode over 24 h | warning |
| `webhook_cap_90pct` | `v_runtime_lane_health.webhookUsage > 0.9` | warning |

---

## 3. Docker-compose hardening

**Implementation status:** `PENDING`.

Ship alongside Grafana v2 (phase 6):

- `cpus: 0.25`, `memory: 512M` resource limits on the Grafana container.
- Configurable bind address (not `0.0.0.0` by default).
- Rotate admin password out of `compose.env`; source from a gitignored secret file or env-provider.
- Promtail/Loki unchanged.

## 4. Guardrails

- No dashboard ships without its backing view committed to [create_views.sql](trading_bot/backend/prisma/views/create_views.sql) and green on `psql \df`.
- No transform-hides-missing-data — if the view isn't there, the panel fails loudly.
- Live-capital-sensitive dashboards (Session Overview) must show `pack.version` + `config_version` in the header so nothing is ambiguous during an intervention.
- Every new panel names its view in the panel description. Unlinked panels fail lint.
- Credit Burn dashboard header shows plan tier for both providers (so the numbers are interpretable).

## 5. Acceptance criteria

- 9 existing dashboards load without view errors after phase 1 backfill.
- 7 new dashboards render with required filters wired.
- `credits.mjs`, `adaptive.mjs`, `enrichment.mjs` exist and each emits one valid Grafana dashboard JSON.
- `docker-compose.yml` diffs show resource limits + bind + secret changes on the Grafana v2 commit.
- Alert rules provisioned, tested via `alerting/test`, and routed to the ops channel.
- Dashboards pass lint: every panel links to its backing view; no undocumented SQL.

## 6. Phasing within phase 6

1. **6a — Backfill + Session Overview:** land all missing views, ship Session Overview as the first new dashboard (smallest surface, immediate utility).
2. **6b — Credit Burn:** paired with `ProviderCreditLog` landing; alerts go live with it.
3. **6c — Pack Leaderboard + Candidate Funnel:** depend on `v_strategy_pack_*` + `v_candidate_funnel_daily_source`.
4. **6d — Exit Reason RCA:** depends on `FillAttempt` promotion.
5. **6e — Adaptive Telemetry:** depends on `MutatorOutcome` write-back from exit engine.
6. **6f — Enrichment Quality:** depends on `v_enrichment_quality_daily`.
7. **6g — Docker/compose hardening + alert provisioning:** final pass.

Each sub-phase is independently revertable. No dashboard lands before its view.
