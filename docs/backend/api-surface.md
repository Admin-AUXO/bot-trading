# API Surface

Browsers should hit the dashboard proxy. Direct backend route knowledge still matters for server work, tests, and debugging.

## Entry Point

- route registration: `trading_bot/backend/src/api/server.ts`
- route groups: `trading_bot/backend/src/api/routes/`

## Route Groups

### `/api/health`

- `GET`
- public health check
- returns status, active trade mode, and process uptime

### `/api/overview`

- `GET /`
- runtime-scope only
- rejects `mode` or `profile` that do not match the active execution lane
- returns open positions, regime, quota snapshots, today’s lane summary, and scope

- `GET /api-usage`
- service totals stay global for the selected window
- `mode` and `profile` only narrow endpoint rows

### `/api/control`

- public reads: `GET /state`, `GET /heartbeat`, `GET /config`
- authenticated writes: `POST /pause`, `POST /resume`, `POST /reset-daily`, `POST /manual-entry`, `POST /reconcile-wallet`
- `manual-entry` still goes through `RiskManager.canOpenPosition`
- `manual-exit` lives under `POST /api/positions/:id/manual-exit` and still uses the shared execution path
- `reconcile-wallet` returns `400` outside `LIVE`

### `/api/positions`

- `GET /`
- `GET /history`
- `POST /:id/manual-exit` requires bearer auth

### `/api/trades`

- `GET /`
- `GET /signals`

Signals do not carry trade-source metadata the same way executed fills do.

### `/api/analytics`

- `GET /daily`
- `GET /strategy`
- `GET /capital-curve`
- `GET /regime-history`
- `GET /would-have-won`
- `GET /wallet-activity`
- `GET /graduation-stats`
- `GET /pnl-distribution`
- `GET /execution-quality`

Some analytics are lane-scoped. Some are global feeds. The dashboard labels that split on purpose.

### `/api/profiles`

- `GET /`
- `GET /results-summary`
- `GET /:name/results`
- authenticated writes: `POST /`, `PUT /:name`, `POST /:name/toggle`, `DELETE /:name`

Key toggle rule:

- activating a profile in the same mode as the active runtime may switch runtime
- switching is blocked if open positions still exist in that mode on another profile

## Auth Boundary

- backend bearer middleware: `backend/src/api/middleware/auth.ts`
- dashboard proxy injects bearer auth for mutating routes and `/api/stream`
- browser-side privileged actions should go through `dashboard/app/api/[...path]/route.ts`
- direct backend calls bypass the dashboard operator-session layer

## Cache Notes

- most read routes use short TTL cache middleware
- control writes call cache invalidation helpers so dashboard reads refresh quickly
