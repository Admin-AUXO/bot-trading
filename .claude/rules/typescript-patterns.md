# TypeScript Patterns

## Module System
- ESM only — all relative imports need `.js` extension: `import { x } from './module.js'`
- No `require()` — use dynamic `import()` for conditional loading only
- Barrel exports (`index.ts`) are fine for public APIs but not internal modules

## Logging
- Always `src/utils/logger.ts` (pino) — never `console.log/warn/error`
- Structured fields first, message second: `logger.info({ tokenAddress, amount }, 'Trade executed')`
- Log levels: `debug` verbose paths, `info` meaningful events, `warn` recoverable degradation, `error` failures
- Never log raw error objects — use `err.message`: `logger.error({ err: err.message }, 'fetch failed')`
- Child logger per module: `const log = createChildLogger('positions')`

## Types
- Explicit return types on all exported functions
- `unknown` over `any` everywhere; narrow with type guards before use
- Domain types in `src/utils/types.ts` — Prisma enum re-exports live there too
- `Decimal` fields from Prisma must be converted with `Number()` before sending in API responses
- `as Type` casts only at dependency injection boundaries (e.g. router deps pattern) — nowhere else

## Async
- `async/await` over `.then()` chains
- `Promise.all()` for independent parallel calls; `await` sequentially for dependent ones
- No floating promises — every `promise` must be `await`ed or `.catch()`ed
- Unhandled rejections crash the bot — always attach an error handler

## Error Handling
- External API calls: try/catch + circuit breaker — never naked `fetch/axios`
- Strategy/service boundary: catch, log with structured context, continue — don't bubble to main
- Typed error classes for domain errors: `InsufficientFundsError`, `RateLimitError`, `CircuitOpenError`
- Never swallow errors silently: at minimum `log.warn({ err }, 'context')`

## Performance
- `src/utils/api-call-buffer.ts` for request deduplication — same token/wallet fetched concurrently → one RPC call
- Rate limiter (`src/utils/rate-limiter.ts`) wraps all Helius and Birdeye calls
- CPU-heavy work (wallet scoring, stats aggregation) → worker threads via `src/utils/worker-pool.ts`
- No synchronous `JSON.parse` on large payloads in the event loop

## Testing
- Edge cases on all risk/position calculation: zero balance, max positions hit, drawdown limit
- Never call live APIs in tests — mock Helius, Birdeye, Jupiter
- `npm run typecheck` must pass before committing — run it
- Dashboard has no typecheck script: `cd dashboard && npx tsc --noEmit`
