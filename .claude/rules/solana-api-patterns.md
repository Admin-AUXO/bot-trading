# Solana API Patterns

## Helius

### Client Setup
- Use `helius-sdk` for: `getTransactionsForAddress`, `getAssetBatch`, `getAsset`
- Raw Helius RPC for everything else — not the SDK
- One shared `Helius` instance initialized in `src/services/helius.ts`

### Rate Limits & Circuit Breaker
- 30 RPM global sliding window across all Helius calls — `src/utils/rate-limiter.ts`
- Circuit breaker: 3 failures / 10s → open (30s cooldown) → half-open probe
- Webhooks CB: 5 failures / 60s → open (120s cooldown)
- Deduplication: `src/utils/api-call-buffer.ts` — same token/wallet fetched concurrently = one RPC call

### Webhooks / WebSocket
- Heartbeat ping every 30s — missing pong = reconnect
- Reconnect with exponential backoff: 1s, 2s, 4s, 8s, max 30s
- On reconnect: replay from last known signature (Helius supports this)
- Failed webhook events → BullMQ DLQ, never dropped
- `logger.warn` after 3 consecutive reconnects

### Retries
- Retryable: `ECONNRESET`, `ETIMEDOUT`, `429`, `503`
- Non-retryable: `400`, `401`, `404`, `insufficient funds`
- Pattern: immediate → 500ms → 2s → give up + log

## Birdeye

### Usage
- Market data only: OHLCV, token overview, price, volume, top traders
- Separate rate limit budget — do not share Helius rate limiter
- Circuit breaker: 5 failures / 30s → open (60s cooldown)
- Wallet endpoints capped at 30 RPM

### Response Fields
- All price/volume fields are floats — validate for `NaN` and `Infinity` before use
- `priceChange24h` can be null for new tokens — handle null explicitly

## Jupiter

### Quote API
- Always use `quoteApi.getQuote()` — never construct quote URLs manually
- Validate `priceImpactPct` before executing — reject if above strategy-specific threshold
- `routePlan` can be empty for illiquid tokens — check before accessing `[0]`

### Swap Execution
- **Never retry execute** — not idempotent; retry = potential double-spend
- Circuit breaker for execute: 2 failures / 10s → open (60s cooldown) — conservative by design
- Slippage BPS default: 500 (5%) — strategies may override per their risk profile
- Always check `outAmount` in response — low liquidity can produce dust outputs

### Fee / Priority Fees
- Use `getPriorityFeeEstimate` from Helius before submitting any transaction
- Jito bundles for MEV-sensitive trades — tip account list fetched fresh per bundle

## Token Address Validation
- Before any DB write or trade execution: validate address is a valid base58 Solana pubkey
- `PublicKey.isOnCurve(address)` is NOT sufficient — use `new PublicKey(address)` in try/catch
- Reject addresses that are system program, token program, or known burn addresses

## Amount / Price Sanity Checks
Before passing to trade execution, verify:
- `amount > 0` and `!isNaN(amount)` and `isFinite(amount)`
- `price > 0` and `!isNaN(price)` and `isFinite(price)`
- `amountToken` in sell calls ≤ `position.remainingToken`
