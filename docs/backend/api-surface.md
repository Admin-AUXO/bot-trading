# API Surface

The browser should hit the dashboard proxy. Direct backend route knowledge still matters for server work, tests, and debugging.

## Entry Point

- Route registration: `trading_bot/backend/src/api/server.ts`
- Route groups: `trading_bot/backend/src/api/routes/`

## Route Groups

### `/api/health`

- `GET`
- Public health check
- Returns status, active trade mode, and process uptime

### `/api/overview`

- `GET /`
- Runtime-scope only
- Rejects `mode` or `profile` that do not match the active execution lane
- Returns open positions, regime, quota snapshots, today's lane summary, and scope

- `GET /api-usage`
- Service totals are global for the selected window
- `mode` and `profile` only narrow endpoint rows, not service-level monthly totals

### `/api/control`

- Public reads:
  `GET /state`, `GET /heartbeat`, `GET /config`
- Authenticated writes:
  `POST /pause`, `POST /resume`, `POST /reset-daily`, `POST /manual-entry`, `POST /reconcile-wallet`
- `manual-entry` still runs through `RiskManager.canOpenPosition`
- `manual-exit` and sell execution still use the shared execution path
- `reconcile-wallet` returns `400` outside `LIVE`

### `/api/positions`

- `GET /`
- `GET /history`
- `POST /:id/manual-exit` requires bearer auth

### `/api/trades`

- `GET /`
- `GET /signals`

Signals do not carry trade-source metadata the same way executed fills do. Keep UI copy honest.

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

Some analytics are lane-scoped. Some are global feeds. The dashboard labels that on purpose.

### `/api/profiles`

- `GET /`
- `GET /results-summary`
- `GET /:name/results`
- Authenticated writes:
  `POST /`, `PUT /:name`, `POST /:name/toggle`, `DELETE /:name`

Key toggle rule:

- activating a profile in the same mode as the active runtime may switch the runtime
- switching is blocked if open positions still exist in that mode on another profile

## Auth Boundary

- Backend bearer middleware: `backend/src/api/middleware/auth.ts`
- Dashboard proxy injects bearer auth for mutating routes and `/api/stream`
- Browser-side privileged actions should go through `dashboard/app/api/[...path]/route.ts`
- Direct backend calls bypass the dashboard operator-session layer

## Cache Notes

- Most read routes use short TTL cache middleware
- Control writes call cache invalidation helpers so dashboard reads refresh quickly
