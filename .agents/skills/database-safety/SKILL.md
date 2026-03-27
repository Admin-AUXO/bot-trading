---
name: "database-safety"
description: "Database and Prisma workflow focused on schema safety, query correctness, migration caution, read patterns, and production-safe reasoning."
---

# Database Safety

Use this skill for schema, SQL, or data-access work.

## Goals
- Treat schema and migration changes as high-risk.
- Prefer read-first analysis before proposing writes.
- Check performance, indexes, and data shape implications.
- Surface rollback and compatibility concerns.

## Preferred Tools
- `postgres` for schema inspection and read-only queries when configured.
- `filesystem` for Prisma schema, migrations, and SQL views.
- `serena` for query callsites and type relationships.
- `context7` for Prisma and database framework behavior.
- `sequential_thinking` for risky schema decisions.

## Output Shape
- Current schema or query behavior.
- Safety risks.
- Minimal safe change.
- Verification steps.
