---
type: reference
status: active
area: api
date: 2026-04-18
source_files:
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/services/discovery-lab-service.ts
  - trading_bot/backend/src/services/discovery-lab-market-regime-service.ts
  - trading_bot/backend/src/services/market/market-intel-service.ts
  - trading_bot/backend/src/services/market/market-strategy-ideas-service.ts
  - trading_bot/backend/src/services/enrichment/token-enrichment-service.ts
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
- Browser-facing writes should use the proxy, and the dashboard itself should stay behind the app-level auth gate before proxy-secret injection is trusted.
- Server-rendered dashboard pages currently call the backend directly with `serverFetch()` and `API_URL`; if you add a server-side write path, it will not get proxy auth injection for free.
- Server-rendered dashboard pages can also emit direct external Grafana links from `GRAFANA_BASE_URL` plus route-specific dashboard UID env vars. There is still no Grafana proxy in this repo even though the repo now ships a local Grafana service in Compose.

## Read Routes

- `GET /health`: backend health plus current `tradeMode`
- `GET /api/status`: runtime snapshot, current entry-gate state, settings, latest candidates, latest fills, provider daily summary, and Birdeye monthly budget pacing
- `GET /api/status`: runtime snapshot, current entry-gate state, settings, latest candidates, latest fills, provider daily summary, Birdeye monthly budget pacing, and backend-owned `adaptiveModel` status
- `GET /api/status`: the status payload now also includes `currentSession`, the backend-owned trading-session snapshot for the currently deployed live-strategy session when one exists
- `GET /api/desk/shell`: compact shell contract for mode, health, primary blocker, last sync, available global actions, and headline counts
- `GET /api/desk/home`: dedicated control-desk body contract for readiness, guardrails, exposure, compact KPI groups (`performance`, `latency`, `runtime`), queue buckets, provider pace, diagnostics strip, backend-owned `adaptiveModel`, and recent event slices. The diagnostics strip must include fresh payload-failure pressure, not just stale-loop warnings.
- `GET /api/desk/events?limit=`: unified operator and system event feed for runtime, provider, control, and settings activity
- Compatibility aliases: `GET /api/operator/shell`, `GET /api/operator/home`, and `GET /api/operator/events?limit=` currently mirror the desk endpoints while the dashboard transitions to the new workbench and market IA.
- `GET /api/operator/sessions?limit=`: backend-owned session history surface for `/workbench/sessions`, returning the current active session plus recent bounded session windows ordered newest-first
- `GET /api/operator/sessions?limit=`: the session history payload now also includes `runtimePauseReason`, so `/workbench/sessions` can show whether the active deployment is paused without guessing from a different surface
- `GET /api/operator/sessions/current`: current backend-owned `TradingSession` snapshot for the active deployed pack, including pack identity, source run, prior pack linkage, config-version attribution, trade counts, and realized PnL rolled up from positions opened during that session
- `GET /api/operator/packs?limit=`: backend-owned workbench pack catalog, enriched from `DiscoveryLabPack`, `StrategyPack`, recent `DiscoveryLabRun` rows, and the current deployed session so `/workbench/packs` can stop delegating to discovery-lab chrome
- `GET /api/operator/packs/:id`: backend-owned pack detail surface, including the editing/source draft contract, latest synced version metadata, and recent runs
- `GET /api/operator/packs/:id/runs?limit=`: pack-scoped run history for the selected workbench pack
- `GET /api/operator/runs?limit=`: backend-owned sandbox run list with apply state and current-session linkage
- `GET /api/operator/runs/:id`: backend-owned sandbox run detail wrapper over the persisted discovery-lab run record, preserving the existing run/report shape while moving route ownership out of discovery-lab glue
- `GET /api/operator/runs/:id/market-regime`: run-owned market-regime surface for results and sandbox consumers; discovery-lab market-regime is now a compatibility alias over this seam
- `GET /api/operator/runs/:id/token-insight?mint=`: run-owned token-insight surface for results consumers. `StrategyRunResultsService` now resolves this through the dedicated enrichment seam, and discovery-lab token-insight is a compatibility alias over that path.
- `POST /api/operator/runs/:id/manual-entry`: run-owned trade-ticket/manual-entry route for discovery-lab results and future sandbox consumers; discovery-lab manual-entry is now a compatibility alias over this seam
- `GET /api/operator/market/trending?mint=&limit=&refresh=&focusOnly=`: dedicated market-intel surface for ranked market pulse plus optional single-token focus payload. `refresh=true` performs the provider pull, while default reads stay cache-backed. This is now the production owner for market-wide discovery pulse.
- `GET /api/operator/market/strategy-suggestions?refresh=`: dedicated market-owned strategy-ideas surface built from the market-intel snapshot. `refresh=true` refreshes the market snapshot first, then recomputes the suggestion set.
- `GET /api/operator/enrichment/:mint`: dedicated enrichment surface for one mint's token-intel payload, including socials, creator/tool links, market pulse, and security flags
- `GET /api/operator/candidates?bucket=ready|risk|provider|data`: backend-assigned candidate workbench buckets
- `GET /api/operator/candidates/:id`: candidate detail, backend-built adaptive explanation, snapshot history, and persisted provider payloads
- `GET /api/operator/positions?book=open|closed`: position workbench book, with open positions sorted by backend-computed intervention priority and desk-facing row metrics (`unrealizedPnlUsd`, `returnPct`, `lastFillAt`, `latestExecutionLatencyMs`)
- `GET /api/operator/positions/:id`: position detail, backend-built adaptive explanation, compact `executionSummary`, fill trail, snapshot history, and linked candidate context. The backing exit contract is now dual-written into the normalized `ExitPlan` table while the response shape stays unchanged during transition.
- `GET /api/operator/diagnostics`: current-fault diagnostics summary, endpoint burn, and stale-component issues
- `GET /api/operator/discovery-lab/catalog`: discovery-lab pack catalog, active run summary, recent run summaries, available profiles, and known sources; the catalog now includes the retained `Scalp tape + structure` workspace pack plus the three repo-seeded workspace packs, while pack favorites stay browser-local
- `GET /api/operator/discovery-lab/catalog`: this compatibility catalog is now composed from the dedicated operator pack and run seams plus discovery-lab metadata defaults, so studio reads no longer need discovery-lab-owned pack listing logic to stay current
- `GET /api/operator/discovery-lab/market-regime?runId=`: per-run market-regime snapshot for discovery-lab results and builder guidance, including regime, confidence, factor breakdown, stale flag, and suggested threshold overrides
- `GET /api/operator/discovery-lab/market-stats?mint=&limit=&refresh=&focusOnly=`: compatibility adapter over `GET /api/operator/market/trending`. The response shape stays discovery-lab-shaped, but production ownership now lives under the dedicated market seam.
- `GET /api/operator/discovery-lab/strategy-suggestions?refresh=`: compatibility adapter over `GET /api/operator/market/strategy-suggestions`
- `GET /api/operator/discovery-lab/token-insight?mint=`: compatibility adapter over the dedicated enrichment-backed run/result seam
- `GET /api/operator/discovery-lab/runs`: recent discovery-lab run summaries, newest first
- `GET /api/operator/discovery-lab/runs/:id`: full persisted discovery-lab run detail, including pack snapshot, thresholds, calibrated live-strategy payload (`strategyCalibration`), backend-owned adaptive winner cohorts and decision bands, report, and captured stdout or stderr
- Compatibility aliases: `/api/operator/workbench-market/*` and `/api/workbench-market/*` currently mirror the discovery-lab catalog, market, strategy-suggestion, token-insight, and run endpoints so the new dashboard route groups can land without breaking the old backend seam.
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
- `PATCH /api/settings`: same merge-and-validate behavior as POST; exists for semantic correctness (partial update vs. full replace)
- `POST /api/control/pause`
- `POST /api/control/resume`
- `POST /api/control/discover-now`
- `POST /api/control/evaluate-now`
- `POST /api/control/exit-check-now`
- `PATCH /api/control/positions/:id`: update position params (e.g., stop loss override)
- `DELETE /api/control/positions/:id`: close position
- `POST /api/operator/discovery-lab/validate`: validates an inline discovery-lab draft and returns `{ ok, issues, pack }`
- `POST /api/operator/discovery-lab/packs/save`: saves or updates a custom local discovery-lab pack
- `POST /api/operator/discovery-lab/packs/delete`: deletes a custom local discovery-lab pack by `packId`
- `POST /api/operator/discovery-lab/run`: starts a discovery-lab run from a saved pack or inline draft; returns `409` if another run is already active
- `POST /api/operator/discovery-lab/manual-entry`: operator entry that promotes one pass-grade result row into a linked candidate and tracked open position, then refreshes managed exit monitoring immediately; execution path follows runtime mode (`LIVE` onchain, `DRY_RUN` simulated fills), and the request can now include an operator-selected `positionSizeUsd` plus per-trade exit overrides from the discovery-lab trade ticket
- `POST /api/operator/discovery-lab/apply-live-strategy`: applies the selected completed run’s calibrated strategy pack directly into active runtime settings (`strategy.liveStrategy` + `strategy.livePresetId`), stamps the run’s `appliedToLiveAt` and `appliedConfigVersionId`, closes any prior active `TradingSession` as `REPLACED`, and opens a new backend-owned `TradingSession`
- `POST /api/operator/packs`: dedicated pack-save route for the workbench surface; pack file persistence and DB sync now run through the dedicated `PackRepo` seam instead of `DiscoveryLabService`
- `POST /api/operator/packs/validate`: dedicated pack-validation route for the real `/workbench/editor` surface; draft validation now runs through the dedicated `StrategyPackDraftValidator` seam
- `PATCH /api/operator/packs/:id`: dedicated pack-update route for the workbench surface; same save path, route ownership moved
- `DELETE /api/operator/packs/:id`: dedicated pack-delete route for custom workbench packs
- `POST /api/operator/packs/:id/runs`: dedicated pack-scoped run start for `/workbench/packs`, now owned by the dedicated `RunRunner` seam instead of `DiscoveryLabService`
- `POST /api/operator/runs/:id/apply-live`: dedicated run-owned deployment route for `/workbench/sandbox`, still cutting into the existing session seam and runtime-config live-strategy path; inline `__inline__` draft runs are now rejected and must be saved as packs before deployment
- `POST /api/operator/sessions`: the session seam is now the authoritative deployment start contract. The request must include `runId`, explicit `confirmation`, and optional `mode`; `mode=LIVE` also requires a trusted caller IP plus the separate live deploy token. This route creates the session, patches runtime config, stamps the run apply metadata, and owns replacement semantics when another session is already active.
- `PATCH /api/operator/sessions/:id`: now supports `{ action: "pause" | "resume" | "stop" | "revert" }`. `pause` and `resume` act on the active session runtime state, `stop` clears the deployed `strategy.liveStrategy` contract and pauses further entries, and `revert` re-applies the previous deployment from `RuntimeConfigVersion` through the same session seam.

