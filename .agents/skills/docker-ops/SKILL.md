---
name: docker-ops
description: Use for any Docker/Compose work in this repo — Dockerfiles, env wiring, startup order, health checks, container refreshes, and reproducible local bootstrap.
allowed-tools: Read, Grep, Glob, Bash
---

# Docker Ops

## Use when

- editing Dockerfiles, compose files, env wiring, entrypoints, or healthchecks
- rebuilding/refreshing running containers after backend, dashboard, Grafana, n8n, or Obsidian changes
- auditing the stack for env bleed, hidden host assumptions, or broken startup order

## Read first

- `notes/reference/bootstrap-and-docker.md`
- `notes/reference/prisma-and-views.md` (when DB bootstrap or views matter)

## Refresh path (running containers)

Default: `cd trading_bot && node ./scripts/update-compose-stack.mjs`
Helper syncs env files, rebuilds only changed services, force-recreates only when image/env changed.

| Variant | Command |
|---|---|
| Single service | `--service <name>` (e.g. `dashboard`, `bot`, `n8n`, `obsidian`) |
| Bot + dashboard | `--service bot --service dashboard` |
| Full stack incl. Grafana | `--full-stack` |
| Build only, no recreate | `--build-only` |
| PowerShell | `.\scripts\update-compose-stack.ps1 --service dashboard` |

After refresh: `docker compose ps` + smallest health probe for the touched service.

## Rules

- Preserve startup chain: `postgres → db-setup → bot → dashboard`. Downstream waits on health, not process start.
- Keep service env scopes narrow; no secret bleed across services.
- Prefer reproducible builds, explicit deps, image-size hygiene, rollback safety.
- Surface operational risk (data loss, port collisions, host assumptions) before style fixes.
- If startup order, env contracts, or compose behavior change, update `notes/reference/bootstrap-and-docker.md` in the same pass.
