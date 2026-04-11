---
type: decision
status: active
area: grafana
date: 2026-04-10
source_files:
  - notes/investigations/2026-04-10-dashboard-control-desk-audit.md
  - notes/reference/api-surface.md
  - notes/reference/prisma-and-views.md
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/prisma/views/create_views.sql
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/dashboard/lib/grafana.ts
  - trading_bot/dashboard/app/telemetry/page.tsx
  - trading_bot/dashboard/app/candidates/[id]/page.tsx
  - trading_bot/dashboard/app/positions/[id]/page.tsx
  - trading_bot/docker-compose.yml
  - trading_bot/grafana/provisioning/datasources/postgres.yaml
  - trading_bot/grafana/provisioning/dashboards/providers.yaml
graph_checked: 2026-04-10
next_action: Keep the 9-dashboard portfolio and SQL model stable, then finish browser verification for the candidate-detail and position-detail pivots once the runtime has real entity rows.
---

# Decision - Grafana Dashboard Plan

## Problem

The app now has precise outbound Grafana pivots, but the existing dashboard plan is still too generic for fast root-cause analysis.

It names four destinations, but it does not define:

- the shared variable contract those dashboards must honor
- which questions each dashboard is responsible for answering
- which existing views are genuinely RCA-ready versus merely convenient
- which desired panels are impossible today because the underlying history is not stored

Without that sharper contract, later sessions will either build decorative charts, duplicate dashboards, or weaken the app deep links instead of fixing Grafana.

## Evidence Checked

- Repo notes and references:
  `notes/sessions/2026-04-10-control-desk-implementation-handoff.md`
  `notes/investigations/2026-04-10-dashboard-control-desk-audit.md`
  `notes/reference/api-surface.md`
  `notes/reference/prisma-and-views.md`
- App deep-link contract:
  `trading_bot/dashboard/lib/grafana.ts`
  `trading_bot/dashboard/app/page.tsx`
  `trading_bot/dashboard/app/telemetry/page.tsx`
  `trading_bot/dashboard/app/candidates/[id]/page.tsx`
  `trading_bot/dashboard/app/positions/[id]/page.tsx`
- Backend operator surfaces and computed state:
  `trading_bot/backend/src/services/operator-desk.ts`
  `trading_bot/backend/src/api/server.ts`
- Database surfaces:
  `trading_bot/backend/prisma/schema.prisma`
  `trading_bot/backend/prisma/views/create_views.sql`
- Live API sampling on the running app:
  `/health`
  `/api/desk/home`
  `/api/operator/diagnostics`
  `/api/views/v_runtime_overview`
  `/api/views/v_runtime_settings_current`
- Current Grafana docs for best practices, URL variables, dashboard links, variables, and current filtering behavior.

## Decision

Keep four external Grafana dashboards, but tighten them into one drill path and one variable contract.

1. `control`
   Purpose: explain why the desk is healthy, degraded, or blocked over time.
   Current app mapping: `control` resolves to the live monitor UID through `GRAFANA_LIVE_DASHBOARD_UID`
2. `telemetry`
   Purpose: isolate provider, endpoint, payload, and budget failures.
   UID env: `GRAFANA_TELEMETRY_DASHBOARD_UID`
3. `candidate`
   Purpose: explain discovery and evaluation outcomes, reject reasons, and candidate-specific evidence.
   UID env: `GRAFANA_CANDIDATE_DASHBOARD_UID`
4. `position`
   Purpose: explain trade outcomes, exit behavior, and position-specific evidence.
   UID env: `GRAFANA_POSITION_DASHBOARD_UID`

Use one shared base env:

- `GRAFANA_BASE_URL`

Do not embed Grafana panels inside the app for the first pass. Keep Grafana as the historical and RCA surface and let Next.js remain the operational desk.

## Why

- The desk is already dense enough. Embedding trend panels back into it would just recreate the clutter that triggered the redesign.
- The dashboard code already preserves time range and route context through `from`, `to`, and `var-*` URL params. Grafana should meet that contract, not water it down.
- The repo already has useful reporting surfaces, but several are aggregate convenience views rather than true RCA models. The plan has to be honest about that.
- The current live instance is mostly empty:
  provider and position views returned no rows during sampling,
  while runtime singleton views returned valid data.
  These dashboards therefore need explicit empty states and cannot rely on seeded history existing on day one.