Exit-plan transition note:

- No new HTTP route landed in this slice.
- Open-position writes now dual-write a normalized `ExitPlan` row plus the legacy `Position.metadata.exitPlan` payload so managed exits keep parity while storage is normalized under the hood.

Trading-session transition note:

- `TradingSession` is now the first pack/session backend seam instead of inferring the active deployment entirely from `RuntimeConfig.strategy.liveStrategy`.
- `TradingSessionService` now owns current-session reads, bounded session history, explicit stop semantics, and clean replacement semantics when a new run is applied.
- `TradingSessionService` now also owns explicit session start, pause, resume, and revert semantics. The session route is the production owner; `POST /api/operator/runs/:id/apply-live` and `POST /api/operator/discovery-lab/apply-live-strategy` are compatibility entry points over that same start contract.
- Starting a session now requires an explicit operator confirmation phrase, and `mode=LIVE` also requires a trusted caller IP plus the separate `LIVE_DEPLOY_2FA_TOKEN`. The dashboard proxy now forwards `x-forwarded-for` / `x-real-ip` so the backend can enforce that guard.
- Session window totals are now bounded by `startedAt` and `stoppedAt`, so re-applying the same run does not smear counts or realized PnL across multiple deployment windows.
- Strategy-pack deployment state is now owned by the session seam. Discovery-lab pack sync keeps pack snapshots fresh, but it no longer infers which pack is `LIVE` from settings reads.

