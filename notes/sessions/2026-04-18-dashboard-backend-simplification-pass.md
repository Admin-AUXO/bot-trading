---
type: session
status: active
area: dashboard/backend
date: 2026-04-18
source_files:
  - trading_bot/backend/src/api/server.ts
  - trading_bot/backend/src/api/routes/desk-operator-routes.ts
  - trading_bot/backend/src/api/routes/discovery-lab-routes.ts
  - trading_bot/backend/src/engine/runtime.ts
  - trading_bot/backend/src/services/operator-desk.ts
  - trading_bot/backend/src/services/discovery-lab-service.ts
  - trading_bot/dashboard/app/discovery-lab/market-stats/page.tsx
  - trading_bot/dashboard/app/market/trending/page.tsx
  - trading_bot/dashboard/app/market/token/[mint]/page.tsx
  - trading_bot/dashboard/components/discovery-lab-client.tsx
  - trading_bot/dashboard/components/discovery-lab-results-board.tsx
next_action: Browser-check `/workbench/packs`, `/workbench/sandbox`, `/workbench/sandbox/[runId]`, and `/workbench/sessions` against a live backend, then keep shrinking discovery-lab-only ownership from editor/grader and the old results/studio surfaces.
---

# Session - Dashboard Backend Simplification Pass

## Findings / Decisions

- The desk overview was still wasting fetches on diagnostics data it did not render.
- The shell carried duplicate navigation definitions in both `app-shell.tsx` and `sidebar.tsx`.
- The old overview kept too much evidence permanently open, which fought the repo's own operator-ui contract.
- `operator-desk.ts` duplicated the same latest-metrics and latest-fill lookup logic across home and position-book reads.

## What Changed

- Rebuilt the desk overview around one scan-first structure:
  compact KPI strip, `Next actions`, `System state`, dense open-position rows, and secondary evidence behind disclosures.
- Removed the unused overview diagnostics fetch and dropped the unused dashboard-side `DiagnosticsPayload` type.
- Replaced the overview-only `PipelinePanel` and `EventsList` files after their responsibilities moved into the new desk layout.
- Collapsed shell navigation into `trading_bot/dashboard/lib/dashboard-navigation.ts` so command palette and sidebar share one route contract.
- Simplified the trading page by extracting shared chip/search controls instead of repeating the same sticky workbench markup twice.
- Extracted shared position-support lookups in `trading_bot/backend/src/services/operator-desk.ts` and reused one recent-payload-failure helper.
- Split the backend HTTP layer into small route modules under `trading_bot/backend/src/api/routes/` so `createApiServer()` is now a composition root, not a route pile.
- Moved runtime wiring in `trading_bot/backend/src/engine/runtime.ts` to plain handler bags. `BotRuntime` now owns the seams and passes desk, control, and discovery-lab callbacks into the API server instead of letting HTTP reach into engine internals.
- Kept `OperatorDeskService` focused on the desk seam: shell, home, events, candidate queue, position book, and diagnostics. The duplicated lookup logic is still gone.
- Kept `DiscoveryLabService` focused on the pack/run seam: catalog, validate, save, delete, run, result summaries, and manual-entry helpers.
- Added compatibility route aliases for the new workbench/market IA: `/api/operator/workbench-market/*` and `/api/workbench-market/*` now mirror the discovery-lab endpoints, while `/api/operator/shell`, `/api/operator/home`, and `/api/operator/events` mirror the desk surface.
- Audited detail-page actions against the real API surface and removed fake controls:
  candidate `block permanently` was calling a nonexistent route
  position `adjust stop loss` was pretending to edit one position while actually targeting global settings through a nonexistent route
  position `close position` was relabeled to the truthful global `run exit checks`
- Simplified detail actions down to honest controls only:
  candidate manual entry + discovery config
  position exit-check trigger + runtime settings + Solscan
- Removed discovery-config preset plumbing that depended on an absent `/api/settings/presets` endpoint and was already failing silently.

