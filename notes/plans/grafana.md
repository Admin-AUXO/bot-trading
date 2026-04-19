# Grafana Plan — Views Backfill, Alerts, Compose

Companion to [database.md §4](database.md), [implementation-plan.md](implementation-plan.md). Snapshot **2026-04-19**.

## Audit adjustments

- The dashboards already reference missing views, so the fastest order is: `lint-dashboards` → SQL backfill → regenerate → alerts.
- Compose hardening is independent and can ship early.
- Alert YAMLs are useful, but provisioning them before the SQL/view contract is stable creates noisy non-proof.

---

## 1. What's landed

Generator modules at [trading_bot/grafana/src/dashboard-generator/](trading_bot/grafana/src/dashboard-generator/):

| Module | Builders | Landed dashboards (JSON) |
|---|---|---|
| `scorecards.mjs` | executive scorecard | `scorecards/bot-executive-scorecard.json` |
| `operations.mjs` | live trade monitor, telemetry, session overview | `operations/bot-live-trade-monitor.json`, `bot-telemetry-provider.json`, `bot-session-overview.json` |
| `analytics.mjs` | candidate funnel + RCA, position pnl, config impact, source cohorts, analyst insights, pack leaderboard, exit reason RCA | 8 dashboards under `analytics/` |
| `research.mjs` | research dry-run | `research/bot-research-dry-run.json` |
| `credits.mjs` | credit burn | `operations/bot-credit-burn.json` |
| `adaptive.mjs` | adaptive telemetry | `operations/bot-adaptive-telemetry.json` |
| `enrichment.mjs` | enrichment quality | `operations/bot-enrichment-quality.json` |

Entrypoint: [scripts/build-dashboards.mjs](trading_bot/grafana/scripts/build-dashboards.mjs). All 7 phase-6 builders wired into [index.mjs](trading_bot/grafana/src/dashboard-generator/index.mjs).

Datasource provisioned at `grafana/provisioning/datasources/postgres.yaml`. Dashboards auto-load via `grafana/provisioning/dashboards/providers.yaml`. Alerting dir is a `.gitkeep` stub.

---

## 2. View backfill — binding for dashboards

Dashboards fail loudly if a referenced view is missing. Ship the view before the dashboard panel. Full list in [database.md §4](database.md); summary of dependencies:

| Dashboard | Views it needs | Status |
|---|---|---|
| Session Overview | `v_runtime_live_status`, `v_runtime_lane_health`, `v_open_position_monitor`, `v_api_session_cost` | 3 of 4 missing |
| Pack Leaderboard | `v_strategy_pack_performance_daily`, `v_kpi_by_config_window`, `v_strategy_pack_exit_profile_mix` | 2 of 3 missing |
| Candidate Funnel | `v_candidate_funnel_daily_source`, `v_candidate_decision_facts`, `v_candidate_latest_filter_state` | 2 of 3 missing |
| Exit Reason RCA | `v_position_exit_reason_daily`, `v_recent_fill_activity`, `v_submit_lane_daily`, `v_exit_plan_mutation_daily` | all 4 missing |
| Credit Burn | `v_api_provider_daily`, `v_api_provider_hourly`, `v_api_purpose_daily`, `v_api_session_cost`, `v_api_endpoint_efficiency` | all landed |
| Adaptive Telemetry | `v_adaptive_threshold_activity`, `v_mutator_outcome_daily`, `v_position_pnl_daily` | 1 of 3 missing (`v_mutator_outcome_daily`) |
| Enrichment Quality | `v_enrichment_freshness`, `v_enrichment_quality_daily`, `v_api_endpoint_efficiency` | 2 of 3 missing |

Total missing: 14 views. All listed in [database.md §4](database.md) with required columns.

---

## 3. Alert rules — to provision

Ship under `grafana/provisioning/alerting/` as YAML after the SQL/view names are settled and linted. None exist today.