Pack/run operator transition note:

- This pass did not add `StrategyRun` or `StrategyRunGrade`. The first dedicated operator pack/run surface is intentionally built on the existing transition contracts: `DiscoveryLabPack`, `DiscoveryLabRun`, `StrategyPack`, `StrategyPackVersion`, and `TradingSession`.
- `StrategyPackService` and `StrategyRunService` now own the operator route surface for packs and runs, and the dedicated workbench seams now also own the remaining major transition behavior under them: `PackRepo` owns pack editing/source persistence while `RunRunner` owns subprocess execution and run finalization.
- Persisted run reads now live under the dedicated run seam too. `StrategyRunService` and its read helper load run list/detail/report state from `DiscoveryLabRun` rows instead of using the discovery-lab file-first detail path as the canonical reader.
- Discovery-lab compatibility routes stay intact, but their validate/save/delete/run/apply handlers now delegate through the dedicated pack/run/session seams instead of owning that behavior directly.
- Discovery-lab studio is no longer a direct discovery-lab-write client. Under the hood it now validates, saves, deletes, and starts runs through `/api/operator/packs*` and `/api/operator/runs*`, then adapts those responses back into the retained studio surface.
- `/api/operator/runs/:id` is now the authoritative run-detail wrapper. Current dashboard consumers should treat that wrapper as canonical instead of normalizing legacy detail payloads opportunistically.
- `/api/operator/runs/:id/market-regime`, `/api/operator/runs/:id/token-insight`, and `/api/operator/runs/:id/manual-entry` are now the dedicated result-support seams. The retained discovery-lab routes are thin adapters and should not regain ownership.
- Active-run stdout and stderr are now persisted back into `DiscoveryLabRun` while the run is still `RUNNING`, so detail polling no longer depends on the file copy to stay fresher than the database row.
- On Windows hosts, the dedicated run runner now launches discovery runs through a shell-backed `npm` spawn and the shared atomic JSON writer retries file replacement, which prevents the `spawn ENOENT` / `spawn EINVAL` / `rename EPERM` failures that showed up during live verification on this machine.

