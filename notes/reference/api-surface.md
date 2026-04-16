---
type: reference
status: active
area: api
date: 2026-04-15
source_files:
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/services/discovery-lab-service.ts
  - trading_bot/backend/src/services/discovery-lab-market-regime-service.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/backend/src/services/operator-events.ts
  - trading_bot/backend/src/services/runtime-config.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/dashboard/components/dashboard-client.tsx
  - trading_bot/dashboard/app/trading/page.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
  - trading_bot/dashboard/app/api/[...path]/route.ts
graph_checked: 2026-04-13
next_action:
---

# API Surface

Purpose: document the real HTTP boundary, including where the dashboard proxy is mandatory and where the dashboard bypasses it.

## Entry Points

- Backend API: [`../../trading_bot/backend/src/api/server.ts`](../../trading_bot/backend/src/api/server.ts)
- Dashboard proxy: [`../../trading_bot/dashboard/app/api/[...path]/route.ts`](../../trading_bot/dashboard/app/api/[...path]/route.ts)

Transport model:

- Backend serves `GET /health` plus `GET|POST /api/*`.
- The proxy maps dashboard `/api/<path>` to backend `/api/<path>`.
- Browser-facing writes should use the proxy so the control secret can be injected automatically.
- Server-rendered dashboard pages currently call the backend directly with `serverFetch()` and `API_URL`; if you add a server-side write path, it will not get proxy auth injection for free.
- Server-rendered dashboard pages can also emit direct external Grafana links from `GRAFANA_BASE_URL` plus route-specific dashboard UID env vars. There is still no Grafana proxy in this repo even though the repo now ships a local Grafana service in Compose.

## Read Routes

- `GET /health`: backend health plus current `tradeMode`
- `GET /api/status`: runtime snapshot, current entry-gate state, settings, latest candidates, latest fills, provider daily summary, and Birdeye monthly budget pacing
- `GET /api/status`: runtime snapshot, current entry-gate state, settings, latest candidates, latest fills, provider daily summary, Birdeye monthly budget pacing, and backend-owned `adaptiveModel` status
- `GET /api/desk/shell`: compact shell contract for mode, health, primary blocker, last sync, available global actions, and headline counts
- `GET /api/desk/home`: dedicated control-desk body contract for readiness, guardrails, exposure, compact KPI groups (`performance`, `latency`, `runtime`), queue buckets, provider pace, diagnostics strip, backend-owned `adaptiveModel`, and recent event slices. The diagnostics strip must include fresh payload-failure pressure, not just stale-loop warnings.
- `GET /api/desk/events?limit=`: unified operator and system event feed for runtime, provider, control, and settings activity
- `GET /api/operator/candidates?bucket=ready|risk|provider|data`: backend-assigned candidate workbench buckets
- `GET /api/operator/candidates/:id`: candidate detail, backend-built adaptive explanation, snapshot history, and persisted provider payloads
- `GET /api/operator/positions?book=open|closed`: position workbench book, with open positions sorted by backend-computed intervention priority and desk-facing row metrics (`unrealizedPnlUsd`, `returnPct`, `lastFillAt`, `latestExecutionLatencyMs`)
- `GET /api/operator/positions/:id`: position detail, backend-built adaptive explanation, compact `executionSummary`, fill trail, snapshot history, and linked candidate context
- `GET /api/operator/diagnostics`: current-fault diagnostics summary, endpoint burn, and stale-component issues
- `GET /api/operator/discovery-lab/catalog`: discovery-lab pack catalog, active run summary, recent run summaries, available profiles, and known sources; the catalog now includes the retained `Scalp tape + structure` workspace pack plus the three repo-seeded workspace packs, while pack favorites stay browser-local
- `GET /api/operator/discovery-lab/market-regime?runId=`: per-run market-regime snapshot for discovery-lab results and builder guidance, including regime, confidence, factor breakdown, stale flag, and suggested threshold overrides
- `GET /api/operator/discovery-lab/token-insight?mint=`: live provider-backed token enrichment for one result-row mint, including socials, creator/tool links, market pulse, and Birdeye security-derived flags for the full-review modal and trade ticket
- `GET /api/operator/discovery-lab/runs`: recent discovery-lab run summaries, newest first
- `GET /api/operator/discovery-lab/runs/:id`: full persisted discovery-lab run detail, including pack snapshot, thresholds, calibrated live-strategy payload (`strategyCalibration`), backend-owned adaptive winner cohorts and decision bands, report, and captured stdout or stderr
- `GET /api/candidates?limit=`: candidates ordered by `discoveredAt DESC`, max `200`
- `GET /api/positions?limit=`: positions with fills included, ordered by `openedAt DESC`, max `200`
- `GET /api/fills?limit=`: fills ordered by `createdAt DESC`, max `500`
- `GET /api/provider-usage`: latest `ApiEvent` rows, fixed limit `250`
- `GET /api/provider-payloads?limit=&provider=&endpoint=&entityKey=`: raw provider payloads ordered by `capturedAt DESC`, max `500`
- `GET /api/snapshots?limit=&mint=&trigger=&candidateId=`: token snapshots ordered by `capturedAt DESC`, max `500`
- `GET /api/settings`: validated merged runtime settings
- `GET /api/settings/control`: draft-vs-active settings contract, including validation issues, changed paths, dry-run summary, and section metadata
- `GET /api/views/:name`: SQL view rows, allowlisted only, hard limit `500`

`GET /api/status` now also carries:

- `entryGate.dailyRealizedPnlUsd` and `entryGate.consecutiveLosses` so the desk can see why the daily guard is active
- `providerBudget` with current-month Birdeye used units, projected pace, and per-lane budget buckets (`discovery`, `evaluation`, `security`, `reserve`)

