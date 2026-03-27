# Git Workflow

## Commit Format
Conventional commits — scope is optional but useful for large repos:

| Prefix | When |
|--------|------|
| `feat:` | new feature or strategy behavior |
| `fix:` | bug fix |
| `perf:` | measurable performance improvement |
| `refactor:` | restructure without behavior change |
| `test:` | adding or fixing tests |
| `docs:` | documentation only |
| `chore:` | build, deps, config — no production code change |
| `db:` | Prisma schema or migration changes |
| `ui:` | dashboard-only changes |
| `infra:` | Docker, CapRover, deployment config changes |

Examples:
```
feat: log skipped signals to DB when max positions reached
fix: circuit breaker not resetting after Birdeye timeout
db: add tradeSource enum and index on Position.status
perf: deduplicate Helius RPC calls via api-call-buffer
ui: add skipped signals tab with manual entry to positions page
```

## Branches
- `main` — production, protected
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `db/<name>` — schema/migration changes (always branch for DB work)
- `ui/<name>` — dashboard-only changes
- `infra/<name>` — Docker/deployment changes

## Pre-Commit Checklist
1. `npm run typecheck` from `trading_bot/` — must pass
2. `cd dashboard && npx tsc --noEmit` if dashboard files changed — must pass
3. No new `console.log` — use logger
4. No hardcoded secrets or wallet addresses
5. DB changes: migration file present + seed updated if needed
6. After any `schema.prisma` change: `npx prisma generate` run before typecheck

## Schema Change Protocol
Always use a branch (`db/<name>`):
1. Edit `prisma/schema.prisma`
2. `npx prisma generate` — regenerates client (required before tsc)
3. `npx prisma migrate dev --name <migration-name>` — creates migration file
4. Verify migration SQL is safe (no `NOT NULL` without default on existing table)
5. Update `prisma/seed.ts` if new required records exist
6. Typecheck passes → merge
