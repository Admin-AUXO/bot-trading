---
type: session
status: active
area: docker/runtime
date: 2026-04-16
source_files:
  - trading_bot/docker-compose.yml
  - trading_bot/firecrawl/compose.env
  - trading_bot/firecrawl/compose.env.example
  - .codex/config.toml
  - .codex/scripts/install-mcp-config.cjs
  - .codex/scripts/start-firecrawl-mcp.cjs
  - notes/reference/bootstrap-and-docker.md
  - notes/reference/tool-routing.md
  - notes/investigations/2026-04-11-mcp-surface-audit.md
graph_checked:
next_action: If Firecrawl gets wired into the dashboard or bot later, document that contract separately instead of widening the sidecar note.
---

# Session - Firecrawl Sidecar

## Findings / Decisions

- Firecrawl self-hosting is not a single container in practice; upstream expects an API plus Playwright, Redis, RabbitMQ, and a dedicated Postgres service.
- The safest repo fit is an optional `firecrawl` compose profile that stays isolated from the trading app startup chain and database.
- Firecrawl upstream currently publishes its GHCR images under `latest`, so the repo pins the current manifest digests to reduce silent drift.
- The upstream `nuq-postgres` bootstrap expects the default `postgres` database; changing it to `firecrawl` breaks `pg_cron` initialization and leaves the required `nuq.*` tables missing.
- Codex can now reach the local Firecrawl instance through a repo-owned `firecrawl` MCP launcher that defaults to `http://127.0.0.1:3002`; the shared installer enables it in the `research` and `full` MCP profiles, not in the compact baseline.

## What Changed

- Added a `firecrawl` compose profile to `trading_bot/docker-compose.yml` with local-only port binding for the API and a dedicated `firecrawl-backend` network.
- Added `trading_bot/firecrawl/compose.env` and `trading_bot/firecrawl/compose.env.example` for Firecrawl-only settings.
- Updated `notes/reference/bootstrap-and-docker.md` with the new sidecar run mode and verification commands.
- Added `.codex/scripts/start-firecrawl-mcp.cjs`, plus shared config and installer entries so Codex can use the local Firecrawl API as an MCP server.
- Updated `notes/reference/tool-routing.md` and `notes/investigations/2026-04-11-mcp-surface-audit.md` with the Firecrawl MCP routing contract.

## What I Verified

- `cd trading_bot && docker compose --profile firecrawl config`
- Started `docker compose --profile firecrawl up -d firecrawl-playwright firecrawl-redis firecrawl-rabbitmq firecrawl-postgres firecrawl-api`, but the first run was still pulling the large upstream images when this note was updated.

## Remaining Risks

- Upstream Firecrawl image tags are not versioned in GHCR today, so digest refresh is a periodic maintenance task whenever the stack should be upgraded.
- If you enable OpenAI-backed extraction or proxying, you need to populate the Firecrawl-specific env file before expecting those paths to work.
- Healthcheck behavior against `http://127.0.0.1:3002` should be revalidated once the initial image pull completes on this machine.
