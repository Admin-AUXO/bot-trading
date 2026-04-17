---
name: grafana
description: Use when planning, editing, or validating the repo-owned Grafana portfolio — dashboard jobs, panel changes, alerts, and generator refactors.
allowed-tools: Read, Grep, Glob, Bash
---

# Grafana

## Use when

- planning a new dashboard or redesigning an existing one
- editing `trading_bot/grafana/` generator modules or alerting rules
- validating the provisioned portfolio after changes

## Read first

- `notes/reference/index.md`
- `notes/reference/grafana-portfolio.md`
- `notes/decisions/2026-04-10-grafana-dashboard-plan.md`

## Planning rules (do this before touching code)

- Start with the dashboard's job — what decision does it drive, in under two minutes.
- Separate live monitoring, historical analytics, and RCA unless there's a hard reason to mix.
- Declare required filters, default time range, and drill paths up front.
- Name comparisons explicitly: prior period, prior config, cohort vs cohort.
- Flag any upstream SQL / history gaps as blocking — do not paper over with Grafana transforms.

## Source of truth (portfolio maintenance)

- generator entrypoint: `trading_bot/grafana/scripts/build-dashboards.mjs`
- shared helpers: `trading_bot/grafana/src/dashboard-generator/core.mjs`
- definitions: `scorecards.mjs`, `operations.mjs`, `analytics.mjs`, `research.mjs`
- emitted JSON: `trading_bot/grafana/dashboards/**` — never hand-edit

## Edit workflow

1. Identify the dashboard job being changed (executive, analyst, live, telemetry, candidate, position, config, source, research).
2. Edit the generator module, not emitted JSON.
3. Keep filters multi-select unless the decision surface needs a single active value.
4. Keep `mint`, `symbol`, and row IDs as contains-search.
5. Remove redundant stats before adding new charts; add panel descriptions where operators need context.
6. Use dashboard links + panel-context pivots to preserve time range + variables.
7. Regenerate: `cd trading_bot/grafana && node scripts/build-dashboards.mjs`
8. Validate: `node --check trading_bot/grafana/scripts/build-dashboards.mjs`, then check provisioned output via Grafana API/browser if local Grafana is up.

## Alerting rules

- Alert on symptoms first, not raw infrastructure noise.
- Use pending periods; keep cardinality low.
- Required annotations: `summary`, `description`, `runbook_url`, `__dashboardUid__`, `__panelId__`.
- Provision in repo — no ad-hoc browser-only rules.

## Feature bias

- Prefer: dashboard links, panel-context pivots, panel descriptions, annotations, version-controlled provisioning.
- Caution: library panels (only if contract truly repeats), query/resource caching (only if edition + freshness allow).

## Failure modes

- charts before dashboard jobs; mixed monitoring/analytics/RCA; filters as afterthought; transforms hiding missing data models.
