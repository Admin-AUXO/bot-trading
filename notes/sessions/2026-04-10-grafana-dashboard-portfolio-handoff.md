---
type: session
status: open
area: grafana
date: 2026-04-10
source_files:
  - trading_bot/docker-compose.yml
  - trading_bot/backend/prisma/schema.prisma
  - trading_bot/backend/prisma/views/create_views.sql
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/dashboard/lib/grafana.ts
  - notes/reference/agent-workflow.md
  - notes/decisions/2026-04-10-grafana-dashboard-plan.md
graph_checked: 2026-04-10
next_action: Populate non-empty candidate and position history, then browser-verify the candidate-detail and position-detail Grafana pivots with real entity filters.
---

# Session - Grafana Dashboard Portfolio Handoff

## Context

This session turned the earlier Grafana sketch into a full portfolio plan.

The user does not want RCA-only dashboards. The target estate must support:

- live trade monitoring
- telemetry monitoring
- historical analytics
- config-improvement analysis
- raw-evidence drilldowns
- RCA
- research and dry-run review

## What Changed

- Expanded the Grafana decision note into a detailed 9-dashboard portfolio.
- Recorded the deployment decision:
  dedicated `grafana` service in the same Compose stack, not inside the trading bot container.
- Locked first-pass datasource strategy:
  PostgreSQL only.
- Locked dashboard management mode:
  provision core dashboards as code, allow temporary sandbox dashboards in the UI.
- Added general agent workflow and questioning guidance to `notes/reference/agent-workflow.md`.
- Added a repo-owned Grafana tree under `trading_bot/grafana/` with:
  datasource provisioning
  dashboard providers
  dashboard JSON for scorecards, operations, analytics, and research folders
- Updated `trading_bot/docker-compose.yml` with a dedicated `grafana` service bound locally on `127.0.0.1:3400`.
- Expanded `trading_bot/backend/.env.example` with Grafana host, auth, and dashboard UID defaults.
- Added `RuntimeConfigVersion` in the Prisma schema and the first-pass SQL views required by the dashboard portfolio in `trading_bot/backend/prisma/views/create_views.sql`.

## Key Portfolio Decision

Target estate is 9 dashboards:

1. Executive Scorecard
2. Analyst Insights Overview
3. Live Trade Monitor
4. Telemetry & Provider Analytics
5. Candidate & Funnel Analytics
6. Position & PnL Analytics
7. Config Change Impact & RCA
8. Source & Cohort Performance
9. Research & Dry-Run Analysis

Important constraint:

- The user also wanted dedicated raw-data surfaces, but the acceptable estate size was still around 7 to 9 dashboards.
- Because of that cap, telemetry gets the heaviest dedicated RCA treatment.
- Candidate and position evidence should live as dense drill sections inside their family dashboards in the first pass.

## What I Verified

- Checked the app deep-link contract in `trading_bot/dashboard/lib/grafana.ts`.
- Checked current backend and DB reporting surfaces in schema, views, API routes, and operator-desk shaping.
- Sampled the live bot endpoints for health, desk state, diagnostics, and exposed views.
- Confirmed current history is sparse for provider, candidate, snapshot, and position analytics.
- Confirmed no reachable local Grafana instance existed during planning.

## Risks / Unknowns

- The current SQL view set is not sufficient for the requested dashboard estate.
- Config-impact dashboards are blocked until config history is versioned instead of stored as a singleton only.
- Live trade monitoring dashboards need dedicated open-position and fill activity views; current reporting views are too coarse.
- Telemetry analytics needs hourly and endpoint-over-time views; the current endpoint view is lifetime aggregate only.
- If Grafana is added to Compose but not provisioned as code, the estate will drift immediately.
- If the next session tries to build dashboard chrome before fixing the upstream SQL model, the result will be attractive nonsense.
- Current repo state is ahead of this note:
  the Grafana tree, Compose service, config-version model, and first-pass SQL views now exist in the working tree.
- Current runtime state still lags the repo:
  Grafana is not running yet in Compose, `127.0.0.1:3400` does not answer health checks, and the new stack has not been browser-verified.
- The live `backend/.env` still only carries `GRAFANA_PORT` and `GRAFANA_MCP_PORT`; the rest of the Grafana contract currently relies on Compose defaults rather than explicit runtime env.

## Detailed Next Action

### 1. Reconcile Runtime With Repo State

- Recreate `db-setup`, `grafana`, `bot`, and `dashboard` from the updated Compose file.
- Confirm `db-setup` reapplies Prisma schema plus SQL views against the running Postgres catalog.
- Confirm the Grafana container comes up healthy on `127.0.0.1:3400`.

