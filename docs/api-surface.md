# API Surface

Purpose: document the real HTTP boundary, including where the dashboard proxy is mandatory and where the dashboard bypasses it.

## Entry Points

- Backend API: [`trading_bot/backend/src/api/server.ts`](../trading_bot/backend/src/api/server.ts)
- Dashboard proxy: [`trading_bot/dashboard/app/api/[...path]/route.ts`](../trading_bot/dashboard/app/api/[...path]/route.ts)

Transport model:

- Backend serves `GET /health` plus `GET|POST /api/*`.
- The proxy maps dashboard `/api/<path>` to backend `/api/<path>`.
- Browser-facing writes should use the proxy so the control secret can be injected automatically.
- Server-rendered dashboard pages currently call the backend directly with `serverFetch()` and `API_URL`; if you add a server-side write path, it will not get proxy auth injection for free.

## Read Routes

- `GET /health`: backend health plus current `tradeMode`
- `GET /api/status`: runtime snapshot, current entry-gate state, settings, latest candidates, latest fills, provider daily summary, and Birdeye monthly budget pacing
- `GET /api/candidates?limit=`: candidates ordered by `discoveredAt DESC`, max `200`
- `GET /api/positions?limit=`: positions with fills included, ordered by `openedAt DESC`, max `200`
- `GET /api/fills?limit=`: fills ordered by `createdAt DESC`, max `500`
- `GET /api/provider-usage`: latest `ApiEvent` rows, fixed limit `250`
- `GET /api/provider-payloads?limit=&provider=&endpoint=&entityKey=`: raw provider payloads ordered by `capturedAt DESC`, max `500`
- `GET /api/snapshots?limit=&mint=&trigger=&candidateId=`: token snapshots ordered by `capturedAt DESC`, max `500`
- `GET /api/settings`: validated merged runtime settings
- `GET /api/views/:name`: SQL view rows, allowlisted only, hard limit `500`

`GET /api/status` now also carries:

- `entryGate.dailyRealizedPnlUsd` and `entryGate.consecutiveLosses` so the desk can see why the daily guard is active
- `providerBudget` with current-month Birdeye used units, projected pace, and per-lane budget buckets (`discovery`, `evaluation`, `security`, `reserve`)

## Write Routes

- `POST /api/settings`: accepts `Partial<BotSettings>`, merges against current settings, then validates the full result
- `POST /api/control/pause`
- `POST /api/control/resume`
- `POST /api/control/discover-now`
- `POST /api/control/evaluate-now`
- `POST /api/control/exit-check-now`

Settings mutation rules:

- `tradeMode` cannot change while open positions exist
- `capital.capitalUsd` cannot change while open positions exist
- The dashboard UI only edits capital, filters, and exits; cadence is exposed read-only in the UI even though the API can validate it

## Auth Boundary

- `/api/control/*` requires `x-control-secret` when `CONTROL_API_SECRET` is configured
- `POST /api/settings` also requires `x-control-secret` when `CONTROL_API_SECRET` is configured
- `GET /api/settings` and the read routes stay unauthenticated
- The dashboard proxy injects `x-control-secret` on non-`GET` and non-`HEAD` requests using `CONTROL_SECRET` or `CONTROL_API_SECRET`

## SQL View Allowlist

`GET /api/views/:name` only exposes the views below. If you add a new view, update both the SQL file and this allowlist in `server.ts`.

- `v_runtime_overview`
- `v_candidate_funnel_daily`
- `v_position_performance`
- `v_api_provider_daily`
- `v_api_endpoint_efficiency`
- `v_raw_api_payload_recent`
- `v_token_snapshot_enriched`
- `v_candidate_reject_reason_daily`
- `v_snapshot_trigger_daily`
- `v_position_exit_reason_daily`
- `v_runtime_settings_current`
- `v_candidate_latest_filter_state`