## Datasource Strategy

Preferred first pass:

- Primary datasource: direct PostgreSQL datasource pointed at the trading bot database
- Primary query surfaces: repo-owned SQL views for stable KPIs plus raw tables only where RCA needs finer grain than the views currently provide

Optional second datasource only if needed:

- JSON or Infinity-backed datasource against read-only backend routes for current-state operator contracts such as `/api/desk/home` or `/api/operator/diagnostics`

Reasoning:

- The existing plan and repo docs already bias historical analysis toward Postgres-backed views.
- The app still has no Grafana proxy. The repo now does ship a local Grafana service in Compose, provisioned from `trading_bot/grafana/`, so pretending Grafana is still external-only would be equally stupid.
- If Grafana cannot reach Postgres directly, fall back to backend read routes, but treat that as an infrastructure workaround, not the preferred analytics path.

## Shared Variable Contract

All four dashboards should use a small, ordered, repeatable variable set.

Global rules:

- Put broad selectors before narrow selectors.
- Keep chained variables shallow, ideally no deeper than two levels.
- Use `Include All` with a controlled wildcard or custom all value where the datasource supports it, so `All` does not explode into a giant query string.
- Preserve current time range and variable values in dashboard, panel, and data links.

Shared variable set:

- `provider`
- `endpoint`
- `source`
- `mint`
- `symbol`
- `positionId`
- `trigger`
- `candidateStatus`
- `rejectReason`
- `positionStatus`
- `exitReason`

Variable order:

1. `provider`
2. `endpoint`
3. `source`
4. `mint`
5. `symbol`
6. `positionId`
7. route-specific reason or status variables

App deep-link compatibility that must stay intact:

- `/` opens `control` with time only
- `/telemetry` opens `telemetry` and may set `provider`
- candidate detail opens `candidate` with `mint`, `symbol`, and `source`
- position detail opens `position` with `positionId`, `mint`, and `symbol`

Do not require the app to pass more than that. If extra filters are useful, expose them as dashboard variables with sensible defaults.

## Dashboard Design

### Control Dashboard

Main question:
What changed that explains why the desk is blocked, degraded, or behaving unusually?

Top row:

- Desk health strip:
  manual pause state, active mode, current capital settings, max-open setting, last config update
- Today vs previous-period summary:
  candidates discovered, positions opened, positions closed, realized PnL, provider errors

Middle rows:

- Candidate funnel over time by status
- Reject-reason trend over time
- Exit-reason trend over time
- Provider error and unit burn trend by provider

Evidence row:

- Recent operator and system events table
- Recent provider payload failure table
- Settings snapshot table from `v_runtime_settings_current`

Primary variables:

- `provider`
- `source`
- `candidateStatus`
- `rejectReason`
- `exitReason`

Primary drill links:

- Provider panels -> `telemetry`
- Reject-reason panels -> `candidate`
- Exit-reason panels -> `position`

Reality check:

- Historical queue depth and open-position-count timelines are not available from current storage.
- Historical blocker-state timelines are also not available today.
- Daily realized PnL is not exposed as a stable view yet.

Required upstream additions before this dashboard is finished:

- `v_operator_event_daily`:
  event counts by day, `kind`, `level`, `entity_type`
- `v_fill_pnl_daily`:
  realized PnL and sell count by day
- `v_position_open_daily` or equivalent:
  opened count, closed count, open inventory delta by day

Do not fake these with front-end transforms over singleton state.

### Telemetry Dashboard

Main question:
Which provider or endpoint is failing, slowing down, or burning too much quota, and since when?

Top row:

- RED-style provider strip:
  rate, errors, duration, burn
- Current 6h fault strip:
  payload failures, stale discovery, stale evaluation, pace status

Middle rows:

- Provider calls and units by day from `v_api_provider_daily`
- Endpoint error concentration
- Endpoint latency distribution
- Status-code mix and failure trend from raw payload data
- Recent payload failures table with `provider`, `endpoint`, `status_code`, `error_message`, `entity_key`