Settings mutation rules:

- `tradeMode` cannot change while open positions exist
- `capital.capitalUsd` cannot change while open positions exist
- The dashboard now edits local form state and applies directly through `POST /api/settings`; there is no persisted settings-draft or promote phase
- `strategy.liveStrategy.*` can no longer be patched through `/api/settings`; deployment changes must go through discovery-lab apply or the session seam
- Live-affecting paths are `tradeMode`, `capital.*`, `filters.*`, `exits.*`, and session-owned live-strategy deployment
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
  `/discovery-lab/overview`, `/discovery-lab/market-stats`, `/discovery-lab/studio`, `/discovery-lab/run-lab`, `/discovery-lab/results`, `/discovery-lab/strategy-ideas`, and `/discovery-lab/config`
- Transitional compatibility routes now exist for the draft IA:
  `/workbench/packs`, `/workbench/editor`, `/workbench/sandbox`, `/workbench/grader`, `/workbench/sessions`, `/market/trending`, `/market/token/:mint`, and `/market/watchlist`
- `/discovery-lab` now redirects to `/discovery-lab/studio`
- `/discovery-lab/overview` is compatibility-only and redirects to `/discovery-lab/studio`
- `/workbench/packs`, `/workbench/sandbox`, and `/workbench/sessions` now read dedicated backend-owned pack/run/session surfaces directly.
- `/workbench/editor` now reads pack list/detail/run history from `/api/operator/packs*`, validates and saves through the dedicated pack seam, and launches pack-scoped runs through `/api/operator/packs/:id/runs`.
- `/workbench/grader` now reads run list/detail from `/api/operator/runs*` and applies live through the run-owned live endpoint instead of redirecting to discovery-lab strategy ideas.
- `/workbench/sessions` now starts sessions through `POST /api/operator/sessions` and controls active deployments through `PATCH /api/operator/sessions/:id`. The page is no longer a read-only history pane.
- `/discovery-lab/studio` now also consumes the dedicated operator pack/run routes under the hood while preserving the existing discovery-lab studio chrome and draft behavior.
- `/market/trending` now reads the dedicated operator market seam directly through `/api/operator/market/trending`.
- `/market/token/:mint` now reads the dedicated operator market seam directly with `focusOnly=true`; the page still reuses the ranked-market payload for its focus-token card, so the route group is not the final UI contract even though backend ownership has moved.
- `/discovery-lab/market-stats` now reads `/api/operator/market/trending` directly and uses the retained discovery-lab route only as a compatibility alias.
- `/discovery-lab/strategy-ideas` now reads `/api/operator/market/strategy-suggestions` directly and keeps the old discovery-lab route only as a compatibility alias.
- Discovery-lab route selection now sets the client’s initial workbench section, while recent-run reload still swaps the loaded result set without leaving the selected route
- Discovery-lab should default to `Runs` when no completed run is loaded and fall back to `Results` only when a completed run is selected
- Discovery-lab now consumes market-regime data through `/api/operator/discovery-lab/market-regime?runId=<selected-run-id>`; clients should always pass `runId`
- Discovery-lab results can now open a manual trade directly from a selected token row in either runtime mode. The browser should call the proxy write route, not the backend directly, so control-secret auth still applies.
- Discovery-lab results manual-entry flow now opens a full-screen trade ticket client-side, then posts the selected size and exit settings through the same proxy write route.
- Discovery-lab results now fetch per-mint token insight through `/api/operator/runs/:id/token-insight?mint=<mint>` for the full-review modal and trade ticket instead of relying only on the static run snapshot.
- Discovery-lab results now load selected run detail through `/api/operator/runs/:id` instead of `/api/operator/discovery-lab/runs/:id`, so at least one legacy discovery-lab client path now consumes the dedicated run seam directly while token insight, manual entry, and market regime still remain on retained discovery-lab endpoints.
- Discovery-lab results now also consume market-regime and manual-entry through `/api/operator/runs/:id/*`, so the remaining retained discovery-lab result routes are compatibility aliases instead of owning the behavior.
- Discovery-lab market/intel compatibility routes are now thin adapters too. The production owners are `MarketIntelService`, `MarketStrategyIdeasService`, and `TokenEnrichmentService`; `DiscoveryLabService` should not regain market or token-intel ownership.
- Discovery-lab studio now rebuilds its retained catalog shape from `/api/operator/packs`, `/api/operator/packs/:id`, and `/api/operator/runs`, so the old discovery-lab catalog route is compatibility-only rather than the only source of pack/run truth for that screen.
- Discovery-lab results now also stage and edit live strategy packs; use `/discovery-lab/results` for staging and `/discovery-lab/config` for discovery-owned direct-apply settings.
- Discovery-lab result rows now carry backend-owned trade setup data built from the same scoring, confidence, sizing, and exit-profile logic the live engine uses; the dashboard should prefer that payload over local duplicate calculations.
- Discovery-lab market stats now belongs in `/discovery-lab/market-stats`, not in results or overview, so market-wide pulse checks and one-off token lookups stay separate from completed-run review.
- Discovery-lab market stats and strategy ideas are manual-refresh surfaces: route loads should read cached snapshots only, while the explicit page refresh controls are the provider-spending path.
- Discovery-lab strategy ideas now belongs in `/discovery-lab/strategy-ideas`; it is a read surface for backend-suggested pack drafts and threshold ranges, not a hidden results-side panel.
- Routed detail pages carry `focus=<row-id>` and return into `/operational-desk/trading` with preserved bucket/book, sort, search, and scroll-target context

