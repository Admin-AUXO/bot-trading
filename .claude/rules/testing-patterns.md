# Testing Patterns

## Test Location & Naming
- Unit tests: `src/**/*.test.ts` co-located with source files
- Integration tests: `tests/integration/` — require real DB, never mock
- Test file naming: `<module>.test.ts` (e.g., `risk-manager.test.ts`)
- Run with: `npx vitest` or `npx jest` from `trading_bot/`

## External API Mocks
- Never call live Helius/Birdeye/Jupiter in any test — mock at the service module level
- Mock `src/services/helius.ts`, `src/services/birdeye.ts`, `src/services/jupiter.ts`
- Prisma: use a real test DB (`DATABASE_URL` pointing to test schema) — mock DB tests mask migration failures
- BullMQ: use in-memory queue or test Redis instance

## Required Edge Cases Per Module

**`src/core/risk-manager.ts`**
- `canOpenPosition` with 5 open AUTO positions → `{ allowed: false }`
- `canOpenPosition` with 5 positions but all MANUAL → `{ allowed: true }` (manuals don't count)
- `getPositionSize` when daily drawdown is at limit → returns 0 or throws
- `getPositionSize` in RISK-OFF regime → returns 0
- `reservePosition` / `releasePosition` pairing — verify no double-reserve possible

**`src/core/exit-monitor.ts`**
- Stop-loss trigger at exact threshold (not off-by-one)
- Time-stop fires after strategy-specific duration
- Tranche 1 → Tranche 2 → Tranche 3 sequencing
- Position already closed when exit fires → no double-sell

**`src/core/trade-executor.ts`**
- `DRY_RUN=true` → no Jupiter swap call, DB write still happens
- `DRY_RUN=false` → Jupiter swap called exactly once
- DB write on every execution path, including failures
- `reservePosition` released in `finally` even if swap throws

**`src/utils/circuit-breaker.ts`**
- Closed → Open after failure threshold
- Open → rejects immediately without calling wrapped function
- Half-open probe: success → Closed, failure → back to Open

## Test Data Conventions
- Never hardcode mainnet token addresses — use `TEST_TOKEN_ADDRESS = 'So11111111111111111111111111111111111111112'`
- Prices: use realistic values (0.0001–10 SOL), not round numbers like 1.0
- Wallet addresses: use deterministic test fixtures, not random
- Always test both `DRY_RUN=true` and `DRY_RUN=false` paths in executor tests

## What NOT to Test
- Exact log output — test behavior, not log messages
- Prisma query structure — test the result, not the SQL
- Timer internals — mock `Date.now()` and `setTimeout` rather than waiting