| Rule | Condition | Severity | Pending |
|---|---|---|---|
| `session_paused_5m` | `v_runtime_live_status.status = PAUSED` > 5 m | warning | 5 m |
| `exit_latency_p95_high` | `v_recent_fill_activity` exit p95 > 3 s | warning | 15 m |
| `sl_bundle_fail_rate` | `v_submit_lane_daily` SL land rate < 0.9 | critical | 30 m |
| `credit_burn_80pct` | today / daily budget > 0.8 | warning | 5 m |
| `credit_burn_100pct` | > 1.0 | critical | 2 m |
| `credit_slope_3x` | 1 h slope > 3× trailing-24h median | warning | 15 m |
| `enrichment_source_degraded` | `v_enrichment_quality_daily` fail share > 0.3 | warning | 15 m |
| `mutator_hurts_repeatedly` | `v_mutator_outcome_daily` HURT share > 0.6 over 24 h per mutator | warning | 2 h |
| `webhook_cap_90pct` | `v_runtime_lane_health.webhookUsage > 0.9` | warning | 5 m |

Each rule annotates: `summary`, `description`, `runbook_url`, `__dashboardUid__`, `__panelId__`. All route to the single ops channel.

---

## 4. docker-compose hardening

Current `docker-compose.yml` leaves Grafana open. Changes:

- `deploy.resources.limits: { cpus: '0.25', memory: '512M' }` on the grafana service.
- `environment.GF_SERVER_HTTP_ADDR` configurable (default `127.0.0.1`, not `0.0.0.0`).
- Admin password: remove from `compose.env` tracked file; source from a gitignored `compose.secrets.env` (mounted via `env_file`).
- Loki/Promtail untouched.

---

## 5. Lint

Add `scripts/lint-dashboards.mjs` that:

- Walks every JSON under `grafana/dashboards/**`.
- Extracts SQL from each panel.
- Extracts referenced view names.
- Confirms every name exists as `CREATE VIEW` in `backend/prisma/views/create_views.sql`.
- Fails on unknown view.

Wire into CI so a dashboard cannot merge against a missing view.

---

## 6. Filter conventions (reference)

Every dashboard ships with:

```
$pack       = "SELECT id, name FROM \"StrategyPack\" WHERE status <> 'RETIRED'"  (multi, includeAll)
$configVer  = "SELECT DISTINCT \"configVersion\" FROM \"RuntimeConfigVersion\"..."  (multi, includeAll)
```

Extra per-dashboard:
- Session Overview: `$sessionId`
- Pack Leaderboard: `$grade`
- Candidate Funnel: `$source`
- Exit RCA: `$exitReason`, `$lane`
- Credit Burn: `$provider`, `$purpose`
- Adaptive Telemetry: `$axis`, `$mutatorCode`
- Enrichment Quality: `$enrichmentSource`

All SQL uses `WHERE $__timeFilter(bucket) AND "strategyPackId" IN ($pack) AND "configVersion" IN ($configVer)` plus dashboard-specific clauses.

---

## 7. Regenerate + validate

```
cd trading_bot/grafana
node scripts/build-dashboards.mjs
node --check scripts/build-dashboards.mjs
node scripts/lint-dashboards.mjs
```

Never hand-edit emitted JSON — the generator rewrites it.

---

## 8. Parallel Work Packages

Grafana-surface WPs. WP-GF-1 is the same as rollout WP11; WP-GF-2 is rollout WP12; WP-GF-3 is rollout B2. Cross-referenced so an agent working only in this plan has enough context.

### WP-GF-1 — 9 alert YAMLs (= rollout WP11)

**Owner:** `grafana-builder`.
**Scope:** 6 new YAML files under `trading_bot/grafana/provisioning/alerting/`.
**Acceptance:** 9 rules per §3; `docker-compose restart grafana` reloads clean; each rule annotates `summary`, `description`, `runbook_url`, `__dashboardUid__`, `__panelId__`; all route to `ops` notification policy.

**Prompt:**
> Provision 9 Grafana alert rules as 6 YAML files under `trading_bot/grafana/provisioning/alerting/`: `session-alerts.yaml` (session_paused_5m), `execution-alerts.yaml` (exit_latency_p95_high, sl_bundle_fail_rate), `credit-alerts.yaml` (credit_burn_80pct, credit_burn_100pct, credit_slope_3x), `enrichment-alerts.yaml` (enrichment_source_degraded), `adaptive-alerts.yaml` (mutator_hurts_repeatedly), `lane-alerts.yaml` (webhook_cap_90pct). Conditions + severities + pending periods per §3 of [grafana.md](grafana.md). Annotations per the spec. Route to `ops` notification policy. Reference views from WP-DB-2 — rules may reference views that aren't live yet; Grafana tolerates missing views at provision time but will fail evaluation silently until backfilled.