Primary variables:

- `provider`
- `endpoint`
- success or failure state
- `entityKey` as a text variable if raw-payload RCA is needed

Preferred query surfaces:

- `v_api_provider_daily` for cheap trend cards
- `v_raw_api_payload_recent` for RCA tables and recent-failure charts

Current weakness in the repo-owned views:

- `v_api_endpoint_efficiency` is lifetime aggregate by provider and endpoint, not a time series.
- `v_api_provider_daily` has average latency only, no percentile shape.
- `ApiEvent` does not carry status code.

Required upstream additions before this dashboard is truly good:

- `v_api_endpoint_daily`:
  day x provider x endpoint trend with calls, units, avg latency, error count
- `v_raw_api_payload_hourly` or `v_payload_failure_hourly`:
  time-bucketed failures, status codes, latency, and entity scope
- optional error taxonomy field or view:
  group raw `errorMessage` into stable RCA buckets instead of forcing regex roulette in Grafana

### Candidate Dashboard

Main question:
Why did a token pass, defer, or fail, and what did its evidence look like around that decision?

Top row:

- Funnel strip:
  discovered, accepted, rejected, bought, exited
- Source mix
- Reject-reason concentration

Middle rows:

- Candidate funnel trend
- Reject reasons over time
- Snapshot trigger mix over time
- Source-by-reject matrix
- Security-risk distribution from snapshot evidence

Evidence row:

- Candidate latest filter-state table
- Candidate snapshot timeline for selected `mint`
- Candidate raw payload table for selected `mint`

Primary variables:

- `source`
- `mint`
- `symbol`
- `trigger`
- `candidateStatus`
- `rejectReason`
- `securityRisk`

Preferred query surfaces:

- `v_candidate_funnel_daily`
- `v_candidate_reject_reason_daily`
- `v_snapshot_trigger_daily`
- `v_candidate_latest_filter_state`
- `v_token_snapshot_enriched`

Current weakness in the repo-owned views:

- Funnel and reject-reason views do not include `source`, so source-level RCA is awkward.
- `v_candidate_latest_filter_state` is current-state only, not a historical decision timeline.
- Historical candidate-level RCA depends on raw `TokenSnapshot` history, not a concise decision-facts model.

Required upstream additions before this dashboard is truly good:

- `v_candidate_funnel_daily_source`:
  day x source x status
- `v_candidate_reject_reason_daily_source`:
  day x source x reject reason
- `v_candidate_decision_facts`:
  one row per candidate with discovered, last evaluated, accepted, bought, exit outcome, primary blocker class, and key thresholds at decision time

### Position Dashboard

Main question:
Why did this trade win, lose, or require intervention, and what pattern repeats across trades?

Top row:

- Outcome strip:
  win rate, median hold, realized PnL, average return, open-risk count
- Exit profile strip:
  stop-driven exits, TP-driven exits, timeout exits, still-open count

Middle rows:

- Realized PnL distribution by exit reason
- Hold-time distribution by exit reason
- Position performance table with filters for status and reason
- Exit-reason trend over time

Evidence row:

- Fill trail table
- Snapshot timeline for selected `positionId` or `mint`
- Linked candidate context table

Primary variables:

- `positionId`
- `mint`
- `symbol`
- `positionStatus`
- `exitReason`

Preferred query surfaces:

- `v_position_performance`
- `v_position_exit_reason_daily`
- `v_token_snapshot_enriched`

Current weakness in the repo-owned views:

- No stable daily realized-PnL trend view
- No fill-day rollup for buy or sell counts
- No explicit intervention-priority history
- No execution-quality view beyond raw fills

Required upstream additions before this dashboard is truly good:

- `v_position_pnl_daily`:
  realized PnL, gross exit, closed count by day
- `v_fill_daily`:
  buy and sell counts, notional, pnl by day and side
- optional `v_position_intervention_facts`:
  open-position stale risk, stop distance bands, TP stage, latest snapshot age

## Link Contract

The app-side deep links should preserve:

- a relevant time window
- the most specific known entity identifier
- any route-specific filter already implied by the page

Current app mappings:

