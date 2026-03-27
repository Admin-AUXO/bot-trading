# Prisma Patterns (Prisma 7)

## Schema Rules
- Fact tables (Trade, Position, Signal, WalletActivity, GraduationEvent): append-only, never update in place
- Soft-close pattern: `closedAt DateTime?` — null = open/active, set = closed
- Every fact table needs `createdAt DateTime @default(now())` for time-range queries
- Metric tables (DailyStats, RegimeSnapshot, BotState, MarketTick): upsert with `@@unique` on time bucket + identifier
- New `NOT NULL` column on existing table: always provide `@default` — otherwise migration breaks existing rows
- Enum changes require `npx prisma generate` immediately — tsc fails with "no exported member" until regenerated

## Prisma 7 Configuration
The datasource in `schema.prisma` has **no `url` property** — connection is handled by the adapter:

```prisma
datasource db {
  provider = "postgresql"
}
```

Connection string and driver adapter live in `prisma.config.ts` at the project root:

```typescript
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    async adapter(env) {
      return new PrismaPg({ connectionString: env.DATABASE_URL as string });
    },
  },
});
```

## PrismaClient Instantiation (Prisma 7)
Use `PrismaPg` adapter directly — `datasources` option no longer exists on `PrismaClient`:

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// standard singleton (src/db/client.ts)
const adapter = new PrismaPg({ connectionString: config.db.url });
const db = new PrismaClient({ adapter });

// worker threads needing pool limits
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"], max: 2, idleTimeoutMillis: 10_000 }),
});
```

`PrismaPg` accepts a `PoolConfig` object directly — no need to import `Pool` from `pg`.

## Migration Safety
- Always check `prisma migrate diff` before applying to production
- Adding index on large table: use `CREATE INDEX CONCURRENTLY` in raw SQL migration file
- Column rename: 3-step migration — add new → backfill → drop old (never single-step rename)
- Foreign key additions need indexes on both sides
- Never run `prisma migrate deploy` on production without a DB backup

## Query Patterns
- `findMany` without `take`: banned on hot API paths — always paginate with `skip`/`take`
- `omit` to exclude heavy fields without a full `select`: `db.trade.findMany({ omit: { metadata: true } })`
- `select` on all queries that don't need every field — Prisma fetches all columns by default
- Parallel reads: `Promise.all([db.trade.findMany(...), db.position.count(...)])`
- Complex analytics: `prisma.$queryRaw` with `Prisma.sql` tagged template — never string interpolation
- `groupBy` + `_sum/_count/_avg` preferred over raw SQL for portability

## Decimal Handling
- Prisma returns `Decimal` objects for numeric fields — serialize with `Number()` before JSON response
- Pattern for route handlers: `entryPriceUsd: Number(p.entryPriceUsd)`
- Never do arithmetic on raw Decimal objects in TypeScript — convert first

## Client Access
- Import from `src/db/client.js` — never instantiate a new `PrismaClient` in service/strategy files
- One shared client for the whole process — no per-request instantiation
- Exception: worker threads (`src/workers/`) may create their own client with reduced pool size

## Views
- SQL views in `prisma/views/` are the dashboard's data contract — changes are breaking
- `v_dashboard_overview` must stay under 50ms
- `v_daily_pnl`: use `date_trunc('day', "createdAt")` not `CAST(... AS DATE)`
- `v_capital_curve`: window functions for running sums, not correlated subqueries
