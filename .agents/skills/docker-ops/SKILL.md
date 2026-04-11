---
name: "docker-ops"
description: "Use for Dockerfiles, compose flows, env wiring, health checks, startup order, and container runtime changes."
---

# Docker Ops

## Use When

- the task touches Dockerfiles, compose, env wiring, health checks, or startup behavior

## Read First

- `notes/README.md`
- `notes/reference/bootstrap-and-docker.md`
- `notes/reference/prisma-and-views.md` when DB bootstrap or views matter

## Rules

- Prefer explicit ports, env files, health checks, and startup sequencing.
- Preserve the `postgres -> db-setup -> bot -> dashboard` startup chain.
- Keep service env scopes narrow.
- Surface rollback and operational risk, not just syntax fixes.
- Update docs and probes in the same pass when contracts change.
