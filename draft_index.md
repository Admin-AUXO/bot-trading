# Planning Docs — Index

Design + planning for the bot-trading rewrite. All docs are drafts — once a phase lands, its content migrates into `notes/reference/*` and the draft is deleted.

**Status:** phases 1–5 implementation partial; phase 6 planning docs have landed. The rewrite has moved past phase-2 operator seams into a coordinated phase-6 push covering execution depth, enrichment fabric, credit tracking, adaptive engine, and Grafana v2.

**Progress snapshot (2026-04-18):**
- Backend phase-1 seam extraction landed:
  `trading_bot/backend/src/api/server.ts` is now a composition root and route registration is split under `trading_bot/backend/src/api/routes/`.
- Operator-desk seam extraction landed:
  `trading_bot/backend/src/services/operator-desk.ts` now delegates blocker, diagnostics, action, and candidate-bucket helpers to `trading_bot/backend/src/services/desk/operator-desk-builders.ts`.
- Runtime wiring was reduced:
  `trading_bot/backend/src/engine/runtime.ts` now groups API handler bags instead of wiring every callback inline.
- Dashboard IA transition layer landed:
  `trading_bot/dashboard/lib/dashboard-routes.ts`, `dashboard-navigation.ts`, `next.config.ts`, and new `app/workbench/*` + `app/market/*` pages establish the target URL shape as compatibility routes over the existing discovery-lab/operator surfaces.
- API compatibility aliases landed:
  `/api/operator/shell`, `/api/operator/home`, `/api/operator/events`, `/api/operator/workbench-market/*`, and `/api/workbench-market/*`.
- First database contract slice landed:
  `trading_bot/backend/prisma/schema.prisma` now includes `StrategyPack` and `StrategyPackVersion`.
- Discovery-lab pack persistence now dual-writes:
  `trading_bot/backend/src/services/discovery-lab-service.ts` mirrors discovery-lab pack sync/save flows into `StrategyPack` + `StrategyPackVersion` while keeping `DiscoveryLabPack` as the editing/source surface for now.
- First pack reporting view landed:
  `trading_bot/backend/prisma/views/create_views.sql` now includes `v_strategy_pack_performance_daily`, exposed through the `/api/views/:name` allowlist in `trading_bot/backend/src/api/routes/utils.ts`.
- Second database contract slice landed:
  `trading_bot/backend/prisma/schema.prisma` now includes `ExitPlan`, linked one-to-one to `Position` with an optional `StrategyPack` relation.
- Exit-plan persistence is now dual-written:
  `trading_bot/backend/src/engine/execution-engine.ts` writes a normalized `ExitPlan` row when a position opens while preserving the existing `Position.metadata.exitPlan` payload for transition safety.
- Exit reads now prefer the normalized row:
  `trading_bot/backend/src/engine/exit-engine.ts` loads `ExitPlan`, and `trading_bot/backend/src/services/strategy-exit.ts` reads the row first with metadata fallback still preserved.
- Third database contract slice landed:
  `trading_bot/backend/prisma/schema.prisma` now includes `TradingSession` plus the supporting `TradingSessionMode` enum.
- First pack/session backend seam landed:
  `trading_bot/backend/src/services/session/trading-session-service.ts` now owns current-session reads and session start from the existing live-strategy apply flow.
- Live-strategy apply now records explicit session state:
  `trading_bot/backend/src/engine/runtime.ts` no longer treats `applyDiscoveryLabLiveStrategy()` as a settings-only shim. The call now routes through `TradingSessionService`, closes any prior active session as `REPLACED`, writes the new session row, and stamps `DiscoveryLabRun.appliedToLiveAt` plus `appliedConfigVersionId`.
- First session API surface landed:
  `trading_bot/backend/src/api/routes/session-routes.ts` now exposes `GET /api/operator/sessions/current`, and `GET /api/status` includes `currentSession` so compatibility surfaces can read the deployed session from the backend seam instead of inferring it only from settings.
- First real session lifecycle/operator pass landed:
  `trading_bot/backend/src/services/session/trading-session-service.ts` now owns bounded session history, explicit stop semantics, pack deployment status transitions, and session-window rollups that honor both `startedAt` and `stoppedAt`.
