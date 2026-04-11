---
name: "database-safety"
description: "Use for Prisma, PostgreSQL, schema, SQL-view, and DB-backed route work where rollout safety and historical correctness matter."
---

# Database Safety

## Use When

- the task touches schema, SQL views, Prisma, or DB-backed routes

## Read First

- `notes/README.md`
- `notes/reference/prisma-and-views.md`
- `notes/reference/bootstrap-and-docker.md`
- `notes/reference/api-surface.md` when route contracts matter

## Rules

- Treat schema and rollout changes as high-risk.
- Never create standalone migration files in this repo.
- Keep schema edits in `trading_bot/backend/prisma/schema.prisma`.
- Keep view edits in `trading_bot/backend/prisma/views/create_views.sql`.
- Treat `npm run db:setup` as the full rollout path.
- Preserve reporting fidelity in evidence tables.

## Deliverable

- current behavior
- safety risks
- minimal safe change
- verification steps
