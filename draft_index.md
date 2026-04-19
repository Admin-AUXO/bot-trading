# Planning Drafts — Index

Snapshot date: **2026-04-18**.

These drafts are **remaining-work maps**, not a greenfield plan. The bulk of phases 1–5 and much of phase 6 is in `main`. Each draft starts with a "Landed" section that cites real file paths, followed by a "Remaining" section. Use this index to find the right draft, not to read them all end-to-end.

---

## How to use these docs

1. Start from [draft_rollout_plan.md](draft_rollout_plan.md) — the single source of truth for what still needs to ship and in what order.
2. Open the topic-specific draft only when you're about to touch that surface.
3. Every "landed" claim references a file path. Verify that the file still exists before acting — the drafts lag behind commits.
4. Once a section's remaining work lands, update the draft in the same PR. If a whole draft becomes empty of remaining work, delete it (or migrate durable notes into `notes/reference/*`).

---

## Docs map

| Draft | Scope | Primary consumer |
|---|---|---|
| [draft_rollout_plan.md](draft_rollout_plan.md) | Phase matrix, remaining-work ordering, agent delegation, guardrails | Every agent |
| [draft_database_plan.md](draft_database_plan.md) | Schema deltas still to land (ExitPlanMutation, ConfigReplay, ThresholdSearchRun/Trial), view backfill list, migration policy | `schema-migrator` |
| [draft_backend_plan.md](draft_backend_plan.md) | Service ownership map, wiring gaps (MutatorOutcome writes, adaptive defaults, discovery-lab deletion) | `backend-extractor`, `adaptive-engine-builder` |
| [draft_execution_plan.md](draft_execution_plan.md) | Live-execution depth: lane selection, priority fee tiers, retry/soak verification | `execution-builder` |
| [draft_helius_integration.md](draft_helius_integration.md) | HeliusWatchService expansion, websocket subs, smart-wallet stream, webhook ops | `helius-watcher` |
| [draft_market_stats_upgrade.md](draft_market_stats_upgrade.md) | Enrichment fabric: evaluator ownership, composite score, hardening, live mode policy | `enrichment-integrator` |
| [draft_credit_tracking.md](draft_credit_tracking.md) | Credit ledger forecast enforcement, session-start brake, alert rollout | `credit-bookkeeper` |
| [draft_dashboard_plan.md](draft_dashboard_plan.md) | Dashboard UI remaining: discovery-lab cleanup, LIVE-mode guards, intervention band | `dashboard-decomposer` |
| [draft_grafana_plan.md](draft_grafana_plan.md) | View backfill list, alert provisioning, docker-compose hardening | `grafana-builder` |
| [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) | The 10 seed-pack recipes (design, not landed) | `adaptive-engine-builder`, `smart-money-builder` |
| [draft_workflow_principles.md](draft_workflow_principles.md) | Durable trading + release guardrails (referenced by every draft) | Every agent |

---

## Landed snapshot (short form)

Everything below has real code on `main` as of 2026-04-18. Check `git log` if in doubt.

**Schema** — [trading_bot/backend/prisma/schema.prisma](trading_bot/backend/prisma/schema.prisma) holds `StrategyPack`, `StrategyPackVersion`, `ExitPlan`, `TradingSession`, `BundleStats`, `EnrichmentFact`, `CreatorLineage`, `ProviderCreditLog`, `FillAttempt`, `MutatorOutcome`, `SmartWalletFunding`, `SmartWallet`, `SmartWalletEvent`, `AdaptiveThresholdLog` plus enums for provider/lane/verdict/funding.

