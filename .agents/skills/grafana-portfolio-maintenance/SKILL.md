---
name: grafana-portfolio-maintenance
description: use when the task is to update the provisioned Grafana dashboard portfolio, refactor the generator, apply current Grafana dashboard or alerting best practices, or validate the local Grafana service after dashboard changes
---

# Grafana Portfolio Maintenance

Use this when you are changing the repo-owned Grafana portfolio under `trading_bot/grafana/`.

## Read First

1. `notes/reference/index.md`
2. `notes/reference/grafana-portfolio.md`
3. `notes/decisions/2026-04-10-grafana-dashboard-plan.md`

If the task depends on current Grafana guidance, read the official docs first:

- dashboard best practices
- alerting best practices
- only the specific feature docs you actually plan to use

## Source Of Truth

- generator entrypoint: `trading_bot/grafana/scripts/build-dashboards.mjs`
- shared helpers: `trading_bot/grafana/src/dashboard-generator/core.mjs`
- dashboard definitions:
  - `scorecards.mjs`
  - `operations.mjs`
  - `analytics.mjs`
  - `research.mjs`
- emitted JSON: `trading_bot/grafana/dashboards/**`

Do not hand-edit emitted dashboard JSON unless the generator is being retired.

## Workflow

1. Confirm which dashboard job is being changed:
   executive, analyst, live monitor, telemetry, candidate, position, config, source, or research.
2. Prefer changing the generator modules, not the emitted JSON.
3. Keep categorical filters multi-select unless the decision surface truly needs one active value.
4. Keep `mint`, `symbol`, and row IDs as contains search, not exact-match text traps.
5. Remove redundant stats before adding new charts.
6. Add panel descriptions when a panel needs operator context.
7. Use dashboard links and panel context to preserve time range and variables across pivots.
8. Regenerate dashboards with:

```bash
cd trading_bot/grafana
node scripts/build-dashboards.mjs
```

9. Validate:

```bash
node --check trading_bot/grafana/scripts/build-dashboards.mjs
```

10. If local Grafana is up, verify the provisioned portfolio through the Grafana API or browser before finishing.

## Alerting Rules

When adding alert rules, follow the official Grafana guidance:

- alert on symptoms first, not raw infrastructure noise
- use pending periods to avoid flapping
- keep cardinality low
- include clean labels and annotations

Preferred annotations:

- `summary`
- `description`
- `runbook_url`
- `__dashboardUid__`
- `__panelId__`

Use repo-owned provisioning for alert rules when possible. Do not create ad hoc browser-only rules and call that done.

## Feature Bias

Prefer these Grafana features in this repo:

- dashboard links and panel-context pivots
- panel descriptions
- annotations where timeline context matters
- version-controlled provisioning

Be cautious with these:

- library panels
  useful only if the same panel contract truly repeats across dashboards
- query and resource caching
  only use when the deployment edition and freshness requirements actually support it
- reporting or shared dashboards
  useful, but not part of the current local OSS-first workflow by default

## Durable Updates

- update `notes/reference/grafana-portfolio.md` when the portfolio contract changes
- update `notes/decisions/2026-04-10-grafana-dashboard-plan.md` when the decision rules change
- trim repeated procedure from notes into this skill instead of rewriting the same runbook every session