- `/` can open the control dashboard
- `/telemetry` can open the telemetry dashboard and provider-filtered links
- candidate detail can open the candidate dashboard with `mint`, `symbol`, and `source`
- position detail can open the position dashboard with `positionId`, `mint`, and `symbol`

Inside Grafana:

- Dashboard links should include current time range and current template variable values.
- Panel and data links should be used for drilldowns instead of cloning dashboards.
- If the Grafana version is 12.2 or later and the team wants true ad hoc slicing on SQL-backed data, use the enhanced ad hoc filtering path deliberately. Classic ad hoc filters are not reliable on SQL datasources.

## Consequences

- Later sessions should not invent new dashboard categories unless one of these four surfaces proves insufficient.
- If a Grafana dashboard cannot accept the app’s variables, that is a dashboard defect, not a reason to weaken the app link contract.
- `RuntimeConfigDraft` stays out of Grafana by default. It is workflow state, not analytics.
- `OperatorEvent` does belong in Grafana, but as history and annotations, not as a dashboard dumping ground.
- Several panels requested in the first dashboard note are impossible today without adding new views. That is now explicit.

## Follow-up

1. Decide the datasource model:
   direct Postgres first, backend-read fallback only if necessary.
2. Add the missing RCA-grade SQL views before anyone starts polishing panel chrome.
3. Provision the four dashboards in Grafana with stable UIDs.
4. Use shared variable names that match the app deep-link contract exactly.
5. Add dashboard, panel, and data links so the drill path is:
   control -> telemetry or candidate or position
   telemetry -> payload evidence
   candidate -> selected token evidence
   position -> selected trade evidence
6. Keep dashboard UIDs stable and write them into dashboard runtime env.
7. Browser-verify each app pivot and each intra-Grafana drill link with real variable propagation.
8. If a needed analysis still requires heavy Grafana transformations, stop and fix the upstream SQL model instead.

## Acceptance Criteria

- Opening Grafana from the app always lands on the correct dashboard with the expected time range and variable values already populated.
- An operator can answer:
  why the desk is degraded,
  which provider or endpoint is failing,
  why a candidate was rejected,
  and why a position won or lost,
  without editing a query.
- The dashboards remain useful when history is sparse and become richer automatically as evidence accumulates.
- No dashboard duplicates another with only minor filter changes.
- No critical RCA panel depends on brittle Grafana-only transformations when the repo can model it upstream.

## Portfolio Decision

Chosen operating model from follow-up planning:

- Deploy Grafana as a separate `grafana` service in the same Compose stack, not inside the `bot` container.
- Use PostgreSQL as the only datasource so the backend can stay focused on live trading.
- Manage core dashboards as code in-repo, while allowing temporary sandbox dashboards in the Grafana UI.
- Build a 9-dashboard portfolio so the estate stays broad enough for scorecards, analytics, live monitoring, and RCA without turning into dashboard sprawl.

Chosen portfolio:

1. `Executive Scorecard`
2. `Analyst Insights Overview`
3. `Live Trade Monitor`
4. `Telemetry & Provider Analytics`
5. `Candidate & Funnel Analytics`
6. `Position & PnL Analytics`
7. `Config Change Impact & RCA`
8. `Source & Cohort Performance`
9. `Research & Dry-Run Analysis`

Portfolio constraints:

- Because the target estate is capped at roughly 9 dashboards, telemetry gets the heaviest dedicated RCA treatment.
- Candidate and position raw evidence should live as dense drill sections inside their family dashboards instead of becoming separate standalone dashboards in the first pass.
- If later usage proves that candidate or position evidence needs its own dashboard, that should replace a low-value dashboard, not expand the estate blindly.

## Detailed Dashboard Specs

### 1. Executive Scorecard

Audience:

- concise review surface for top-line health and performance

Main question:

- Is the bot healthy, productive, and getting better or worse versus the previous period and previous config?

Default time range:

- last 7 days

Refresh:

- 15 minutes

Filters:

- `source`
- `configVersion`

Scorecards:

- realized PnL
- win rate
- candidates discovered
- candidate acceptance rate
- positions opened
- positions closed
- provider error rate
- Birdeye units burned versus cap

Charts:

- daily realized PnL
- candidate funnel trend
- source contribution trend
- provider error trend
- units burned trend

Tables:

- KPI delta table showing:
  current period, previous period, current config window, previous config window

Heatmaps or matrices:

- `configVersion x KPI`

Primary datasource surfaces:

- `v_candidate_funnel_daily`
- `v_api_provider_daily`
- new `v_fill_pnl_daily`
- new `v_source_outcome_daily`
- new `v_config_change_log`

Drill paths:

- provider issues -> `Telemetry & Provider Analytics`
- funnel weakness -> `Candidate & Funnel Analytics`
- PnL weakness -> `Position & PnL Analytics`
- config shift -> `Config Change Impact & RCA`

### 2. Analyst Insights Overview

Audience:

- analyst-first cross-cutting discovery dashboard

Main question:

- Which patterns, cohorts, or config shifts are driving overall behavior?

Default time range:

- last 14 days

Refresh:

- 15 minutes

Filters:

- `source`
- `provider`
- `configVersion`
- `daypart`
- `exitProfile`
- `securityRisk`

Scorecards:

- best source by realized PnL
- worst source by reject rate
- provider cost per accepted candidate
- best config delta

Charts:

- source performance trend
- daypart PnL trend
- reject-rate trend
- exit-profile trend

Heatmaps or matrices:

- `source x rejectReason`
- `exitReason x exitProfile`
- `provider x endpoint`
- `daypart x source`
- `securityRisk x outcome`

Tables:

- cohort leaderboard with conditional formatting on:
  PnL, win rate, reject share, provider cost, acceptance rate

Primary datasource surfaces:

- new `v_source_outcome_daily`
- new `v_candidate_cohort_daily`
- new `v_position_cohort_daily`
- new `v_config_change_log`

Drill paths:

- source issue -> `Source & Cohort Performance`
- config issue -> `Config Change Impact & RCA`
- provider issue -> `Telemetry & Provider Analytics`

### 3. Live Trade Monitor

Audience:

- operator monitoring open risk and recent execution activity

Main question:

- What is open right now, what just happened, and what needs attention first?

Default time range:

- last 6 hours

Refresh:

- 15 to 30 seconds

Filters:

- `symbol`
- `mint`
- `positionId`

Scorecards:

- open positions
- current capital
- current cash
- recent fills
- stale positions

Charts:

- open-position count
- recent fill activity
- stale-snapshot count
- stop-distance band trend

Tables:

- open positions with heat formatting for:
  stop distance, return percent, stale minutes, TP stage, intervention priority
- recent fills table

Heatmaps or matrices:

- `interventionBand x TPStage`

Primary datasource surfaces:

- new `v_runtime_live_status`
- new `v_open_position_monitor`
- new `v_recent_fill_activity`
- new `v_position_snapshot_latest`

Drill paths:

- selected position -> `Position & PnL Analytics`
- execution anomaly -> telemetry or raw evidence sections inside position analytics

### 4. Telemetry & Provider Analytics

Audience:

- monitoring plus telemetry RCA

Main question:

- Which provider or endpoint is failing, slowing down, or burning too much quota?

Default time range:

- last 24 hours

Refresh:

- 30 to 60 seconds

Filters:

- `provider`
- `endpoint`
- success or failure state

Scorecards:

- total calls
- total units
- error rate
- average latency
- recent payload failures
- projected pace versus monthly budget

Charts:

- provider calls, units, and errors over time
- endpoint error trend
- endpoint latency trend
- quota pace trend
- payload failure trend

Tables:

- top failing endpoints
- top slow endpoints
- top expensive endpoints
- recent failed payloads with:
  provider, endpoint, status code, error message, entity key, latency

Heatmaps or matrices:

- `provider x endpoint`
- `endpoint x statusCode`
- `hour x provider`

Primary datasource surfaces:

- `v_api_provider_daily`
- `v_api_endpoint_efficiency`
- `v_raw_api_payload_recent`
- new `v_api_provider_hourly`
- new `v_api_endpoint_hourly`
- new `v_payload_failure_hourly`
- new `v_runtime_lane_health`

Drill paths:

- endpoint issue -> payload evidence section in the same dashboard
- platform-wide issue -> `Config Change Impact & RCA`

