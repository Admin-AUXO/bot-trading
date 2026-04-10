---
name: "docker-ops"
description: "Use for Dockerfiles, compose flows, env wiring, health checks, startup order, and container runtime changes where reproducibility and safe rollout matter."
---

# Docker Ops

Use this skill for Dockerfiles, compose flows, env wiring, and runtime startup behavior.

## Read First

- `docs/README.md`
- `docs/bootstrap-and-docker.md`
- `docs/prisma-and-views.md` when DB bootstrap or views are involved

## Workflow

- Prefer explicit ports, volumes, health checks, and startup sequencing.
- Keep build and runtime assumptions reproducible.
- Surface rollback and operational risk, not just syntax fixes.
- In this repo, `trading_bot/docker-compose.yml` is the active compose file.
- Preserve the live startup chain: `postgres` -> `db-setup` -> `bot` -> `dashboard`.
- `db-setup` must remain the place where `npm run db:setup` runs before the bot starts.
- Keep host-run and full-compose assumptions separate in both code and docs.
- If ports, health checks, env expectations, or startup order change, update docs and probes in the same pass.