**Services** — 8 enrichment clients + `TokenEnrichmentService` at [trading_bot/backend/src/services/enrichment/](trading_bot/backend/src/services/enrichment/). Execution services (`QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`) at [trading_bot/backend/src/services/execution/](trading_bot/backend/src/services/execution/). Helius services (`HeliusPriorityFeeService`, `HeliusWatchService`) at [trading_bot/backend/src/services/helius/](trading_bot/backend/src/services/helius/). `AdaptiveContextBuilder` + `AdaptiveThresholdService` at [trading_bot/backend/src/services/adaptive/](trading_bot/backend/src/services/adaptive/). `TradingSessionService` at [trading_bot/backend/src/services/session/trading-session-service.ts](trading_bot/backend/src/services/session/trading-session-service.ts). `ProviderBudgetService` and `CreditForecastService` at [trading_bot/backend/src/services/](trading_bot/backend/src/services/).

**Engine wiring** — [execution-engine.ts](trading_bot/backend/src/engine/execution-engine.ts) persists the `ExitPlan` row on open; [graduation-engine.ts](trading_bot/backend/src/engine/graduation-engine.ts) wires `AdaptiveThresholdService` via `settings.strategy.liveStrategy.enabled`; [live-trade-executor.ts](trading_bot/backend/src/services/live-trade-executor.ts) composes the `QuoteBuilder` / `SwapSubmitter` / `HeliusPriorityFeeService` trio.

**API** — 14 route files at [trading_bot/backend/src/api/routes/](trading_bot/backend/src/api/routes/). Includes `/api/operator/enrichment/:mint`, `/api/operator/market/trending`, `/api/operator/market/stats/:mint`, `/api/operator/sessions`, `/api/operator/packs`, `/api/operator/runs`, `/api/operator/adaptive/activity`, and `/webhooks/helius/{smart-wallet,lp,holders}`.

**Views** — 23 views at [trading_bot/backend/prisma/views/create_views.sql](trading_bot/backend/prisma/views/create_views.sql): token metrics (latest + aggregation), candidate (lifecycle, funnel daily, decision facts), position (entry, monitor, pnl daily), fill performance, runtime overview, api telemetry/provider/purpose/endpoint/session, discovery-lab run/pack, strategy-pack performance daily, shared-token-fact cache, adaptive-threshold activity, smart-wallet-mint activity.

**Grafana** — 9 generator modules at [trading_bot/grafana/src/dashboard-generator/](trading_bot/grafana/src/dashboard-generator/) (scorecards, analytics, research, operations, adaptive, credits, enrichment, core, index) emitting 16 JSON dashboards at [trading_bot/grafana/dashboards/](trading_bot/grafana/dashboards/). All 7 phase-6 builders (`buildSessionOverview`, `buildPackLeaderboard`, `buildCandidateFunnel`, `buildExitReasonRCA`, `buildCreditBurn`, `buildAdaptiveTelemetry`, `buildEnrichmentQuality`) are wired into [index.mjs](trading_bot/grafana/src/dashboard-generator/index.mjs).

**Dashboard UI** — [trading_bot/dashboard/app/](trading_bot/dashboard/app/) has real pages for `market/{trending,watchlist,token/[mint]}`, `workbench/{packs,editor,sandbox,grader,sessions}`, `operational-desk/{overview,settings,trading}`, `candidates`, `positions`.

**Tests** — 8 enrichment client tests with JSON fixtures at [trading_bot/backend/tests/enrichment/](trading_bot/backend/tests/enrichment/). Nothing else covered.

---

## Outstanding work — short form

See [draft_rollout_plan.md](draft_rollout_plan.md) for the ordered phase list. The coarse remaining-work set:

