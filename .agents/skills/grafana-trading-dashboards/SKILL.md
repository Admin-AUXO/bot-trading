---
name: "grafana-trading-dashboards"
description: "Use only when the task explicitly asks to restore, audit, or reintroduce a Grafana path for this repo. The current app does not ship Grafana assets."
---

# Grafana Trading Dashboards

This repo does not currently ship Grafana assets.

## Workflow

- Do not create or expand a Grafana path unless the task is explicitly about restoring that surface.
- Prefer the Next.js dashboard and repo-owned SQL views for the current app.
- If Grafana is reintroduced, document the new files, startup contract, and data sources in `docs/` before treating it as a normal surface.