### 5. Candidate & Funnel Analytics

Audience:

- analyst and operator reviewing discovery quality and decision quality

Main question:

- Which candidates pass, fail, or defer, and which cohorts actually convert into good downstream trades?

Default time range:

- last 14 days

Refresh:

- 5 minutes

Filters:

- `source`
- `mint`
- `symbol`
- `candidateStatus`
- `rejectReason`
- `trigger`
- `securityRisk`
- `daypart`

Scorecards:

- discovered
- accepted
- rejected
- bought
- downstream conversion rate
- average decision quality score

Charts:

- funnel trend
- reject-reason trend
- trigger mix
- source trend
- security-risk distribution

Tables:

- current candidate leaderboard
- blocked candidate table
- latest filter-state table with heat formatting for:
  liquidity, volume, buy-sell ratio, holder concentration

Heatmaps or matrices:

- `source x rejectReason`
- `source x trigger`
- `daypart x source`
- `securityRisk x source`

Embedded evidence sections:

- selected mint snapshot history
- selected mint provider payload evidence

Primary datasource surfaces:

- `v_candidate_funnel_daily`
- `v_candidate_reject_reason_daily`
- `v_snapshot_trigger_daily`
- `v_candidate_latest_filter_state`
- `v_token_snapshot_enriched`
- new `v_candidate_funnel_daily_source`
- new `v_candidate_reject_reason_daily_source`
- new `v_candidate_decision_facts`

Drill paths:

- source weakness -> `Source & Cohort Performance`
- config-linked degradation -> `Config Change Impact & RCA`

### 6. Position & PnL Analytics

Audience:

- analyst and operator reviewing realized outcomes and execution behavior

Main question:

- Which positions and cohorts actually make money, under which exit profiles and configs?

Default time range:

- last 14 days

Refresh:

- 5 minutes

Filters:

- `positionId`
- `mint`
- `symbol`
- `positionStatus`
- `exitReason`
- `exitProfile`
- `source`
- `configVersion`

Scorecards:

- realized PnL
- win rate
- median hold time
- average return
- TP hit rate
- stop-loss share

Charts:

- daily realized PnL
- exit-reason trend
- hold-time distribution
- exit-profile performance
- symbol and source contribution

Tables:

- position performance table with conditional formatting on:
  realized PnL, hold time, return percent, exit reason
- fills trail
- linked candidate context

Heatmaps or matrices:

- `exitReason x exitProfile`
- `holdBand x exitReason`
- `source x outcome`
- `configVersion x PnL`

Embedded evidence sections:

- fills
- linked candidate
- snapshot timeline

Primary datasource surfaces:

- `v_position_performance`
- `v_position_exit_reason_daily`
- `v_token_snapshot_enriched`
- new `v_position_pnl_daily`
- new `v_fill_daily`
- new `v_position_cohort_daily`

Drill paths:

- exit-profile issue -> `Config Change Impact & RCA`
- source issue -> `Source & Cohort Performance`

### 7. Config Change Impact & RCA

Audience:

- analyst improving settings and validating whether changes helped or hurt

Main question:

- Did the config change improve or degrade trading, candidate quality, telemetry, or risk outcomes?

Default time range:

- last 30 days

Refresh:

- 5 minutes

Filters:

- `configVersion`
- prior config window
- `source`
- `exitProfile`

Scorecards:

- current versus previous config on:
  realized PnL, win rate, reject rate, provider burn, candidate conversion

Charts:

- KPI trend with config annotations
- before and after windows
- config delta by source
- config delta by exit profile

Tables:

- config change log
- changed fields
- KPI delta by config version

Heatmaps or matrices:

- `configVersion x KPI`
- `configVersion x source`
- `configVersion x exitReason`

Primary datasource surfaces:

- new `RuntimeConfigVersion` table or equivalent
- new `v_config_change_log`
- new `v_kpi_by_config_window`
- new `v_config_field_change`

Drill paths:

- candidate impact -> `Candidate & Funnel Analytics`
- position impact -> `Position & PnL Analytics`
- provider impact -> `Telemetry & Provider Analytics`

### 8. Source & Cohort Performance

Audience:

