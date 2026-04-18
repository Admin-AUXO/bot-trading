# Grafana Plan — Dashboards v2 + Auto-Generator Extension

Companion to [draft_index.md](draft_index.md), [draft_database_plan.md](draft_database_plan.md).

**Scope:** keep the 9 existing dashboards, backfill 20 missing views, add 6 new dashboards, extend the auto-generator (not hand-author), harden docker-compose.

Confirmed path: **extend the auto-generator in [dashboard-generator/index.mjs](trading_bot/grafana/src/dashboard-generator/index.mjs)** — do not hand-author JSON.

---

## 1. Six new dashboards

| Dashboard | Primary job | Key panels | Backing views |
|---|---|---|---|
| **Pack Leaderboard** | Decide which pack to promote / retire | WR, avg winner, avg loser, EV, hold-time, acceptance rate per pack; head-to-head pack A vs. B | `v_strategy_pack_performance_daily`, `v_kpi_by_config_window` |
| **Candidate Funnel** | Diagnose where candidates die | Waterfall discovered → queued → evaluated → accepted → bought → exited; rejection reason pie; hour-of-day; source breakdown | `v_candidate_funnel_daily_source`, `v_candidate_decision_facts` |
| **Exit Reason RCA** | Root-cause bad exits | Exit reason histogram, realized PnL by reason, avg hold by exit profile, exit exec latency | `v_position_exit_reason_daily`, `v_recent_fill_activity` |
| **Provider Credit Burn** | Keep Birdeye + Helius under budget | Daily cost, cost per accepted candidate, cost per position, monthly forecast, endpoint ranking | `v_api_provider_daily`, `v_api_endpoint_efficiency`, `v_api_provider_hourly` |
| **Adaptive Telemetry** | See the adaptive engine in motion | Mutator firing rate by axis + reason; threshold drift over time; mutator→outcome correlation | `v_adaptive_threshold_activity`, joined with `v_position_pnl_daily` |
| **Live Session Health** | Single pane for an active session | Lane status RAG, pause reason, open positions, cash exposure, last-fill age, stale-position alert, intervention band | `v_runtime_live_status`, `v_runtime_lane_health`, `v_open_position_monitor` |

Every panel supports **pack filter** (`strategyPackId`) and **config-epoch filter** (`config_version`). Filters are multi-select except decision surfaces.

## 2. Auto-generator extension — how to add a new dashboard

The generator lives at [trading_bot/grafana/src/dashboard-generator/](trading_bot/grafana/src/dashboard-generator/). Shared helpers in `core.mjs`; definitions by theme in `scorecards.mjs`, `operations.mjs`, `analytics.mjs`, `research.mjs`. Entrypoint [scripts/build-dashboards.mjs](trading_bot/grafana/scripts/build-dashboards.mjs).

### 2.1 Add a new theme module (if needed)

The 6 new dashboards split naturally:

| Dashboard | Theme module | Notes |
|---|---|---|
| Pack Leaderboard | `analytics.mjs` | Extend existing analytics module |
| Candidate Funnel | `analytics.mjs` | Same |
| Exit Reason RCA | `analytics.mjs` | Same |
| Provider Credit Burn | `operations.mjs` | Operator-facing |
| Adaptive Telemetry | new `adaptive.mjs` | Dedicated theme (new concern) |
| Live Session Health | `operations.mjs` | Replaces portions of existing live dashboard |

Create `adaptive.mjs` as a sibling to the others. Export one function per dashboard: `buildAdaptiveTelemetryDashboard(ctx)`.

### 2.2 Wire in `build-dashboards.mjs`

Append the new builder to the dashboard list; pass it the shared `ctx` (datasources, folder uids, config-version variable). Every builder returns `{ uid, title, panels, variables, annotations }`.

### 2.3 Use shared helpers from `core.mjs`

- `panelTimeseries({ title, query, unit, legend })` for trend panels.
- `panelStat({ title, query, unit, thresholds })` for scorecards.
- `panelTable({ title, query, columns, links })` for leaderboards.
- `variableQuery({ name, query, multi, includeAll })` for pack / config-version / source filters.
- `dashboardLink({ targetUid, title, keepTime=true, keepVariables=true })` for cross-dashboard pivots.
- `annotationsForConfigChanges(ctx)` to overlay `v_config_change_log` on every panel (already supported; reuse).

### 2.4 Required filters on every new dashboard

```
$pack        = variableQuery({ name: 'pack', query: 'select id, name from "StrategyPack" where status <> \'RETIRED\'', multi: true, includeAll: true })
$configVer   = variableQuery({ name: 'config_version', query: 'select distinct config_version from ...', multi: true, includeAll: true })
$source      = variableQuery({ name: 'source', query: 'select distinct source from "DiscoveryLabRun"', multi: true, includeAll: true })
```

All panel SQL must reference `WHERE $__timeFilter(bucket) AND "strategyPackId" IN ($pack) AND config_version IN ($configVer)`.

### 2.5 Regenerate + validate

```
cd trading_bot/grafana && node scripts/build-dashboards.mjs
node --check scripts/build-dashboards.mjs
```

Emitted JSON goes to `trading_bot/grafana/dashboards/**`. **Never hand-edit emitted JSON** — the generator rewrites it.

### 2.6 Alerting rules

Alert on symptoms (live session paused >5 m, credit-burn forecast over budget, exit exec latency p95 >X ms). Pending periods required. Annotations must include `summary`, `description`, `runbook_url`, `__dashboardUid__`, `__panelId__`. Provision in repo; no browser-only rules.

## 3. Docker-compose hardening

Ship alongside Grafana v2 (phase 6):
- `cpus: 0.25`, `memory: 512M` resource limits on the Grafana container.
- Configurable bind address (not `0.0.0.0` by default).
- Rotate admin password out of `compose.env`; source from a gitignored secret file or env-provider.

## 4. Guardrails

- No dashboard ships without its backing view committed to [create_views.sql](trading_bot/backend/prisma/views/create_views.sql) and green on `psql \df`.
- No transform-hides-missing-data — if the view isn't there, the panel fails loudly.
- Live-capital-sensitive dashboards (Live Session Health) must show `pack.version` + `config_version` in the header so nothing is ambiguous during an intervention.

## 5. Acceptance criteria

- 9 existing dashboards load without view errors post phase 1.
- 6 new dashboards render with pack + config-version filters wired.
- `adaptive.mjs` exists and emits a valid Grafana dashboard JSON.
- `docker-compose.yml` diffs show resource limits + bind + secret changes on the Grafana v2 commit.
