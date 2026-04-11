---
type: reference
status: active
area: grafana
date: 2026-04-11
source_files:
  - trading_bot/grafana/scripts/build-dashboards.mjs
  - trading_bot/grafana/src/dashboard-generator/core.mjs
  - trading_bot/grafana/src/dashboard-generator/scorecards.mjs
  - trading_bot/grafana/src/dashboard-generator/operations.mjs
  - trading_bot/grafana/src/dashboard-generator/analytics.mjs
  - trading_bot/grafana/src/dashboard-generator/research.mjs
  - trading_bot/grafana/dashboards
  - trading_bot/grafana/provisioning/datasources/postgres.yaml
  - trading_bot/docker-compose.yml
graph_checked:
next_action: Add repo-owned alerting provisioning once the team decides the first symptom-based paging targets and receiver strategy.
---

# Grafana Portfolio

Purpose: document the repo-owned Grafana portfolio, generator layout, and the current official-doc guidance that should shape dashboard and alerting changes.

## Portfolio

Provisioned dashboards:

- `Executive Scorecard`
- `Analyst Insights Overview`
- `Telemetry & Provider Analytics`
- `Live Trade Monitor`
- `Candidate & Funnel Analytics`
- `Position & PnL Analytics`
- `Config Change Impact & RCA`
- `Source & Cohort Performance`
- `Research & Dry-Run Analysis`

The portfolio is generated, not hand-maintained.

## Source Of Truth

- entrypoint: [`../../trading_bot/grafana/scripts/build-dashboards.mjs`](../../trading_bot/grafana/scripts/build-dashboards.mjs)
- shared generator helpers: [`../../trading_bot/grafana/src/dashboard-generator/core.mjs`](../../trading_bot/grafana/src/dashboard-generator/core.mjs)
- domain modules:
  - [`../../trading_bot/grafana/src/dashboard-generator/scorecards.mjs`](../../trading_bot/grafana/src/dashboard-generator/scorecards.mjs)
  - [`../../trading_bot/grafana/src/dashboard-generator/operations.mjs`](../../trading_bot/grafana/src/dashboard-generator/operations.mjs)
  - [`../../trading_bot/grafana/src/dashboard-generator/analytics.mjs`](../../trading_bot/grafana/src/dashboard-generator/analytics.mjs)
  - [`../../trading_bot/grafana/src/dashboard-generator/research.mjs`](../../trading_bot/grafana/src/dashboard-generator/research.mjs)
- emitted JSON: `../../trading_bot/grafana/dashboards/**`

Rule:

- edit the generator modules
- regenerate the JSON
- do not hand-edit emitted dashboards unless the generator itself is being replaced

## Variable Rules

- broad selectors before narrow selectors
- categorical filters are multi-select by default
- text filters for `mint`, `symbol`, and row ids use contains search
- keep only shallow dependency chains
  current example: `provider -> endpoint`
- preserve time range and variable values in dashboard links

Common variables now in use:

- `provider`
- `endpoint`
- `errorFamily`
- `source`
- `configVersion`
- `mint`
- `symbol`
- `positionId`
- `trigger`
- `candidateStatus`
- `rejectReason`
- `positionStatus`
- `exitReason`
- `exitProfile`
- `daypart`
- `securityRisk`
- `interventionBand`
- `runId`
- `runStatus`

## Dashboard Best-Practice Takeaways

Confirmed from the official Grafana dashboard best-practices docs on 2026-04-11:

- dashboards should stay scoped to a real decision surface instead of becoming panel landfills
- variables, links, and drill-down paths are preferred over panel sprawl
- readability still matters even on dense dashboards
- provisioning and version control are the sane default for durable dashboards

Repo-facing translation:

- no top-of-dashboard filler text panels
- remove redundant stats before adding new charts
- prefer weighted rates and operational ratios over max/min vanity stats
- keep quick links consistent so operators can pivot without rebuilding context
- use panel descriptions when a panel needs extra context

## Alerting Best-Practice Takeaways

Confirmed from the official Grafana alerting best-practices docs on 2026-04-11:

- page on symptoms first, not raw infrastructure chatter
- use confidence and pending time to avoid noisy escalation
- keep alert labels and annotations clear enough for routing and first response

Confirmed from Grafana alert annotation docs on 2026-04-11:

- useful annotations include `summary`, `description`, `runbook_url`, `__dashboardUid__`, and `__panelId__`

Repo-facing translation:

- first repo-owned alert rules should target operator-actionable symptoms such as live-lane staleness, payload-failure spikes, or serious provider degradation
- when alerts land, they should link back to the right dashboard and panel, not just page a human into the void

## Other Grafana Features Worth Knowing

Relevant features from official Grafana docs:

- dashboard links and panel-context pivots
  use now
- annotations
  useful for change markers and alert investigation context
- library panels
  only worth adopting if the same panel contract truly repeats
- reporting and shared dashboards
  available in Grafana docs, but not part of the current repo workflow by default
- query and resource caching
  documented by Grafana, but likely not a fit for the current local OSS-first setup unless edition support and freshness needs are reviewed first

Inference:

- this repo runs `grafana/grafana:12.2.0` from Compose today, so enterprise or cloud-gated features should be treated as opt-in, not assumed baseline behavior

## Validation

Generator check:

```bash
node --check trading_bot/grafana/scripts/build-dashboards.mjs
```

Rebuild:

```bash
cd trading_bot/grafana
node scripts/build-dashboards.mjs
```

Local service:

```bash
cd trading_bot
docker compose up -d grafana
curl -s http://127.0.0.1:3400/api/health
```

Portfolio sanity check can be done through the logged-in Grafana API:

- `/api/search?type=dash-db`
- `/api/dashboards/uid/<uid>`

## Related Notes

- [Reference Index](index.md)
- [Decision - Grafana Dashboard Plan](../decisions/2026-04-10-grafana-dashboard-plan.md)
- [API Surface](api-surface.md)
- [Prisma And Views](prisma-and-views.md)