### WP-GF-2 — docker-compose hardening (= rollout WP12)

**Owner:** `grafana-builder`.
**Scope:** [trading_bot/docker-compose.yml](trading_bot/docker-compose.yml), `trading_bot/grafana/compose.env`, new `trading_bot/grafana/compose.secrets.env.example`, `.gitignore`.
**Acceptance:** Grafana service has cpu/memory limits; `GF_SERVER_HTTP_ADDR` defaults to `127.0.0.1`; admin password removed from tracked env file; secrets file gitignored; loki/promtail untouched.

**Prompt:**
> Edit `trading_bot/docker-compose.yml`: add `deploy.resources.limits: { cpus: '0.25', memory: '512M' }` on the grafana service; set `environment.GF_SERVER_HTTP_ADDR: ${GF_SERVER_HTTP_ADDR:-127.0.0.1}`; extend `env_file` to `[./grafana/compose.env, ./grafana/compose.secrets.env]`. Remove `GF_SECURITY_ADMIN_PASSWORD` + any TOTP secret from tracked `trading_bot/grafana/compose.env`. Create `trading_bot/grafana/compose.secrets.env.example` with placeholder values and a comment directing the operator to copy it to `compose.secrets.env` locally. Add `trading_bot/grafana/compose.secrets.env` to `.gitignore`. Do NOT touch loki or promtail services.

### WP-GF-3 — lint-dashboards script (= rollout B2)

**Owner:** `grafana-builder`.
**Scope:** new [trading_bot/grafana/scripts/lint-dashboards.mjs](trading_bot/grafana/scripts/lint-dashboards.mjs), root `package.json` script wiring.
**Acceptance:** running `node scripts/lint-dashboards.mjs` exits 0 when every view referenced in dashboard JSON exists as a `CREATE VIEW` in `create_views.sql`; exits 1 with a clear diff when any is missing; `pnpm lint:dashboards` works from repo root.

**Prompt:**
> Write `trading_bot/grafana/scripts/lint-dashboards.mjs`: walk `trading_bot/grafana/dashboards/**/*.json`, extract SQL from every panel `targets[].rawSql`, extract view names via regex `FROM\\s+"(v_[a-z_]+)"`, load `trading_bot/backend/prisma/views/create_views.sql` and extract every `CREATE OR REPLACE VIEW (\\w+)` name. Fail (exit 1) on any dashboard-referenced view not in the SQL file, printing `{dashboardFile, panelTitle, viewName}` for each. Add `"lint:dashboards": "node trading_bot/grafana/scripts/lint-dashboards.mjs"` to root `package.json`. CI wiring is a follow-up ticket — do not add `.github/workflows/` changes in this PR.

### WP-GF-4 — Regenerate after views land

**Owner:** `grafana-builder`.
**Scope:** post-WP-DB-2 regeneration of JSON dashboards.
**Acceptance:** `node trading_bot/grafana/scripts/build-dashboards.mjs` run clean; `node --check scripts/build-dashboards.mjs` passes; `node trading_bot/grafana/scripts/lint-dashboards.mjs` exits 0; panels that used placeholder views now bind to real ones.

**Prompt:**
> Depends on WP-DB-2 landing the 14 views. Run `cd trading_bot/grafana && node scripts/build-dashboards.mjs && node scripts/lint-dashboards.mjs`. Commit the regenerated JSON under `trading_bot/grafana/dashboards/` — the generator rewrites them, so the diff is mechanical. Verify Session Overview, Exit RCA, Adaptive Telemetry, Enrichment Quality render data (not "no data" placeholders) after a Grafana restart against a DB with the views created. Log the regen + verify under `notes/sessions/<date>-grafana-regen.md`.

---

## 9. Acceptance

- 14 new views landed with columns from [database.md §4](database.md).
- 9 alert rules provisioned in `grafana/provisioning/alerting/` and firing against fixtures.
- docker-compose hardening merged (resource limits + bind + secret).
- `lint-dashboards.mjs` in CI; green.
- Session Overview, Exit RCA, Adaptive Telemetry render with data (not "no data" placeholders).
