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

- Run `cd trading_bot && node ./scripts/update-compose-stack.mjs`
- Default scope is now `bot dashboard`; `db-setup` is pulled in only when Prisma changed or you request it explicitly
- The helper syncs compose env files, rebuilds only changed services, and force-recreates only when the image or container env actually changed

## Common Variants

- Dashboard only: `cd trading_bot && node ./scripts/update-compose-stack.mjs --service dashboard`
- Bot plus dashboard: `cd trading_bot && node ./scripts/update-compose-stack.mjs --service bot --service dashboard`
- Include Grafana with the app stack: `cd trading_bot && node ./scripts/update-compose-stack.mjs --full-stack`
- n8n sidecar: `cd trading_bot && node ./scripts/update-compose-stack.mjs --service n8n`
- Obsidian sidecar: `cd trading_bot && node ./scripts/update-compose-stack.mjs --service obsidian`
- Build without recreation: `cd trading_bot && node ./scripts/update-compose-stack.mjs --build-only`
- PowerShell wrapper: `cd trading_bot; .\scripts\update-compose-stack.ps1 --service dashboard`

## Rules

- Keep the app startup chain intact when Prisma changes: `postgres -> db-setup -> bot -> dashboard`
- Do not skip compose env sync unless you know container env is already current
- After refresh, inspect `docker compose ps` and run the smallest health check that matches the changed service
- If this workflow changes, update `notes/reference/bootstrap-and-docker.md` in the same pass
