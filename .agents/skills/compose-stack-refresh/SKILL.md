---
name: "compose-stack-refresh"
description: "Use when the user wants to rebuild, recreate, or refresh Docker Compose containers in this repo, especially after backend env, dashboard, bot, Grafana, n8n, or Obsidian changes."
---

# Compose Stack Refresh

## Use When

- the user asks to update or restart Docker containers in this repo
- compose env files may be stale after editing `trading_bot/backend/.env`
- backend, dashboard, or compose-facing assets changed and the running containers need a rebuild

## Default Path

- Run `cd trading_bot && ./scripts/update-compose-stack.sh`
- That syncs compose env files, validates compose config, rebuilds `db-setup`, `bot`, and `dashboard`, then force-recreates those services

## Common Variants

- Dashboard only: `cd trading_bot && ./scripts/update-compose-stack.sh --service dashboard`
- Bot plus dashboard: `cd trading_bot && ./scripts/update-compose-stack.sh --service bot --service dashboard`
- Include Grafana with the app stack: `cd trading_bot && ./scripts/update-compose-stack.sh --full-stack`
- n8n sidecar: `cd trading_bot && ./scripts/update-compose-stack.sh --include-automation --service n8n`
- Obsidian sidecar: `cd trading_bot && ./scripts/update-compose-stack.sh --include-notes --service obsidian`
- Build without recreation: `cd trading_bot && ./scripts/update-compose-stack.sh --build-only`

## Rules

- Keep the app startup chain intact: `postgres -> db-setup -> bot -> dashboard`
- Do not skip compose env sync unless you know container env is already current
- After refresh, inspect `docker compose ps` and run the smallest health check that matches the changed service
- If this workflow changes, update `notes/reference/bootstrap-and-docker.md` in the same pass
