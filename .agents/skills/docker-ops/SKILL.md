---
name: "docker-ops"
description: "Workflow for Docker, compose, deployment scripts, and container runtime handling with reproducibility and operational safety."
---

# Docker Ops

Use this skill for Dockerfiles, compose flows, env wiring, and runtime startup behavior.

## Required Pre-Read
- `docs/README.md`
- `docs/operations/bootstrap-and-docker.md`
- `docs/architecture/backend-runtime.md`
- `docs/data/prisma-and-views.md` when DB bootstrap or views are involved

## Rules

- Prefer explicit ports, volumes, health checks, and startup sequencing.
- Keep build and runtime assumptions reproducible.
- Surface rollback and operational risks, not just syntax fixes.
- In this repo, `docker-compose.yml` is local infra only. The full stack lives in `trading_bot/docker-compose.prod.yml`.
- Preserve the real prod sequence: `db-setup` runs `npm run db:setup`, backend waits for `db-setup`, dashboard waits for backend health.
- If container ports or health checks change, update compose, env docs, and health probes together.
- If startup order, env expectations, or compose behavior changes, update the matching docs in the same pass.

## Inputs

- Dockerfiles
- compose files
- env templates
- startup docs
- runtime logs