- analyst deciding which cohorts are actually worth trusting

Main question:

- Which sources, dayparts, liquidity bands, and risk cohorts produce good trades versus expensive noise?

Default time range:

- last 30 days

Refresh:

- 15 minutes

Filters:

- `source`
- `daypart`
- liquidity band
- volume band
- `securityRisk`
- `exitProfile`
- `configVersion`

Scorecards:

- best source
- worst source
- best cohort
- worst cohort

Charts:

- source win-rate trend
- source PnL trend
- cohort conversion trend
- daypart performance trend

Tables:

- cohort leaderboard with sortable and color-scaled cells

Heatmaps or matrices:

- `source x liquidityBand`
- `source x daypart`
- `securityRisk x outcome`
- `liquidityBand x exitProfile`

Primary datasource surfaces:

- new `v_source_outcome_daily`
- new `v_candidate_cohort_daily`
- new `v_position_cohort_daily`

Drill paths:

- weak source -> `Candidate & Funnel Analytics`
- weak realized outcome -> `Position & PnL Analytics`

### 9. Research & Dry-Run Analysis

Audience:

- analyst isolating DRY_RUN learning from live behavior

Main question:

- Which dry-run settings and cohorts looked promising before touching live capital?

Default time range:

- latest run, with comparison to previous run

Refresh:

- on demand or 5 minutes

Filters:

- run id
- `source`
- `mint`
- `symbol`
- `exitProfile`

Scorecards:

- discovered
- shortlisted
- strategy passed
- mock opened
- mock closed
- dry-run PnL
- live-tradable pass rate

Charts:

- run-over-run comparison
- dry-run funnel
- dry-run PnL trend
- source performance in research

Tables:

- research tokens
- mock positions
- mock fills
- run comparison table

Heatmaps or matrices:

- `runId x KPI`
- `source x runOutcome`

Primary datasource surfaces:

- existing `ResearchRun`
- existing `ResearchToken`
- existing `ResearchPosition`
- existing `ResearchFill`
- preferably new `v_research_run_summary`
- preferably new `v_research_token_outcome`
- preferably new `v_research_position_performance`

## Detailed Next Steps

### Phase 1 - Compose and Grafana Foundation

1. Add a dedicated `grafana` service to `trading_bot/docker-compose.yml`.
2. Add a persistent Grafana volume.
3. Bind Grafana to `127.0.0.1:3400`.
4. Add provisioning directories for datasource and dashboards.
5. Add a PostgreSQL datasource config pointed at `postgres`.
6. Keep Grafana local-only for now because the user is the only operator.

### Phase 2 - Data Model Work Before Dashboard Chrome

1. Add config history persistence.
2. Add hourly telemetry views.
3. Add realized-PnL daily views.
4. Add live-trade monitor views for open risk and recent fills.
5. Add source and cohort views.
6. Add research rollup views if the current tables are too raw for responsive dashboards.

### Phase 3 - First Dashboard Build Order

1. `Live Trade Monitor`
2. `Telemetry & Provider Analytics`
3. `Executive Scorecard`
4. `Candidate & Funnel Analytics`
5. `Position & PnL Analytics`
6. `Config Change Impact & RCA`
7. `Analyst Insights Overview`
8. `Source & Cohort Performance`
9. `Research & Dry-Run Analysis`

### Phase 4 - Verification

1. Verify Grafana can connect to Postgres inside Compose.
2. Verify each provisioned dashboard loads without missing fields.
3. Verify app deep links open the intended dashboards with correct variables and time ranges.
4. Verify every matrix and table remains readable with sparse data.
5. Verify dashboards still work when raw-history tables are empty.

### Phase 5 - Alerting

1. Add only lightweight alerts first:
   provider failures, stale runtime lanes, and live-trade anomalies.
2. Link alerts back into the relevant dashboards.
3. Do not alert on every KPI just because Grafana can.

## Linked Notes

- [Dashboard Control Desk Audit](../investigations/2026-04-10-dashboard-control-desk-audit.md)
- [API Surface](../reference/api-surface.md)
- [Prisma And Views](../reference/prisma-and-views.md)
- [Tech Stack](../reference/tech-stack.md)