## Write Routes

- `POST /api/settings`: accepts `Partial<BotSettings>`, merges against current settings, then validates the full result
- `POST /api/settings/draft`: updates the persisted settings draft instead of active runtime state
- `POST /api/settings/draft/discard`: deletes the persisted draft
- `POST /api/settings/dry-run`: records the current draft review summary, including current gate vs draft gate and whether a new blocker was introduced
- `POST /api/settings/promote`: promotes the draft to active settings after validation and, for live-affecting paths, a passing dry run
- `POST /api/control/pause`
- `POST /api/control/resume`
- `POST /api/control/discover-now`
- `POST /api/control/evaluate-now`
- `POST /api/control/exit-check-now`
- `POST /api/operator/discovery-lab/validate`: validates an inline discovery-lab draft and returns `{ ok, issues, pack }`
- `POST /api/operator/discovery-lab/packs/save`: saves or updates a custom local discovery-lab pack
- `POST /api/operator/discovery-lab/packs/delete`: deletes a custom local discovery-lab pack by `packId`
- `POST /api/operator/discovery-lab/run`: starts a discovery-lab run from a saved pack or inline draft; returns `409` if another run is already active
- `POST /api/operator/discovery-lab/manual-entry`: operator entry that promotes one pass-grade result row into a linked candidate and tracked open position, then refreshes managed exit monitoring immediately; execution path follows runtime mode (`LIVE` onchain, `DRY_RUN` simulated fills), and the request can now include an operator-selected `positionSizeUsd` plus per-trade exit overrides from the discovery-lab trade ticket
- `POST /api/operator/discovery-lab/apply-live-strategy`: stages the selected completed run’s calibrated strategy pack into settings draft (`strategy.liveStrategy` + `strategy.livePresetId`)

Settings mutation rules:

- `tradeMode` cannot change while open positions exist
- `capital.capitalUsd` cannot change while open positions exist
- The dashboard now edits a persisted draft first. Promotion flow is `draft -> validate -> dry run -> operator review -> promote`
- Live-affecting paths are `tradeMode`, `capital.*`, `filters.*`, `exits.*`, and `research.*`
- Live cadence stays read-only in the UI even though the API can still validate the full settings object

Control-route mode rules:

- `discover-now`, `evaluate-now`, and `exit-check-now` are available in both `LIVE` and `DRY_RUN`
- Control routes now return `{ ok, action, shell, home }` so the desk can refresh from the authoritative post-action state
- API errors are returned as JSON `{ "error": "..." }` instead of default HTML
- A backend boot into `LIVE` now surfaces a startup hold through `pauseReason`; the operator must use `resume` from the dashboard before discovery and evaluation loops arm.

Dashboard navigation conventions:

- Primary operational workbench state lives in `/operational-desk/trading` query params:
  `bucket=<bucket>&sort=<candidate-sort>&q=<candidate-filter>&book=<book>&psort=<position-sort>&pq=<position-filter>`
- `/trading`, `/candidates`, and `/positions` remain compatibility redirects that translate legacy query params into `/operational-desk/trading` params
- `/settings` redirects to `/operational-desk/settings`
- `/telemetry` redirects to `/operational-desk/overview`
- Discovery lab now owns nested routes:
  `/discovery-lab/overview`, `/discovery-lab/studio`, `/discovery-lab/run-lab`, `/discovery-lab/results`, and `/discovery-lab/config`
- `/discovery-lab` remains a compatibility redirect to `/discovery-lab/overview`
- Discovery-lab route selection now sets the client’s initial workbench section, while recent-run reload still swaps the loaded result set without leaving the selected route
- Discovery-lab should default to `Runs` when no completed run is loaded and fall back to `Results` only when a completed run is selected
- Discovery-lab now consumes market-regime data through `/api/operator/discovery-lab/market-regime?runId=<selected-run-id>`; clients should always pass `runId`
- Discovery-lab results can now open a manual trade directly from a selected token row in either runtime mode. The browser should call the proxy write route, not the backend directly, so control-secret auth still applies.
- Discovery-lab results manual-entry flow now opens a full-screen trade ticket client-side, then posts the selected size and exit settings through the same proxy write route.
- Discovery-lab results now fetch per-mint token insight through `/api/operator/discovery-lab/token-insight?mint=<mint>` for the full-review modal and trade ticket instead of relying only on the static run snapshot.
- Discovery-lab results now also stage and edit live strategy packs; use `/discovery-lab/results` for staging and `/discovery-lab/config` for discovery-owned promotion review.
- Routed detail pages carry `focus=<row-id>` and return into `/operational-desk/trading` with preserved bucket/book, sort, search, and scroll-target context

## Auth Boundary

- Control, settings, and discovery-lab routes are currently unauthenticated at the app layer.
- The dashboard proxy forwards reads and writes without injecting any control-secret header.

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
- `v_api_provider_hourly`
- `v_api_endpoint_hourly`
- `v_payload_failure_hourly`
- `v_runtime_lane_health`
- `v_runtime_live_status`
- `v_open_position_monitor`
- `v_recent_fill_activity`
- `v_position_snapshot_latest`
- `v_fill_pnl_daily`
- `v_fill_daily`
- `v_position_pnl_daily`
- `v_source_outcome_daily`
- `v_candidate_cohort_daily`
- `v_position_cohort_daily`
- `v_candidate_funnel_daily_source`
- `v_candidate_reject_reason_daily_source`
- `v_candidate_decision_facts`
- `v_config_change_log`
- `v_kpi_by_config_window`
- `v_config_field_change`