## Auth Boundary

- All `/api/*` routes require authentication except `GET /api/status` and `GET /api/settings`.
- Auth methods (checked in order):
  1. `Authorization: Bearer <CONTROL_API_SECRET>` header
  2. `X-API-Key: <CONTROL_API_SECRET>` header
- Public routes (no auth): `GET /health`, `GET /api/status`, `GET /api/settings`
- The dashboard app itself should sit behind dashboard auth before the proxy is exposed.
- Dashboard proxy forwards browser `X-API-Key` plus bearer `Authorization` headers to the backend. If no bearer header is present and `CONTROL_API_SECRET` is configured, the proxy injects `Authorization: Bearer <CONTROL_API_SECRET>`.
- Payload size limit: `1mb` JSON body maximum.

## SQL View Allowlist

`GET /api/views/:name` only exposes the views below. If you add or rename a view, update both the SQL file and this allowlist in `trading_bot/backend/src/api/routes/utils.ts`.

- `v_token_metrics_latest`
- `v_token_metrics_aggregation`
- `v_candidate_lifecycle`
- `v_candidate_with_metrics`
- `v_position_entry_analysis`
- `v_position_monitor`
- `v_fill_performance`
- `v_runtime_overview`
- `v_candidate_funnel_daily`
- `v_api_telemetry_daily`
- `v_api_provider_daily`
- `v_api_endpoint_efficiency`
- `v_position_pnl_daily`
- `v_candidate_decision_facts`
- `v_discovery_lab_run_summary`
- `v_discovery_lab_pack_performance`
- `v_strategy_pack_performance_daily`
- `v_shared_token_fact_cache`

## Run Grading And Tuning

- `POST /api/operator/runs/:id/grade` is now a real backend-owned grader route. `PackGradingService` computes the rubric from the persisted run report and can optionally persist the resulting pack grade/status onto `StrategyPack`.
- `POST /api/operator/runs/:id/suggest-tuning` is now a real backend-owned tuning route. `PackGradingService` computes threshold deltas from the persisted run evidence, returns a suggested draft, and can optionally clone that draft through `PackRepo`.
- `/workbench/grader` now consumes those dedicated routes directly. Discovery-lab strategy ideas remain a separate market-intel read surface and should not regain pack-grading ownership.
