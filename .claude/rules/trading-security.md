# Trading Bot Security Rules

## Secrets
- Never hardcode API keys, private keys, or seeds — read exclusively via `src/config/` with Zod validation
- Never log wallet addresses with balances, raw API responses, or any field from `process.env` directly
- All env vars validated at startup in `src/config/` — direct `process.env.X` in service files is forbidden
- Never `JSON.stringify(error)` in log statements — stack traces can contain env vars

## External Data
- All Helius/Birdeye/Jupiter responses validated with Zod before use — never assume shape
- Token addresses validated as valid base58 Solana pubkeys before DB write or trade execution
- Price/amount fields checked for `NaN`, `Infinity`, and negative values — all three occur from malformed data
- Never pass unvalidated webhook payload fields into DB writes or trade execution

## Trade Execution Safety
- Every execution path through `risk-manager.ts` — no direct Jupiter swap calls
- `DRY_RUN` flag checked at executor level, not just strategy level
- Position size respects `MAX_POSITIONS=5` and drawdown limits at all times
- Manual trades (`tradeSource: "MANUAL"`) skip position-count checks but still write to DB
- Every trade execution must write to DB — no fire-and-forget
- Never retry `executeSell`/Jupiter execute — not idempotent; retry = potential double-spend

## Database
- No `prisma migrate deploy` on production without a backup
- Raw SQL only via `Prisma.sql` tagged template — zero string interpolation
- Never `$executeRaw` with user-supplied input
- DB connection string must never appear in logs (not even partially)
- Schema changes require a migration file — never modify DB directly

## API / Express
- Control endpoints (`/pause`, `/resume`, `/manual-entry`, `/:id/manual-exit`) require auth before production deploy
- Never return stack traces in API error responses — log internally, return generic message
- CORS must be restricted to dashboard origin — never `*` in production
- Query parameters from `req.query` are always `string | string[] | undefined` — cast and validate before use

## Code Safety
- No `process.exit()` inside strategy or service code — main orchestrator handles shutdown
- No `any` except at dependency-injection boundaries (router deps cast pattern)
- All async errors caught and logged — no unhandled promise rejections
- No `eval`, `Function()`, or dynamic code execution anywhere