- Session operator backend now exists for `/workbench/sessions`:
  `trading_bot/backend/src/api/routes/session-routes.ts` now exposes `GET /api/operator/sessions?limit=` plus `PATCH /api/operator/sessions/:id` for `action=stop`, and `trading_bot/dashboard/app/workbench/sessions/page.tsx` now renders the backend-owned current/history surface instead of redirecting to settings.
- First real pack/run operator backend landed:
  `trading_bot/backend/src/services/workbench/strategy-pack-service.ts` and `strategy-run-service.ts` now own dedicated operator pack/run reads and writes over the existing `DiscoveryLabPack` + `DiscoveryLabRun` transition tables instead of forcing the whole workbench surface through discovery-lab route glue.
- Dedicated pack/run route modules landed:
  `trading_bot/backend/src/api/routes/pack-routes.ts` and `run-routes.ts` now expose `GET|POST|PATCH|DELETE /api/operator/packs`, `GET|POST /api/operator/packs/:id/runs`, `GET /api/operator/runs`, `GET /api/operator/runs/:id`, and `POST /api/operator/runs/:id/apply-live`.
- Runtime and discovery-lab glue own less pack/run behavior:
  `trading_bot/backend/src/engine/runtime.ts` now wires dedicated pack/run handler bags, and the compatibility discovery-lab run/apply endpoints delegate through the new run service instead of reaching straight into `DiscoveryLabService` and `TradingSessionService`.
- More of the target workbench IA is real:
  `trading_bot/dashboard/app/workbench/packs/page.tsx`, `workbench/sandbox/page.tsx`, and `workbench/sandbox/[runId]/page.tsx` are now backend-owned pages instead of redirects, using the dedicated operator pack/run routes directly.
- Live-strategy deployment ownership is now tighter:
  `trading_bot/backend/src/services/runtime-config.ts` no longer allows `/api/settings` to patch `strategy.liveStrategy.*` directly, and `trading_bot/backend/src/services/discovery-lab-service.ts` no longer infers which `StrategyPack` is `LIVE` from settings during pack sync.
- Active-session database guard landed:
  `trading_bot/backend/prisma/views/create_views.sql` now owns `trading_session_one_active_idx`, the partial unique index enforcing at most one active `TradingSession` row with `stoppedAt IS NULL`.
- Docs updated:
  `notes/reference/api-surface.md`, `notes/reference/dashboard-operator-ui.md`, `notes/reference/prisma-and-views.md`, and `notes/sessions/2026-04-18-dashboard-backend-simplification-pass.md`.

**Verified in this slice:**
- `cd trading_bot/backend && npm run db:generate`
- `cd trading_bot/backend && npm run build`
- `cd trading_bot/dashboard && npm run build`

**Verification note:**
- `cd trading_bot/backend && npm run db:setup` still fails from the host shell under the checked-in `.env` because `DATABASE_URL` points at `postgres:5432`, which does not resolve outside Docker. The schema and views do apply cleanly when the host overrides `DATABASE_URL` to `localhost:56432`.

**Not landed yet:**
- Draft database phase beyond the first three contract slices:
  adaptive/enrichment tables, promoted metadata columns, additional SQL views, and the `ExitPlan` metadata-read cutover/removal work.
- Draft backend phase beyond seam extraction and the first real session operator pass:
  session revert-from-config-version flow, broader engine decomposition, richer pack/editor/grader mutation flows beyond the first operator surface, enrichment clients, and webhook/watch services.
- Draft dashboard phase beyond the first real `/workbench/sessions` screen:
  true `/workbench/editor`, `/workbench/grader`, and `/market/*` implementations instead of discovery-lab delegation or redirects.

**Recommended next pass for the next agent (phase 6 push):**
1. Start from `draft_rollout_plan.md` §2 (phase 6 sub-phases) and `draft_database_plan.md` Phase 6+ additions.
2. Preferred cut-in point: land the phase 6+ schema adds first (`ProviderCreditLog`, `FillAttempt`, `MutatorOutcome`, `ConfigReplay`), so every subsequent sub-phase writes against the real tables.
3. After schema, run **6a Helius** + **6b Execution** + **6d Credit tracking** in parallel — each has a different seam and they compose cleanly.
4. 6c Enrichment fabric lands next (depends on 6d for proper credit accounting on free/paid providers).
5. 6e Adaptive engine + packs before 6f Smart-money. Adaptive must be live before smart-money pack rides on top of it.
6. 6g Workbench completion (editor + grader + market) in a dedicated worktree; reuse the backend-owned routes that already exist.
7. 6h Grafana last — it consumes views from every prior sub-phase.
8. The agent should be willing to add and remove files aggressively where that clarifies ownership: delete the remaining `discovery-lab/*` compatibility code once backend-owned workbench/market routes are authoritative; collapse metadata-blob read paths that dual-write is replacing.
9. If the pass leaves `Fill.metadata.live.*` still being read, or Jito lane still not integrated, or any paid-provider call path still bypassing `ProviderBudgetService`, the agent did not go far enough.


