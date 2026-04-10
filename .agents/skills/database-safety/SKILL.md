---
name: "database-safety"
description: "Use for Prisma, PostgreSQL, schema, SQL-view, and DB-backed route work where safety, rollout order, and historical data correctness matter."
---

# Database Safety

Use this skill for schema, SQL, Prisma client, or DB-backed route work.

## Read First

- `docs/README.md`
- `docs/prisma-and-views.md`
- `docs/bootstrap-and-docker.md`
- `docs/api-surface.md` when route contracts or query shapes matter

## Workflow

- Treat schema and rollout changes as high-risk.
- Prefer read-first analysis before proposing writes.
- Check shape, compatibility, indexing, and reporting impact.
- Never create standalone migration files in this repo.
- Keep schema edits in `trading_bot/backend/prisma/schema.prisma`.
- Keep view edits in `trading_bot/backend/prisma/views/create_views.sql`.
- Remember that Prisma schema sync and SQL-view rollout are separate steps; `npm run db:setup` is the canonical full rollout.
- Preserve analytical fidelity in `ApiEvent`, `RawApiPayload`, `TokenSnapshot`, `Candidate`, `Position`, and `Fill`.
- Prefer extending evidence tables over inventing dashboard-only storage.
- If Prisma client shape changes, run `npm run db:generate` before trusting TypeScript fallout.
- If schema, view shape, or DB-backed behavior changes, update the matching docs in the same pass.

## Output

- Current schema or query behavior.
- Safety risks.
- Minimal safe change.
- Verification steps.