## What I Verified

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`

## Remaining Risks

- This pass is build-verified, not browser-verified.
- The dashboard still points the market and discovery surfaces at `/api/operator/discovery-lab/*` in several places. The new workbench-market aliases exist, but the client has not been moved over yet.
- The compatibility layer is doing real work, not just preserving dead links. `/api/operator/discovery-lab/*`, `/api/operator/workbench-market/*`, and `/api/workbench-market/*` all hit the same discovery-lab seam, so the route surface is duplicated on purpose for now.
- The open-position summary now scans denser than before; confirm desktop and mobile readability once the live desk is running.
- Repo graph rebuild is currently blocked by the local Graphify wrapper failing while trying to recreate `.graphify-venv` on Windows (`Unknown error: The file cannot be accessed by the system`).

## Follow-up - Database Slice

- Added the first pack-contract groundwork instead of forcing the whole database draft at once.
- `StrategyPack` and `StrategyPackVersion` now exist in Prisma as the first-class pack catalog and append-only version log.
- `DiscoveryLabService` now dual-writes discovery-lab pack sync/save flows into both `DiscoveryLabPack` and `StrategyPack`, and creates a new `StrategyPackVersion` row only when the pack snapshot actually changes.
- Added `v_strategy_pack_performance_daily` and exposed it through the SQL view allowlist so later workbench and market surfaces can read pack-level performance from the database instead of file snapshots.
- Added the next database slice for managed exits.
- `ExitPlan` now exists in Prisma as a one-to-one normalized contract for each open position, with an optional `StrategyPack` link for future pack/session attribution.
- `ExecutionEngine` now dual-writes a normalized `ExitPlan` row when a position opens while still preserving the legacy `Position.metadata.exitPlan` payload for transition safety.
- `ExitEngine` now loads the `ExitPlan` relation and `strategy-exit.ts` prefers the row first, then falls back to metadata so live parity stays intact while the read cutover remains incomplete.
- No new API route or SQL view was needed for this slice; the desk and discovery surfaces keep the same contracts.
- Added the next phase-2 database-backed session slice instead of another storage-only patch.
- `TradingSession` now exists in Prisma as the first explicit deployed-pack/session contract, with pack identity, source run, previous-pack linkage, config-version attribution, stop fields, and rolled-up trade counters.
- `create_views.sql` now owns `trading_session_one_active_idx`, a partial unique index that enforces one active session row at a time without hand-authored migrations.
- Added `TradingSessionService` as the first pack/session backend seam. It owns current-session reads and session start from the existing discovery-lab apply-live-strategy cut-in point.
- `POST /api/operator/discovery-lab/apply-live-strategy` no longer just patches runtime settings implicitly. It now goes through `TradingSessionService`, writes the runtime-config change in the same transaction as the session row, closes any prior active session as `REPLACED`, and stamps `DiscoveryLabRun.appliedToLiveAt` plus `appliedConfigVersionId`.
- `GET /api/operator/sessions/current` is now the first dedicated session route, and `GET /api/status` also carries `currentSession` so the existing compatibility surfaces can read the active deployment from the backend seam instead of reverse-engineering settings state.
- Session trade counts and realized PnL are scoped to positions opened during that session window, not just by run id, so re-applying the same run does not smear stats across multiple sessions.
- Followed up with the first real phase-2 session operator pass instead of another storage-only slice.
- `TradingSessionService` now owns bounded session history (`GET /api/operator/sessions?limit=`), explicit stop semantics (`PATCH /api/operator/sessions/:id` with `action=stop`), and pack deployment status transitions instead of leaving those concerns smeared across runtime settings reads and discovery-lab pack sync.
- Stopping a session now clears the deployed `strategy.liveStrategy` contract through the same runtime-config seam, pauses further entries via `BotState.pauseReason`, writes `stoppedConfigVersionId`, and preserves the closed session totals on the row.
- Discovery-lab pack sync still dual-writes `StrategyPack` and `StrategyPackVersion`, but it no longer decides which pack is `LIVE` from `settings.strategy.liveStrategy.packId`; the session seam is authoritative for deployment state.
- `/api/settings` can no longer patch `strategy.liveStrategy.*` directly, which closes the bypass that would have let runtime config drift past the session contract.
- `/workbench/sessions` is no longer a redirect to settings. It now renders the backend-owned current session plus recent session history so the target IA has its first real pack/session surface.
- Verified this pass with:
  `cd trading_bot/backend && npm run db:generate`
  `cd trading_bot/backend && npm run build`
  `cd trading_bot/dashboard && npm run build`
- No schema or view change was needed for this session lifecycle pass, so host-side `db push` and `db execute` were not rerun.
- Deferred session revert-from-config-version flow, promoted metadata columns, adaptive/enrichment tables, additional SQL views, and the eventual removal of the `Position.metadata.exitPlan` read path.

## Follow-up - First Real Pack/Run Workbench Pass

- Followed through on the “major phase-2 push” instead of polishing the session seam for another tiny slice.
- Added dedicated operator pack/run services:
  `trading_bot/backend/src/services/workbench/strategy-pack-service.ts`
  `trading_bot/backend/src/services/workbench/strategy-run-service.ts`
  These now own the operator route surface for pack inventory, pack detail, pack-scoped runs, run detail, and run-owned apply-to-live behavior.
- Added dedicated route modules:
  `trading_bot/backend/src/api/routes/pack-routes.ts`
  `trading_bot/backend/src/api/routes/run-routes.ts`
  New operator routes now exist for:
  `GET|POST /api/operator/packs`
  `GET|PATCH|DELETE /api/operator/packs/:id`
  `GET|POST /api/operator/packs/:id/runs`
  `GET /api/operator/runs`
  `GET /api/operator/runs/:id`
  `POST /api/operator/runs/:id/apply-live`
- Kept the existing discovery-lab edit/source surfaces intact on purpose.
  No fake `StrategyRun` table was introduced.
  No extra schema/view slice was forced in.
  The new pack/run routes deliberately sit on top of the existing transition contracts:
  `DiscoveryLabPack`
  `DiscoveryLabRun`
  `StrategyPack`
  `StrategyPackVersion`
  `TradingSession`
- Reduced runtime and discovery-lab route glue ownership:
  `trading_bot/backend/src/engine/runtime.ts` now wires dedicated pack/run handler bags.
  Discovery-lab compatibility run/apply endpoints delegate through the new run service instead of directly owning that behavior.
- Promoted more of the target IA from redirect chrome to real backend-owned pages:
  `trading_bot/dashboard/app/workbench/packs/page.tsx`
  `trading_bot/dashboard/app/workbench/sandbox/page.tsx`
  `trading_bot/dashboard/app/workbench/sandbox/[runId]/page.tsx`
  These now read the dedicated pack/run routes directly and use proxy-backed workbench actions for start-run and apply-live.
- Added dashboard-side workbench helper actions in:
  `trading_bot/dashboard/components/workbench/workbench-actions.tsx`
- Extended the run contract so `DiscoveryLabRun.appliedToLiveAt` and `appliedConfigVersionId` are available on the operator run surface too, which lets the new sandbox pages show deployment state without reverse-engineering settings.

## What I Verified In This Follow-up

- `cd trading_bot/backend && npm run db:generate`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`

## Remaining Risks After This Follow-up

- This is still build-verified, not browser-verified.
- `/workbench/editor` and `/workbench/grader` are still compatibility shells; the workbench is no longer fake, but it is not complete either.
- Discovery-lab still owns the editing/source contract and the underlying run execution path, so route ownership is improved faster than storage/source ownership.
- The old discovery-lab pages and clients still hit `/api/operator/discovery-lab/*` directly in several places. That duplication is now smaller, not gone.

## Follow-up - Real Editor/Grader Ownership Pass

- Pushed the next coordinated workbench cut instead of leaving editor/grader as redirect chrome.
- `/workbench/editor` is now a real backend-owned pack surface:
  `trading_bot/dashboard/app/workbench/editor/page.tsx`
  `trading_bot/dashboard/app/workbench/editor/[id]/page.tsx`
  `trading_bot/dashboard/components/workbench/workbench-editor-surface.tsx`
  `trading_bot/dashboard/components/workbench/workbench-pack-editor-form.tsx`
  These now read from the dedicated pack seam (`/api/operator/packs`, `/api/operator/packs/:id`, `/api/operator/packs/:id/runs`), validate through the new dedicated `POST /api/operator/packs/validate` route, save/update through `/api/operator/packs`, and start runs through `/api/operator/packs/:id/runs`.
- `/workbench/grader` is now a real backend-owned run-review surface:
  `trading_bot/dashboard/app/workbench/grader/page.tsx`
  `trading_bot/dashboard/app/workbench/grader/[runId]/page.tsx`
  `trading_bot/dashboard/components/workbench/workbench-grader-surface.tsx`
  These now read the dedicated run seam (`/api/operator/runs`, `/api/operator/runs/:id`) and apply live through `/api/operator/runs/:id/apply-live` instead of redirecting to discovery-lab strategy ideas.
- Tightened backend route ownership for the editor pass:
  `trading_bot/backend/src/services/workbench/strategy-pack-service.ts` now exposes pack validation through the dedicated seam,
  `trading_bot/backend/src/api/routes/pack-routes.ts` now exposes `POST /api/operator/packs/validate`,
  and runtime wiring now includes that pack-owned validation callback instead of forcing editor validation back through discovery-lab-only route glue.
- Reduced discovery-lab client dependence on the old run-detail route family in the same pass:
  `trading_bot/dashboard/app/discovery-lab/results/page.tsx`,
  `trading_bot/dashboard/components/discovery-lab-results-route.tsx`,
  and `trading_bot/dashboard/components/discovery-lab/run-status-poller.tsx`
  now load selected run detail through `/api/operator/runs/:id` or `/operator/runs/:id` instead of `/api/operator/discovery-lab/runs/:id`.
- Trimmed transitional navigation duplication:
  `trading_bot/dashboard/lib/dashboard-navigation.ts` no longer treats `/discovery-lab/config` as the editor route or `/discovery-lab/strategy-ideas` as the grader route. Those workbench nav items now match the real workbench paths only.

## What I Verified In This Follow-up

- `cd trading_bot/backend && npm run db:generate`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`

## Follow-up - Discovery-Lab Compatibility Ownership Pass

- Pushed past the editor/grader surface cut and moved more real ownership out of the retained discovery-lab route glue.
- `trading_bot/backend/src/engine/runtime.ts` now treats the discovery-lab route family as compatibility handlers over the dedicated seams instead of calling the monolith directly for pack validation/save/delete and run start/apply behavior.
- `trading_bot/backend/src/services/workbench/strategy-pack-service.ts` now exposes discovery-lab pack listing from the transition tables, and `trading_bot/backend/src/services/discovery-lab-service.ts` exposes only lightweight studio metadata (`profiles`, `knownSources`) for the compatibility catalog.
- `GET /api/operator/discovery-lab/catalog` is now rebuilt from the dedicated operator pack/run surfaces plus discovery-lab metadata defaults, so the compatibility catalog stops owning pack listing logic itself.
- `POST /api/operator/discovery-lab/validate`, `.../packs/save`, `.../packs/delete`, `.../run`, and `.../apply-live-strategy` now delegate through the pack/run/session seams under runtime wiring instead of directly using discovery-lab pack lifecycle callbacks.
- Tightened the live-deploy contract:
  inline `__inline__` draft runs are no longer treated as deployable packs.
  `StrategyRunService` now marks them non-applicable on the operator run summary.
  `TradingSessionService` now rejects apply-live for inline runs and requires a persisted pack id.
- Moved another legacy discovery-lab client path off the old write surface:
  `trading_bot/dashboard/app/discovery-lab/studio/page.tsx`
  `trading_bot/dashboard/components/discovery-lab-client.tsx`
  now assemble the retained studio catalog from `/api/operator/packs`, `/api/operator/packs/:id`, and `/api/operator/runs`, while validate/save/delete/run actions go through `/api/operator/packs*`.
- Tightened run-detail contract consumption across the dashboard:
  `trading_bot/dashboard/app/discovery-lab/results/page.tsx`
  `trading_bot/dashboard/components/discovery-lab-results-route.tsx`
  `trading_bot/dashboard/components/discovery-lab/run-status-poller.tsx`
  `trading_bot/dashboard/components/workbench/workbench-grader-surface.tsx`
  `trading_bot/dashboard/app/workbench/sandbox/page.tsx`
  `trading_bot/dashboard/app/workbench/sandbox/[runId]/page.tsx`
  now treat `/api/operator/runs/:id` as the canonical wrapper instead of tolerating both wrapper and legacy detail shapes.
- Updated dashboard-side typing so `DiscoveryLabRunSummary` now includes `appliedToLiveAt` and `appliedConfigVersionId`, matching the backend-owned operator run contract.

## What I Verified In This Follow-up

- `cd trading_bot/backend && npm run db:generate`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`

## Remaining Risks After This Follow-up

- This is still build-verified, not browser-verified.
- Discovery-lab still owns the source-of-editing contract under the hood and the subprocess run execution path under the hood. Route ownership is tighter; storage and execution authority are still transitional.
- Discovery-lab results still rely on retained discovery-lab endpoints for token insight, manual entry, and market-regime fetches. Studio and run detail moved further; those three surfaces did not.
- `GET /api/operator/discovery-lab/catalog` is now a compatibility assembly over operator pack/run routes, but it still exists because the discovery-lab chrome expects that shape.
- The next obvious database optimization is an index for session rollups on `Position.liveStrategyRunId`, but it was not required to ship this pass.

## Follow-up - Run Authority And Results-Seam Pass

- Cut persisted run reads away from `DiscoveryLabService` without touching run execution ownership.
- Added `trading_bot/backend/src/services/workbench/strategy-run-read-service.ts` so run list/detail/report reads now come from `DiscoveryLabRun` rows as the backend authority instead of the old file-first/detail-first drift.
- `trading_bot/backend/src/services/workbench/strategy-run-service.ts` now depends on that read seam for:
  operator run list
  operator run detail
  discovery-lab run summary compatibility reads
  discovery-lab run detail compatibility reads
- Fixed the stale-output drift directly in `trading_bot/backend/src/services/discovery-lab-service.ts`:
  active run stdout/stderr updates now also write back into the `DiscoveryLabRun` row instead of only mutating the `.run.json` file copy.
- Added `trading_bot/backend/src/services/workbench/strategy-run-results-service.ts` as the dedicated results-support seam for:
  market regime
  token insight
  manual-entry/trade ticket execution
- Added dedicated run-owned endpoints:
  `GET /api/operator/runs/:id/market-regime`
  `GET /api/operator/runs/:id/token-insight?mint=`
  `POST /api/operator/runs/:id/manual-entry`
- Kept discovery-lab compatibility endpoints intact, but downgraded them to adapters:
  `GET /api/operator/discovery-lab/market-regime`
  `GET /api/operator/discovery-lab/token-insight`
  `POST /api/operator/discovery-lab/manual-entry`
  `GET /api/operator/discovery-lab/runs/:id`
  now delegate through the dedicated run seams instead of owning the behavior.
- Moved the changed dashboard results client path in the same pass:
  `trading_bot/dashboard/components/discovery-lab-results-board.tsx`
  now uses the run-owned market-regime, token-insight, and manual-entry routes directly.

## What I Verified In This Follow-up

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- Browser verification against isolated local processes, not the pre-existing port bindings:
  backend on `http://127.0.0.1:3201`
  dashboard on `http://127.0.0.1:3202`
- Playwright-backed checks captured:
  `output/playwright/ok-discovery-lab_results.png`
  `output/playwright/ok-workbench_sandbox.png`
  `output/playwright/verification-ok.json`
- Verified in browser on the isolated stack:
  `/discovery-lab/results` renders and loads run data without console errors
  `/workbench/sandbox` renders and loads run data without console errors
  dashboard proxy fetch to `/api/operator/runs?limit=5` returns `200`
- Verified directly on the isolated backend:
  `GET /api/operator/runs?limit=5` returns the dedicated run list
  `GET /api/operator/runs/:id` returns the dedicated wrapper
  `GET /api/operator/runs/:id/market-regime` returns the dedicated market-regime payload

## Remaining Risks After This Follow-up

- The backend still keeps run execution and pack editing/source ownership in `DiscoveryLabService`. This pass moved persisted reads and result-support behavior, not subprocess execution.
- The verification dataset currently has completed runs with `evaluationCount=0` and `winnerCount=0`, so token-insight and manual-entry could not be fully browser-validated against a real selected result token in this pass.
- No schema or view change landed. The additive `Position.liveStrategyRunId` index remains deferred until query evidence says it is worth the churn.
- There is still a separate broken dashboard startup path on port `3100` in this environment plus the repo wrapper `trading_bot/dashboard/scripts/run-next.mjs` can throw `spawn EINVAL` on Windows startup. Verification used isolated ports and direct Next startup to get a clean signal.

## Follow-up - Pack Repo And Run Runner Ownership Pass

- Compared the current implementation against `draft_rollout_plan.md`, `draft_database_plan.md`, and `draft_backend_plan.md` before coding.
  The biggest still-missing production-grade phase-2/phase-3 items were:
  run execution ownership still living in `DiscoveryLabService`,
  pack file/source editing ownership still living in `DiscoveryLabService`,
  and the remaining broader market/enrichment/adaptive service map from the drafts still not landed.
- Moved pack editing/source persistence onto a dedicated workbench seam:
  `trading_bot/backend/src/services/workbench/pack-repo.ts`
  now owns workspace/custom pack file reads, pack id allocation, pack save/delete, workspace seed sync, and the DB mirror into `DiscoveryLabPack`, `StrategyPack`, and `StrategyPackVersion`.
- Moved pack validation onto its own dedicated seam:
  `trading_bot/backend/src/services/workbench/strategy-pack-draft-validator.ts`
  now owns the draft rules used by both workbench and compatibility surfaces.
- Moved run execution ownership onto a dedicated workbench seam:
  `trading_bot/backend/src/services/workbench/run-runner.ts`
  now owns pack resolution for runs, subprocess launch, stdout/stderr persistence, run finalization, Dex pair enrichment, strategy calibration build, and normalized run-table sync.
- Rewired the real operator seams onto those owners:
  `trading_bot/backend/src/services/workbench/strategy-pack-service.ts`
  now validates via `StrategyPackDraftValidator` and saves/deletes through `PackRepo` instead of calling `DiscoveryLabService`.
  `trading_bot/backend/src/services/workbench/strategy-run-service.ts`
  now starts runs through `RunRunner` instead of calling `DiscoveryLabService`.
  `trading_bot/backend/src/engine/runtime.ts`
  now instantiates `PackRepo`, `StrategyPackDraftValidator`, and `RunRunner`, uses them as the authoritative pack/run owners, and feeds discovery-lab compatibility catalog metadata directly from the workbench seam instead of a monolith-owned helper.
- Tightened Windows-host execution resilience discovered during live verification:
  `trading_bot/backend/src/services/workbench/discovery-lab-shared.ts`
  now retries file replacement in `writeJsonFileAtomic()` so active-run `.run.json` updates stop crashing on `rename EPERM`.
  `RunRunner` now launches discovery runs with `spawn(\"npm\", ..., { shell: true })` on Windows so the local host does not die on `spawn ENOENT` or `spawn EINVAL`.
- Discovery-lab compatibility surfaces remain intact, but the major retained split authority is smaller now:
  `DiscoveryLabService` no longer owns the runtime pack-save/delete path or operator-triggered run execution path.

## What I Verified In This Follow-up

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- Direct backend contract checks on the isolated backend at `http://127.0.0.1:3201`:
  `GET /health`
  `GET /api/operator/packs?limit=3`
  `GET /api/operator/runs?limit=5`
  `GET /api/operator/packs/workspace-pump-holder`
- Dedicated pack/run ownership check on the isolated backend:
  `POST /api/operator/packs/validate` succeeded for a temporary verification pack
  `POST /api/operator/packs` saved that pack through `PackRepo`
  `POST /api/operator/packs/:id/runs` started a dedicated run through `RunRunner`
  `GET /api/operator/runs/:id` polled that run to `COMPLETED`
  `DELETE /api/operator/packs/:id` removed the temporary verification pack cleanly
- Browser verification against isolated local processes:
  backend on `http://127.0.0.1:3201`
  dashboard on `http://127.0.0.1:3203`
- Playwright-backed artifacts captured:
  `output/playwright/workbench-editor-rewrite-pass.png`
  `output/playwright/workbench-sandbox-run-rewrite-pass.png`
  `output/playwright/discovery-lab-studio-rewrite-pass.png`
  `output/playwright/discovery-lab-results-rewrite-pass.png`
  `output/playwright/verification-rewrite-pass-refined.json`
- Verified in browser on the isolated stack:
  `/workbench/editor?pack=workspace-pump-holder` renders the dedicated editor surface and selected pack state
  `/workbench/sandbox/26a3f309-e0d1-4da4-9177-0c63f3f53c64` renders the dedicated run-detail surface from `/api/operator/runs/:id`
  `/discovery-lab/studio` renders while showing the current active dedicated-run state through the compatibility chrome
  `/discovery-lab/results?runId=e6fbc2d4-f327-4786-865c-3a3751a1e9e5` renders the retained results surface over the dedicated run/result seams
- Verification nuance:
  the Playwright runs saw repeated Next dev HMR websocket handshake noise on `/_next/webpack-hmr` behind dashboard basic auth.
  Those were console-only dev-server artifacts; the page loads themselves completed without page errors.

## Major Draft-Plan Items Still Outstanding After This Follow-up

- The draft backend target map is still not complete:
  `MarketIntelService`, broader market route ownership, enrichment orchestration, webhook/watch services, and adaptive service-map work are still outstanding.
- The draft database plan is still mostly deferred beyond the already-landed transition slices:
  no `StrategyRun` or `StrategyRunGrade`,
  no enrichment/adaptive tables,
  no promoted metadata-column follow-through beyond `ExitPlan`,
  and no additional view backfill in this pass.
- `DiscoveryLabService` still exists as retained compatibility and helper code.
  It is no longer the operator run-execution owner or pack persistence owner, but the monolith itself has not been deleted yet.
- The discovery-lab market and strategy-idea surfaces still remain discovery-lab-owned compatibility areas.
  They have not yet been moved onto the fuller market/enrichment seams expected by `draft_backend_plan.md`.
- `TradingSessionService` remains authoritative as required, but the draft session backlog is not finished:
  revert/resume-style session flows and the broader live deployment guard surface are still pending.
- The additive index candidate for `TradingSession` rollups on `Position.liveStrategyRunId` remains deferred because this pass still did not produce query evidence strong enough to justify schema churn.

## Follow-up - Phase-2/Phase-3 Market And Enrichment Ownership Pass

- Re-read `draft_rollout_plan.md`, `draft_database_plan.md`, `draft_backend_plan.md`, and `draft_dashboard_plan.md` against the actual code before touching anything.
  The biggest still-missing production-grade items were not cosmetic:
  phase 2 still had split authority around market/intel behavior,
  phase 3 still had no real dedicated market/enrichment service slice,
  runtime still instantiated discovery-lab-owned market/token/suggestion services directly,
  and the dashboard `/market/*` group still leaned on discovery-lab route ownership.
- Landed the missing phase-3 service map in real backend code instead of another adapter-only pass:
  `trading_bot/backend/src/services/market/market-intel-service.ts`
  now owns market pulse/trending plus focus-token assembly,
  `trading_bot/backend/src/services/market/market-strategy-ideas-service.ts`
  now owns strategy-idea generation,
  and `trading_bot/backend/src/services/enrichment/token-enrichment-service.ts`
  now owns mint-level enrichment/token-intel payloads.
- Added real dedicated operator routes for those owners:
  `GET /api/operator/market/trending`
  `GET /api/operator/market/strategy-suggestions`
  `GET /api/operator/enrichment/:mint`
  in
  `trading_bot/backend/src/api/routes/market-routes.ts`
  and
  `trading_bot/backend/src/api/routes/enrichment-routes.ts`.
- Rewired runtime ownership in
  `trading_bot/backend/src/engine/runtime.ts`
  so the process no longer boots discovery-lab-owned market/token/suggestion services as the production owners.
  `StrategyRunResultsService` now resolves token insight through the dedicated enrichment seam too.
- Reduced `DiscoveryLabService` authority again instead of leaving phase 2 half-finished:
  `GET /api/operator/discovery-lab/market-stats`
  and
  `GET /api/operator/discovery-lab/strategy-suggestions`
  are now thin compatibility adapters over the dedicated market seams.
  The retained discovery-lab route family still exists, but those endpoints should no longer be treated as owners.
- Moved dashboard route ownership toward the draft target in the same pass:
  `trading_bot/dashboard/app/market/trending/page.tsx`
  and
  `trading_bot/dashboard/app/market/token/[mint]/page.tsx`
  now read `/api/operator/market/*` directly.
  `trading_bot/dashboard/app/discovery-lab/market-stats/page.tsx`
  and
  `trading_bot/dashboard/app/discovery-lab/strategy-ideas/page.tsx`
  also read the new operator market routes directly, with the legacy discovery-lab routes kept only as compatibility aliases.
- Fixed a real production hole found during verification, because of course the first cut lied:
  `/market/token/:mint` could render without a focus-token card unless that mint was already cached.
  Root cause was `focusOnly=true` reads returning cached board state without forcing a focus-token refresh.
  `MarketIntelService` now refreshes the focus token when needed, so the token page has a real owner and a usable contract.

## What I Verified In This Follow-up

- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`
- Direct backend verification on the isolated backend at `http://127.0.0.1:3201` with host DB override
  `DATABASE_URL=postgresql://botuser:botpass@localhost:56432/trading_bot`
- Verified dedicated production routes directly:
  `GET /api/operator/market/trending?limit=5&refresh=true`
  returned live market data (`tokenUniverseSize: 8` during the check)
  `GET /api/operator/market/strategy-suggestions?refresh=true`
  returned live suggestion payloads
  `GET /api/operator/enrichment/AhbbkmC4moSJWfKyje5gY8VD4Rdv3kt9GXXnNchnpump`
  returned a real enrichment payload
- Verified retained compatibility routes still behave as adapters:
  `GET /api/operator/discovery-lab/market-stats?limit=5`
  and
  `GET /api/operator/discovery-lab/strategy-suggestions?refresh=true`
  both returned coherent payloads through the new owners.
- Verified dashboard proxy wiring directly on the live dashboard at `http://127.0.0.1:3203` with basic auth:
  `/api/operator/market/trending?limit=5&refresh=true`
  and
  `/api/operator/market/strategy-suggestions?refresh=true`
  both returned `200`.
- Browser verification was attempted and partially proved with Playwright against the live dashboard.
  Captured:
  `output/playwright/market-trending.png`
  `output/playwright/market-token.png`
  `output/playwright/discovery-market-stats.png`
  `output/playwright/discovery-strategy-ideas.png`
  `output/playwright/market-token-focus-fixed.png`
  `output/playwright/phase23-market-verification.json`
  `output/playwright/phase23-market-refresh-checks.json`
- Browser-proved page loads:
  `/market/trending`
  `/market/token/<mint>`
  `/discovery-lab/market-stats`
  `/discovery-lab/strategy-ideas`
  all loaded with `200`.
  The token page specifically showed the focus-token content after the server-side fix.
- Verification limits:
  the pages emitted Next dev HMR websocket noise behind auth in this local setup,
  and the automated in-page refresh click path was attempted but not fully proven in rendered page state within the wait window.
  Direct backend refresh routes and direct dashboard proxy refresh routes were proven separately, so the route ownership is verified even if that one click-path remains noisy.

## Major Draft-Plan Items Still Outstanding After This Follow-up

- Phase 2 is materially closer to done, but `DiscoveryLabService` still exists as retained compatibility/helper code. It is no longer a major production owner for pack/run/market work in the touched areas, but the monolith is not deleted.
- Phase 3 is materially started and partly completed through the market/enrichment slice, but the full draft backend target map is still not complete:
  webhook/watch ownership (`HeliusWatchService`, smart-wallet ingest),
  adaptive service-map work,
  and the broader live-guard/session backlog still remain.
- The database draft is still intentionally incomplete after this pass:
  no `StrategyRun` or `StrategyRunGrade`,
  no enrichment/adaptive tables,
  no additional market/enrichment views,
  and no additive session-rollup index was introduced.
- `/market/token/:mint` still reuses the market-trending/focus payload rather than a final page-specific enrichment contract. Backend ownership is fixed; final page decomposition is not.

## Follow-up - Phase-4 Session And Deployment Guardrail Pass

### What Phase 4 Means Now

- The original draft phase 4 was the workbench UI. That is no longer the real gap. The route groups and primary pages already exist.
- The production-grade phase-4 hole at the start of this pass was the deployment/session contract:
  `/workbench/sessions` could read history, but it could not start a session,
  `TradingSessionService` still did not own pause/resume/revert,
  `POST /api/operator/runs/:id/apply-live` was still the practical deployment owner,
  and the draft guardrails for explicit confirmation plus `LIVE` deploy gating were still missing.
- So phase 4 now means: finish the session/deployment operator seam at production-ready level, with `TradingSessionService` as the authority and the workbench using that seam directly.

### Major Draft-Plan Items Still Missing At The Start Of This Pass

- No authoritative `POST /api/operator/sessions` deployment-start contract.
- No authoritative session `pause`, `resume`, or `revert` actions.
- No explicit operator confirmation on deployment start.
- No `LIVE` deploy guard on trusted IP plus separate deploy token.
- `/workbench/sessions` was still mostly a read-only history surface.
- `/api/operator/runs/:id/apply-live` and the discovery-lab apply route still mattered more than the session seam for real deployment behavior.

### What Changed

- Landed the real phase-4 backend session contract in
  `trading_bot/backend/src/services/session/trading-session-service.ts`.
  `TradingSessionService` now owns:
  session start,
  pause,
  resume,
  stop,
  revert-from-previous-config,
  replacement semantics,
  and deployment-state transitions.
- Added the authoritative session-start route:
  `POST /api/operator/sessions`
  in
  `trading_bot/backend/src/api/routes/session-routes.ts`.
  The request now requires an explicit confirmation phrase, and `mode=LIVE` also requires the separate live deploy token plus a trusted caller IP.
- Expanded
  `PATCH /api/operator/sessions/:id`
  from stop-only into the real lifecycle route:
  `pause`,
  `resume`,
  `stop`,
  and
  `revert`.
- Kept `TradingSessionService` authoritative and collapsed compatibility entry points onto it instead of creating yet another owner.
  `POST /api/operator/runs/:id/apply-live`
  and
  `POST /api/operator/discovery-lab/apply-live-strategy`
  now cut through the same guarded session-start contract.
- Added the missing runtime callback bridge so session `resume` can re-arm live loops through runtime without moving authority back out of the session seam.
- Added the new live-deploy env contract:
  `LIVE_DEPLOY_ALLOWED_IPS`
  and
  `LIVE_DEPLOY_2FA_TOKEN`
  in backend env parsing and `.env.example`.
- Updated the dashboard proxy to forward `x-forwarded-for` / `x-real-ip`, which lets the backend enforce the `LIVE` trusted-IP gate from real dashboard traffic.
- Moved `/workbench/sessions` from read-only history to a usable operator surface.
  The page now:
  shows runtime pause state,
  can start a session from recent runs,
  and can pause, resume, stop, or revert the active session.
- Updated the shared workbench action component so sandbox/grader now start sessions through the session seam instead of the old run-owned shortcut.

### What I Verified

- Builds:
  `cd trading_bot/backend && npm run build`
  `cd trading_bot/dashboard && npm run build`
- Direct backend contract checks on an isolated backend:
  backend on `http://127.0.0.1:3211`
  with
  `DATABASE_URL=postgresql://botuser:botpass@localhost:56432/trading_bot`
  `CONTROL_API_SECRET=phase4-secret`
  `LIVE_DEPLOY_ALLOWED_IPS=127.0.0.1,::1`
  `LIVE_DEPLOY_2FA_TOKEN=phase4-token`
- Verified the new session seam directly:
  `POST /api/operator/sessions` started a DRY_RUN session from a persisted verification run
  `PATCH /api/operator/sessions/:id` with `pause`
  `resume`
  `revert`
  and `stop` all succeeded
  replacement semantics stamped the earlier session as `REPLACED`
  revert stamped the replaced session as `REVERTED`
  `POST /api/operator/sessions` with `mode=LIVE` and a bad token returned `400`
  `POST /api/operator/sessions` with `mode=LIVE` and the configured token succeeded
- Verified the dashboard proxy against the live dashboard on `http://127.0.0.1:3213` behind basic auth (`operator:phase4-secret`):
  `GET /api/operator/sessions?limit=2` returned `200`
  `POST /api/operator/sessions` with a bad live token returned `400` through the proxy too
- Browser verification was attempted and succeeded with Playwright against the live dashboard:
  `/workbench/sandbox/phase4-session-verify-a`
  was loaded under basic auth,
  the browser clicked the new `Start session` control through the real prompt flow,
  and `/workbench/sessions` then rendered the updated session surface.
  Artifacts:
  `output/playwright/phase4-sandbox-start-session.png`
  `output/playwright/phase4-sessions-page.png`
  `output/playwright/phase4-session-browser-check.json`

### Verification Data Notes

- The local database did not contain a clean deployable persisted run for this seam:
  most completed runs were either inline drafts or had zero winners.
- To prove the route behavior cleanly, I seeded two temporary verification `DiscoveryLabRun` rows:
  `phase4-session-verify-a`
  and
  `phase4-session-verify-b`
  from existing persisted pack snapshots with explicit non-zero calibration evidence.
- That verification data was used only to exercise the new session seam and replacement/revert logic.
  No schema or view change was required.
  After verification, those temporary run rows and the session rows created from them were deleted from the local database so the repo state is not left pretending they are real operator history.

### What Major Pieces This Pass Completed

- The biggest remaining production-grade phase-4 item from the draft plans:
  session start/control ownership with real deploy guardrails.
- The missing workbench/operator part of phase 4:
  `/workbench/sessions` is now an actual control surface instead of a history page with dead authority.
- The architectural requirement to keep `TradingSessionService` authoritative while shrinking compatibility owners.

### Major Phase-4 Pieces Still Not Complete After This Pass

- Phase 4 is materially closer to done, but not fully finished against the original dashboard draft:
  `discovery-lab/config` and `discovery-lab/strategy-ideas` still exist,
  the old discovery-lab route family is not deleted,
  and the large retained results/studio client surfaces are still in the tree.
- The draft grader/tuning contract is still missing:
  no `PackGradingService`,
  no `POST /api/operator/runs/:id/grade`,
  and no `suggest-tuning` route yet.
- The draft route-cleanup work is still open:
  redirect-only and compatibility-only discovery-lab surfaces were not deleted in this pass.
- The larger non-phase-4 draft backlog still remains:
  webhook/watch ownership,
  smart-wallet ingest,
  adaptive service-map work,
  and the broader database draft beyond the already-landed transition slices.