- **Views backfill.** 14+ views referenced by the new grafana dashboards don't exist yet (see [draft_grafana_plan.md §2](draft_grafana_plan.md)).
- **MutatorOutcome write-back.** Rows are never inserted. Adaptive Telemetry dashboard is empty of data. Needs close-path attribution in the exit engine.
- **Schema gaps.** `ExitPlanMutation`, `ConfigReplay`, `ThresholdSearchRun`, `ThresholdSearchTrial` are planned but not in `schema.prisma`.
- **Engine hardening.** `execution-engine` still routes through the legacy submit path for some flows; the `SwapSubmitter` retry/soak verification isn't in place.
- **Webhook + websocket ops.** `HeliusWatchService` has webhook ingestion but the smart-wallet event stream / enhanced websocket path is skeletal; webhooks aren't provisioned in infra.
- **Credit enforcement.** `CreditForecastService` computes forecast but the session-start brake and live alert rules aren't wired.
- **Live-mode guards.** `mode=LIVE` IP + 2FA gate and capital-brake confirmation on manual entry aren't implemented.
- **Adaptive default + pack seeding.** `settings.adaptive.enabled` default is not verified off; the 10 seed packs aren't present as `StrategyPack` DRAFT rows.
- **Discovery-lab deletion.** Compatibility code still lives under `services/discovery-lab-*.ts` and `services/workbench/discovery-lab-shared.ts`.
- **Grafana alerts + compose hardening.** `grafana/provisioning/alerting/` is empty; no resource limits or secrets hardening in `docker-compose.yml`.
- **Tests.** Only enrichment clients are covered; services/engines/routes have no tests.

---

## Parallel Work Package map

Every topic draft now carries its own WP section, self-contained for sub-agent dispatch. The rollout plan remains the wave orchestrator; the topic drafts are the per-surface slice.