### 2. Verify Provisioning Instead Of Trusting The Filesystem

- Confirm the PostgreSQL datasource provisions successfully.
- Confirm the folder providers load:
  `scorecards`
  `operations`
  `analytics`
  `research`
- Confirm the expected dashboard UIDs exist and match the app-side link contract.

### 3. Validate The New SQL Model In The Running Database

- The repo now contains the first-pass SQL model that this note originally called for.
- Verify those views actually exist in Postgres after rollout and return sane shapes on sparse history.
- Watch for the known Prisma/catalog mismatch that previously affected additive tables.

### 4. Only Then Do Browser Verification

- Verify Grafana can connect to Postgres inside Compose.
- Verify each dashboard handles sparse data without blanking or broken queries.
- Verify the app deep links land on the intended dashboards with matching variables and time range.
- If a dashboard fails on a missing field or bad query, fix the dashboard or the SQL model instead of weakening the app links.

## Progress Update - 2026-04-10 Late Session

The remaining work has now started instead of just being described.

### Completed In This Follow-On Session

- Reconciled the running stack with the repo state using:
  `cd trading_bot && docker compose up -d --build db-setup grafana bot dashboard`
- Confirmed the canonical DB rollout completed successfully inside `db-setup`:
  `prisma db push`
  `prisma db execute --file prisma/views/create_views.sql`
- Confirmed Grafana is now running locally on `127.0.0.1:3400`.
- Fixed the Grafana Compose healthcheck in `trading_bot/docker-compose.yml` so it matches the formatted JSON returned by `/api/health` instead of grepping for a minified payload that never existed.
- Confirmed Grafana provisioned:
  the PostgreSQL datasource
  the `scorecards`, `operations`, `analytics`, and `research` folders
  all 9 repo-owned dashboards
- Browser-verified:
  the live monitor dashboard opens at `bot-live-trade-monitor`
  the telemetry dashboard opens at `bot-telemetry-provider`
  both render correctly against the current sparse dataset
- Confirmed the app is still healthy after the stack refresh:
  dashboard on `3100`
  backend on `3101`
- Confirmed the Grafana container now reports healthy in Compose after the probe fix.

### What The Verification Showed

- The current `control` Grafana alias in `trading_bot/dashboard/lib/grafana.ts` intentionally maps to the live monitor dashboard UID, not to the executive scorecard.
- The desk homepage now opens the live monitor Grafana surface from its diagnostics strip.
- The telemetry page opens the telemetry dashboard correctly.
- Sparse history is handled honestly:
  trend panels show `No data`
  live and lane-health tables still render useful state

### Remaining Gap

- Candidate-detail and position-detail deep links could not be browser-verified end to end because the current runtime has no candidate rows and no position rows.
- Their URL builders are present in the Next.js detail pages and point at:
  `bot-candidate-funnel`
  `bot-position-pnl`
  with entity variables and bounded time windows
- That final verification needs a dataset with at least one candidate and one position.

## Progress Update - 2026-04-10 Dashboard Query Repair

The repo-owned dashboards were provisioned, but some of the headline panels were still committing the usual Grafana sin:
averaging already-aggregated rates and durations as if every bucket had equal weight.

### What Changed

- Updated `trading_bot/grafana/scripts/build-dashboards.mjs` so the generated dashboards now:
  compute executive win rate from `wins / (wins + losses)` instead of averaging daily `win_rate`
  compute executive provider error rate from `SUM(error_count) / SUM(total_calls)` instead of averaging daily error percentages
  compute telemetry average latency as a call-weighted average over `v_api_provider_hourly`
  compute position headline stats from `v_position_performance` so `positionId`, `mint`, and `symbol` actually scope the drill
  apply the candidate `daypart` filter to the candidate headline stats and trend panels instead of exposing a dead variable
  remove the generator’s fake default table sort on `session_date`, which was wrong for tables keyed by `created_at`, `position_id`, or non-date columns
- Rebuilt all 9 provisioned dashboard JSON files from the generator.
- Restarted the local Grafana container and confirmed the provisioned dashboard UIDs now expose the repaired queries through the Grafana HTTP API.

### Why This Matters

- The old stats could look stable while lying about the actual weighted result.
- The position detail deep link previously passed `positionId`, but the main position evidence table ignored it.
- A visible dashboard variable that does nothing is not “future flexibility”; it is operator bait.

## Durable Notes Updated

- [Agent Workflow](../reference/agent-workflow.md)
- [2026-04-10 Grafana Dashboard Plan](../decisions/2026-04-10-grafana-dashboard-plan.md)
