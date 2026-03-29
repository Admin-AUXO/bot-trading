---
name: "database-safety"
description: "Database and Prisma workflow focused on schema safety, query correctness, schema-and-views-only changes, read patterns, and production-safe reasoning."
---

# Database Safety

Use this skill for schema, SQL, or data-access work.

## Required Pre-Read
- `docs/README.md`
- `docs/data/prisma-and-views.md`
- `docs/operations/bootstrap-and-docker.md`
- `docs/backend/api-surface.md` when route contracts or query shapes are involved

## Goals
- Treat schema and DB rollout changes as high-risk.
- Prefer read-first analysis before proposing writes.
- Check performance, indexes, and data shape implications.
- Surface rollback and compatibility concerns.
- Never create standalone migration files in this repo. Keep schema changes in `trading_bot/backend/prisma/schema.prisma` and rollout SQL in `trading_bot/backend/prisma/views/create_views.sql`.
- In this repo, remember that Prisma schema sync and SQL view rollout are separate steps; the canonical bootstrap is `npm run db:setup`, not `db:push` alone.
- Preserve analytical fidelity in `ApiCall`, `ApiUsageDaily`, `ApiEndpointDaily`, and `BotState.pauseReasons`; budget, scope, and purpose dimensions should stay queryable after schema changes.
- If the Prisma client surface changes, verify with `npm run db:generate` before trusting type errors or route breakage reports.
- If schema, SQL-view shape, or DB-driven behavior changes, update the matching docs in the same pass.

## Preferred Tools
- `postgres` for schema inspection and read-only queries when configured.
- `filesystem` for Prisma schema, SQL views, and seed files.
- `serena` for query callsites and type relationships.
- `context7` for Prisma and database framework behavior.
- `sequential_thinking` for risky schema decisions.

## Output Shape
- Current schema or query behavior.
- Safety risks.
- Minimal safe change.
- Verification steps.