| WP ID | Draft home | Owner | Surface | Rollout alias |
|---|---|---|---|---|
| WP-DB-1 | [draft_database_plan.md §7](draft_database_plan.md) | schema-migrator | schema.prisma | WP1 |
| WP-DB-2 | [draft_database_plan.md §7](draft_database_plan.md) | schema-migrator | create_views.sql | WP2 |
| WP-DB-3 | [draft_database_plan.md §7](draft_database_plan.md) | schema-migrator | schema indexes | (post-soak) |
| WP-DB-4 | [draft_database_plan.md §7](draft_database_plan.md) | credit-bookkeeper | maintenance cron | B5 |
| WP-BE-1 | [draft_backend_plan.md §4](draft_backend_plan.md) | adaptive-engine-builder | exit-engine + adaptive-threshold | WP3 |
| WP-BE-2 | [draft_backend_plan.md §4](draft_backend_plan.md) | backend-extractor | discovery-lab deletion | WP4 |
| WP-BE-3 | [draft_backend_plan.md §4](draft_backend_plan.md) | enrichment-integrator | graduation-engine filter-gate | WP5 |
| WP-BE-4 | [draft_backend_plan.md §4](draft_backend_plan.md) | credit-bookkeeper | session open + forecast | WP7 |
| WP-BE-5 | [draft_backend_plan.md §4](draft_backend_plan.md) | adaptive-engine-builder | seed-packs + validator | WP8 |
| WP-BE-6 | [draft_backend_plan.md §4](draft_backend_plan.md) | backend-extractor | adaptive default guard | — |
| WP-BE-7 | [draft_backend_plan.md §4](draft_backend_plan.md) | general-purpose | backend tests | WP14 |
| WP-EX-1 | [draft_execution_plan.md §7](draft_execution_plan.md) | execution-builder | lane-selection tests | — |
| WP-EX-2 | [draft_execution_plan.md §7](draft_execution_plan.md) | execution-builder | priority-fee cap | — |
| WP-EX-3 | [draft_execution_plan.md §7](draft_execution_plan.md) | execution-builder | quote-freshness enforcement | — |
| WP-EX-4 | [draft_execution_plan.md §7](draft_execution_plan.md) | manual operator | 24 h paper soak | B3 |
| WP-HE-1 | [draft_helius_integration.md §6](draft_helius_integration.md) | helius-watcher | webhook auto-prov + WS | WP6 |
| WP-HE-2 | [draft_helius_integration.md §6](draft_helius_integration.md) | helius-watcher | smart-wallet 7-day gate | — |
| WP-HE-3 | [draft_helius_integration.md §6](draft_helius_integration.md) | enrichment-integrator | creator lineage loader | — |
| WP-MK-1 | [draft_market_stats_upgrade.md §5](draft_market_stats_upgrade.md) | enrichment-integrator | evaluator cutover | WP5 (shared) |
| WP-MK-2 | [draft_market_stats_upgrade.md §5](draft_market_stats_upgrade.md) | enrichment-integrator | weight validator | — |
| WP-MK-3 | [draft_market_stats_upgrade.md §5](draft_market_stats_upgrade.md) | enrichment-integrator | 8 degraded-path tests | — |
| WP-MK-4 | [draft_market_stats_upgrade.md §5](draft_market_stats_upgrade.md) | dashboard-decomposer | 8 market panels | WP13 |
| WP-MK-5 | [draft_market_stats_upgrade.md §5](draft_market_stats_upgrade.md) | enrichment-integrator | LIVE-mode source gate | — |
| WP-CR-1 | [draft_credit_tracking.md §4](draft_credit_tracking.md) | credit-bookkeeper | session-start gate | WP7 (shared) |
| WP-CR-2 | [draft_credit_tracking.md §4](draft_credit_tracking.md) | credit-bookkeeper | purpose tagging audit | — |
| WP-CR-3 | [draft_credit_tracking.md §4](draft_credit_tracking.md) | grafana-builder | credit alert YAMLs | subset WP11 |
| WP-CR-4 | [draft_credit_tracking.md §4](draft_credit_tracking.md) | credit-bookkeeper | /api/operator/budgets | — |
| WP-CR-5 | [draft_credit_tracking.md §4](draft_credit_tracking.md) | credit-bookkeeper | per-pack attribution | — |
| WP-UI-1 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | backend-extractor + dashboard-decomposer | LIVE-mode guards | WP9 |
| WP-UI-2 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | dashboard-decomposer | results-board split | WP10 |
| WP-UI-3 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | dashboard-decomposer | 8 market panels | WP13 (shared) |
| WP-UI-4 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | dashboard-decomposer | intervention band | B1 |
| WP-UI-5 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | dashboard-decomposer | credit forecast UI | B1 |
| WP-UI-6 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | dashboard-decomposer | weights editor | — |
| WP-UI-7 | [draft_dashboard_plan.md §4](draft_dashboard_plan.md) | dashboard-decomposer | mutator attribution surface | — |
| WP-GF-1 | [draft_grafana_plan.md §8](draft_grafana_plan.md) | grafana-builder | 9 alert YAMLs | WP11 |
| WP-GF-2 | [draft_grafana_plan.md §8](draft_grafana_plan.md) | grafana-builder | compose hardening | WP12 |
| WP-GF-3 | [draft_grafana_plan.md §8](draft_grafana_plan.md) | grafana-builder | lint-dashboards | B2 |
| WP-GF-4 | [draft_grafana_plan.md §8](draft_grafana_plan.md) | grafana-builder | regenerate post-views | — |
| WP-SP-1 | [draft_strategy_packs_v2.md §5](draft_strategy_packs_v2.md) | adaptive-engine-builder | seed-packs (shared WP-BE-5) | WP8 |
| WP-SP-2 | [draft_strategy_packs_v2.md §5](draft_strategy_packs_v2.md) | manual operator | pack promotion loop | B4 |
| WP-SP-3 | [draft_strategy_packs_v2.md §5](draft_strategy_packs_v2.md) | adaptive-engine-builder | pack review cron | — |
| WP-SP-4 | [draft_strategy_packs_v2.md §5](draft_strategy_packs_v2.md) | adaptive-engine-builder | pack retirement job | — |

**Dispatch rule:** when spawning, use the rollout-alias ID where present (it's the wave coordinator); otherwise use the draft-local WP ID. Never spawn two WPs with overlapping file scope (see [draft_rollout_plan.md §3](draft_rollout_plan.md) scope map).

---

## Session bookends

When starting: read this index, then the specific draft(s) for the surface you're editing. Check `git log --oneline -20` to confirm nothing has landed since the snapshot date above. Check `notes/sessions/index.md` for the last operator log.

When finishing: update the relevant draft's "Remaining" list, log a session entry under `notes/sessions/`, and — if a whole draft is now empty — migrate durable content into `notes/reference/*` and delete the draft.
