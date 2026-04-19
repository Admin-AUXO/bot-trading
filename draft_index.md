# Planning Docs — Index

Design + planning for the bot-trading rewrite. All docs are drafts — once a phase lands, its content migrates into `notes/reference/*` and the draft is deleted.

**Status:** phases 1–5 are largely landed; phase 6 is **partially implemented**. The repo now has the phase-6 schema slice, provider-credit logging, execution helper services, enrichment clients/fanout, backend-owned market pages, and Grafana generator expansion on `main`. Remaining work is mostly production hardening, deeper Helius wiring, adaptive/pack rollout, and final workbench cleanup.

**Progress snapshot (2026-04-18):**
- Phase 6 schema slice landed:
  `ProviderCreditLog`, `FillAttempt`, `MutatorOutcome`, and `SmartWalletFunding` now exist in `trading_bot/backend/prisma/schema.prisma`, along with the new provider telemetry views in `trading_bot/backend/prisma/views/create_views.sql`.
- Execution helper services landed:
  `trading_bot/backend/src/services/helius/priority-fee-service.ts`,
  `services/execution/quote-builder.ts`,
  `swap-builder.ts`,
  and `swap-submitter.ts`
  now exist and build cleanly, but they are not yet the sole production execution path.
- Provider-budget generalization landed:
  `trading_bot/backend/src/services/provider-budget-service.ts`
  is now provider-keyed and writes `ProviderCreditLog` rows.
- Enrichment fabric landed partially:
  the 8 provider clients exist,
  `TokenEnrichmentService` now fans out through `EnrichmentFact`,
  `/api/operator/enrichment/:mint` returns provider states + `compositeScore`,
  and `/market/token/:mint` renders those cards.
- Market compatibility pages became real backend-owned pages:
  `/market/trending`,
  `/market/token/[mint]`,
  `/market/watchlist`
  now read operator-owned routes instead of delegating to the old discovery-lab market client.
- Grafana phase-6 generator work landed:
  the 7 new dashboard builders exist and `node scripts/build-dashboards.mjs` emits valid JSON on `main`.
- Backend phase-1 seam extraction landed:
  `trading_bot/backend/src/api/server.ts` is now a composition root and route registration is split under `trading_bot/backend/src/api/routes/`.
- Operator-desk seam extraction landed:
  `trading_bot/backend/src/services/operator-desk.ts` now delegates blocker, diagnostics, action, and candidate-bucket helpers to `trading_bot/backend/src/services/desk/operator-desk-builders.ts`.
- Runtime wiring was reduced:
  `trading_bot/backend/src/engine/runtime.ts` now groups API handler bags instead of wiring every callback inline.
- Dashboard IA transition layer landed:
  `trading_bot/dashboard/lib/dashboard-routes.ts`, `dashboard-navigation.ts`, `next.config.ts`, and new `app/workbench/*` + `app/market/*` pages establish the target URL shape as compatibility routes over the existing discovery-lab/operator surfaces.
- API compatibility aliases landed:
  `/api/operator/shell`, `/api/operator/home`, `/api/operator/events`, plus the dedicated `/api/operator/packs*`, `/api/operator/runs*`, `/api/operator/sessions*`, and `/api/operator/market/*` seams.
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
- Draft database phase beyond the current phase-6 slice:
  `ExitPlanMutation`, `ConfigReplay`, `ThresholdSearchRun`, `ThresholdSearchTrial`, wider metadata-column promotions, and the final `Position.metadata.exitPlan` read-path removal.
- Draft backend phase beyond the current partial phase-6 push:
  deeper `HeliusWatchService` / webhook ownership, smart-wallet ingest, session budget forecasting, config replay, adaptive mutator attribution, and full engine cutover onto the new execution services.
- Draft dashboard/workbench phase beyond the market pass:
  true `/workbench/editor` and `/workbench/grader/[runId]` production surfaces, browser verification of the market pages under degraded providers, and deletion of the remaining compatibility debt.
- Draft strategy-pack/adaptive rollout:
  the 10 pack seeds are still docs-only, adaptive mutators are not yet production-grade, and smart-money pack automation is still pending data/ingest hardening.

**Recommended next pass for the next agent (production hardening push):**
1. Start from `draft_rollout_plan.md` §2 and treat the current repo as **phase-6 partial**, not a fresh blank slate.
2. Finish **6a Helius** first: real webhook/watch ownership, smart-wallet ingest, creator-lineage completion, and account/transaction subscriptions.
3. Finish **6b/6d** cutover work next: wire the new execution services into the authoritative live path, then land session budget forecasting + alert enforcement on top of `ProviderCreditLog`.
4. Finish **6e/6f** after that: adaptive engine, mutator attribution, pack seeding, then smart-money pack rollout.
5. Finish **6g** only after the backend seams are authoritative: complete `/workbench/editor` + `/workbench/grader`, then delete stale `discovery-lab/*` compatibility code instead of feeding it forever.
6. Use **6h** mostly for alerting and compose hardening now that the dashboard generator work itself is already landed.
7. If the pass leaves live execution split between old and new services, leaves Helius watch/webhook ownership half-built, or leaves session budgeting/alerts as docs-only, it still is not production-ready.


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
