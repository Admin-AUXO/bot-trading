---
name: "docker-ops"
description: "Workflow for Docker, compose, container runtime, deployment scripts, and environment handling with an emphasis on reproducibility and operational safety."
---

# Docker Ops

Use this skill for container and deployment work.

## Goals
- Keep runtime and build steps reproducible.
- Minimize hidden environment coupling.
- Prefer explicit ports, volumes, health checks, and startup sequencing.
- Surface rollback and operational risks.
- For this repo, preserve the invariant that the backend container bootstraps tables and SQL views before it is considered healthy, and the dashboard waits for backend health before starting.

## Preferred Inputs
- Dockerfiles, compose files, deployment docs, env examples, and logs.