## Start here

| Doc | Read when |
|---|---|
| [draft_workflow_principles.md](draft_workflow_principles.md) | First. The "why" — trading principles, guardrails, operator session flow. |
| [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) | The "what" — 10 packs (6 runners, 4 scalps), adaptive engine, removal audit. |
| [draft_rollout_plan.md](draft_rollout_plan.md) | The "how" — 6 phases, sub-agent delegation, guardrails per phase. |

## Deep specs (one per surface)

| Doc | Covers |
|---|---|
| [draft_database_plan.md](draft_database_plan.md) | Core + phase 6+ tables (ProviderCreditLog, FillAttempt, MutatorOutcome, ConfigReplay, ThresholdSearch*), column promotions, views, deletions |
| [draft_backend_plan.md](draft_backend_plan.md) | Service-by-service spec, engine pipeline, API routes, webhooks, Smart-Money build |
| [draft_helius_integration.md](draft_helius_integration.md) | Per-endpoint audit + verdicts for 13 Helius capabilities; stream-vs-webhook decision guide; service wiring |
| [draft_execution_plan.md](draft_execution_plan.md) | Jupiter + Jito + priority-fee execution: MC-tier slippage caps, entry/exit decision trees, lane rules, 25-row recommendation→surface map |
| [draft_credit_tracking.md](draft_credit_tracking.md) | Per-call credit ledger, session-start forecast, alert thresholds, Credit Burn dashboard spec |
| [draft_dashboard_plan.md](draft_dashboard_plan.md) | Next.js page-by-page UI/UX, panel budgets, shell, IA, component decomposition |
| [draft_grafana_plan.md](draft_grafana_plan.md) | 7 new dashboards + auto-generator extension recipe + alert rules + compose hardening |

## Reference

| Doc | Covers |
|---|---|
| [draft_market_stats_upgrade.md](draft_market_stats_upgrade.md) | 8 free-API providers: call pattern · TTL · rate limit · role · composite-score weight · call-sequence diagram |

## Skills + codex agents (for sub-agent delegation)

Each skill has a matching Codex agent. Parity verified by `node scripts/claude-harness/check-parity.mjs`.

| Skill | Use when |
|---|---|
| [strategy-pack-authoring](.agents/skills/strategy-pack-authoring/SKILL.md) | Editing / versioning / grading `StrategyPack` rows |
| [adaptive-thresholds](.agents/skills/adaptive-thresholds/SKILL.md) | `AdaptiveThresholdService`, mutator axes, evaluator / exit seams |
| [token-enrichment](.agents/skills/token-enrichment/SKILL.md) | Provider clients + `TokenEnrichmentService` caches |
| [smart-money-watcher](.agents/skills/smart-money-watcher/SKILL.md) | Wallet curation, Helius webhooks, `SMART_MONEY_RUNNER` pack |

Existing skills (`strategy-safety`, `database-safety`, `grafana`, `dashboard-*`, `birdeye-discovery-lab`, etc.) remain first-class — see `.agents/skills/`.

---

## Reading orders

- **New to the project:** principles → packs v2 → rollout. Skip deep specs on first pass.
- **Implementing a phase:** rollout plan → the deep spec for that surface → principles for guardrails.
- **Authoring a pack:** packs v2 + `strategy-pack-authoring` skill.
- **Adding an enrichment provider:** market-stats upgrade + credit-tracking + `token-enrichment` skill.
- **Shipping the Smart-Money pack:** backend plan §4.5 + packs v2 §B.1 pack 2 + helius integration §2 + `smart-money-watcher` skill.
- **Touching execution (entry/exit/fees):** execution plan → helius integration (priority fee + Sender sections) → packs v2 exit table.
- **Wiring Helius deeper:** helius integration → backend plan §4 → execution plan §5 → credit tracking.
- **Adding a Grafana dashboard:** grafana plan → database plan phase 6+ views → credit tracking §7 (if credit-related).
