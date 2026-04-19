---
type: session
status: active
area: codex
date: 2026-04-12
source_files:
  - .codex/config.toml
  - notes/reference/tool-routing.md
  - notes/investigations/2026-04-11-mcp-surface-audit.md
  - notes/sessions/index.md
graph_checked:
next_action: If GitHub auth or Grafana auth changes, update the MCP config instead of compensating in prompts.
---

# Session - GitHub And Grafana MCP Wiring

## What Changed

- Added `github` MCP to `.codex/config.toml` using GitHub's official Docker image with a narrowed toolset: `repos,issues,pull_requests,actions`.
- Added `grafana` MCP to `.codex/config.toml` using Grafana's official Docker image in `stdio` mode.
- Pointed the Grafana MCP at `http://host.docker.internal:3400` so the Dockerized MCP can reach the local Grafana container on Docker Desktop.
- Enabled the `runtime_metrics` feature flag in repo config as the nearest real Codex CLI status-line improvement exposed by the installed CLI.

## Why

- GitHub work in this repo is frequent enough to justify a first-class MCP surface.
- Grafana work is already a real repo concern, and the Docker Desktop host alias avoids the usual `localhost-from-inside-a-container` mistake.
- The current Codex CLI exposes `runtime_metrics` as a feature flag but no explicit status-bar config key, so that is the correct minimal status-line improvement instead of imaginary TOML.

## Follow-Up

- `github` still needs `GITHUB_PERSONAL_ACCESS_TOKEN` in the host environment to authenticate.
- `grafana` currently uses the local admin credentials from the repo's compose env. If those rotate, update `.codex/config.toml` to match.

## Durable Notes Updated

- `notes/reference/tool-routing.md`
- `notes/investigations/2026-04-11-mcp-surface-audit.md`
