# Express API Route Patterns (Express 5)

## Router Factory Pattern
All routers use a factory function that accepts typed deps:

```typescript
export function positionsRouter(deps?: { tradeExecutor?: unknown; positionTracker?: unknown }) {
  const router = Router();
  const tradeExecutor = deps?.tradeExecutor as TradeExecutor | undefined;
  // ...
  return router;
}
```

- `unknown` in function signature, cast to concrete type inside — avoids circular dep issues
- Guard optional deps at the handler level: `if (!tradeExecutor) return res.status(503).json(...)`

## Query Parameter Handling
- `req.query.x` is always `string | string[] | undefined` — cast and validate before use
- Numeric params: `const page = Number(req.query.page) || 1`
- Pagination: cap with `Math.min(Number(req.query.limit) || 20, 100)`
- Build `where` objects as `Record<string, unknown>` then add optional filters conditionally

## Response Conventions
- Success: `res.json(data)` (200 implicit)
- Not found: `res.status(404).json({ error: 'resource not found' })`
- Bad request / validation fail: `res.status(400).json({ error: 'message' })`
- Service unavailable (dep missing): `res.status(503).json({ error: 'service not available' })`
- Server error: handled by central error middleware in `server.ts` — never add a generic catch to every handler
- Paginated list: `{ data: [...], total, page, totalPages }`

## Decimal Serialization
- All Prisma `Decimal` fields must be `Number()`-converted before `res.json()` — JSON serializer doesn't handle Prisma Decimal
- Pattern: `...p, amountSol: Number(p.amountSol), entryPriceUsd: Number(p.entryPriceUsd)`

## Error Handling in Handlers (Express 5)
Express 5 natively catches thrown errors and rejected async handlers — no generic try/catch needed:

```typescript
// correct — Express 5 propagates thrown errors to the central handler
router.get('/endpoint', async (req, res) => {
  const data = await db.trade.findMany({ ... });
  res.json(data);
});
```

Only add try/catch when you have specific domain context to log or a non-500 response:

```typescript
// correct — specific handling for a known failure mode
router.post('/:id/manual-exit', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await tradeExecutor.exit(id);
    res.json(result);
  } catch (err) {
    log.error({ err, positionId: id }, 'manual exit failed');
    res.status(500).json({ error: 'exit failed' });
  }
});
```

Central error handler registered after all routes in `server.ts`:
```typescript
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  log.error({ err, method: req.method, path: req.path }, 'unhandled route error');
  res.status(500).json({ error: 'internal server error' });
});
```

- Always use the module-scoped child logger: `const log = createChildLogger('module-name')`
- Never `console.error` in route handlers

## Route Registration (server.ts)
- Routes registered as `/api/<resource>` prefix
- Deps passed at registration time: `app.use('/api/positions', positionsRouter({ tradeExecutor, positionTracker }))`
- New deps on server: add to `startApiServer` signature and `deps` object in `src/index.ts`

## Server Middleware Stack (server.ts)
Order matters — applied in this sequence:
1. `cors()` — allow dashboard origin in dev
2. `helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "same-site" } })` — security headers
3. `compression()` — gzip responses
4. `pinoHttp({ logger })` — HTTP request logging (reuses root pino logger)
5. `express.json()` — body parsing

## Route-Level Caching (`src/api/middleware/cache.ts`)
LRU cache keyed on `req.originalUrl`. Apply to read-only GET endpoints where data doesn't change within the TTL:
```typescript
router.get("/", cacheMiddleware(5_000), async (req, res) => { ... });
router.get("/daily", cacheMiddleware(30_000), async (req, res) => { ... });
router.get("/capital-curve", cacheMiddleware(60_000), async (req, res) => { ... });
```
- `5_000` ms — live-ish endpoints (overview)
- `30_000` ms — strategy/daily analytics
- `60_000` ms — capital curve (changes once per day)
- Never apply to SSE endpoints or mutation handlers

## Skipped Signal Filter Pattern
```typescript
const skipped = req.query.skipped === 'true';
if (skipped) {
  where.passed = false;
  where.rejectReason = 'MAX_POSITIONS';
}
```
- Boolean query params: compare to string `'true'`, not boolean `true`
