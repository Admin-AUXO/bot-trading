# Rollout Plan — Phases, Sub-Agents, Confirmation Answers

Companion to all other `draft_*.md` docs. This is the execution schedule.

Status snapshot as of **2026-04-18**:
- The repo is no longer in "structured docs only" mode. Major slices of phases 1-6 have already landed on `main`.
- This draft now serves as a remaining-work map, not a greenfield rollout.
- Anything marked `LANDED` below should be verified against code and `notes/reference/*`, not re-planned from scratch.

---

## 1. Confirmation answers (locked)

| # | Question | Answer |
|---|---|---|
| 1 | Implementation timing | Defer — structured docs only for now |
| 2 | Pack import | Seed all **10 new packs** from scratch in the strategy doc only (no DB yet) |
| 3 | Smart-money pack | Include **clear build instructions** — see [draft_backend_plan.md §5](draft_backend_plan.md) |
| 4 | Grafana | **Extend the auto-generator** — see [draft_grafana_plan.md §2](draft_grafana_plan.md) |
| 5 | Skills | **Prepare skills now** — see §4 below |

## 2. Phase order

Workbench UI (phase 4) ships **before** the adaptive engine (phase 5) so the operator has a UI surface to manage adaptive rollout from.

### Phase 1 — Foundation (no behavior change) — **LANDED (2026-04-18)**
- Prisma adds for the first three contract slices: `StrategyPack`, `StrategyPackVersion`, `ExitPlan`, `TradingSession` + enum.
- First pack reporting view: `v_strategy_pack_performance_daily`.
- Active-session guard: `trading_session_one_active_idx` partial unique index.
- Broader view backfill + remaining column promotions still to land — carried forward into phase 6+ work.

### Phase 2 — Pack as first-class object (internal only) — **LANDED (2026-04-18)**
- Discovery-lab pack sync/save dual-writes to `StrategyPack` + `StrategyPackVersion`.
- `ExitPlan` row written at open; exit-engine prefers it; metadata fallback still present (cutover/removal in phase 6+).
- Dedicated pack/run service + route modules in place; runtime glue trimmed.
- Live-strategy ownership tightened; settings no longer patches `strategy.liveStrategy.*` directly.

### Phase 3 — Enrichment & Helius expansion — **PARTIAL**
- Landed later during phase 6: `TokenEnrichmentService` fanout, the 8 free-provider clients, `EnrichmentFact`-backed caching, and `/api/operator/enrichment/:mint`.
- Still not landed: deeper `HeliusWatchService` ownership (LP removal, holder dump, smart-wallet streaming, creator-lineage live hooks) — see [draft_helius_integration.md](draft_helius_integration.md).
- Still not landed: evaluator / exit-engine consumers using the full enrichment bundle as the new primary contract.

### Phase 4 — Workbench UI — **PARTIAL**
- Landed: dedicated `/workbench/packs`, `/workbench/editor`, `/workbench/editor/[id]`, `/workbench/sandbox`, `/workbench/sandbox/[runId]`, `/workbench/grader`, `/workbench/grader/[runId]`, `/workbench/sessions` pages + backend routes.
- Landed later during phase 6: real `/market/trending`, `/market/token/[mint]`, and `/market/watchlist` pages replaced the compatibility stubs.
- Still to land: `results-board.tsx` decomposition + deletion of remaining `discovery-lab/*` compatibility code once those old seams are actually dead.
- Guardrail still to land: `mode=LIVE` IP + 2FA gate; capital brake confirmation on manual entry.

### Phase 5 — Adaptive engine + 10 new packs — **OPERATOR SEAMS PARTIAL; engine/packs pending**
- Landed: operator seams for session/pack/run ownership that unblock the adaptive engine.
- Not yet landed: `AdaptiveThresholdService` wired into evaluator + exit-engine; default `settings.adaptive.enabled=false`.
- Not yet landed: seed packs 1–10 as `StrategyPack` DRAFT rows; 48 h sandbox each before `TESTING`.
- Not yet landed: exit-mutators (30 paper exits per mutator at neutral-or-better PnL before live).
- Not yet landed: smart-wallet stream + `SMART_MONEY_RUNNER` pack — go live after 7 days of clean `SmartWalletEvent` ingest.

### Phase 6 — Execution depth, enrichment fabric, credit accounting, Grafana v2, workbench completion

This phase is the large coordinated push across the surfaces the earlier phases staged. Sub-phases:

- **6a — Helius wire-up.** **PARTIAL.** `HeliusPriorityFeeService` and Sender-aware execution support landed; the deeper `HeliusWatchService`, enhanced websocket ownership, and smart-wallet stream plumbing are still pending. See [draft_helius_integration.md](draft_helius_integration.md).
- **6b — Execution depth.** **PARTIAL.** `QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`, priority-fee service, and Jito-lane support landed as new services. Full engine cutover, richer retry telemetry, and production soak verification remain. See [draft_execution_plan.md](draft_execution_plan.md).
- **6c — Enrichment fabric.** **PARTIAL.** 8 free-provider clients, `TokenEnrichmentService` fanout with `EnrichmentFact` cache, `/api/operator/enrichment/:mint`, and `/market/token/:mint` enrichment cards landed. Evaluator ownership, live hardening, and deeper lineage / holder integrations remain. See [draft_market_stats_upgrade.md](draft_market_stats_upgrade.md).
- **6d — Credit tracking.** **PARTIAL.** `ProviderBudgetService` is generalized, `ProviderCreditLog` exists, and the credit views / dashboard generator landed. `CreditForecastService`, session-start enforcement, and alert-rule rollout remain. See [draft_credit_tracking.md](draft_credit_tracking.md).
- **6e — Adaptive engine & packs.** **MOSTLY PENDING.** `MutatorOutcome` schema exists, but `AdaptiveThresholdService`, pack seeding, and mutator attribution loops are not done.
- **6f — Smart-money pack.** Wallet curation + webhooks + `SmartWalletEvent` ingest; `SMART_MONEY_RUNNER` pack after 7 days clean data.
- **6g — Workbench completion.** **PARTIAL.** `/workbench/editor`, `/workbench/grader`, and the `/market/*` surfaces landed, but discovery-lab compatibility removal and results-board decomposition remain.
- **6h — Grafana v2.** **PARTIAL.** The 7 new dashboards and generator extension landed; alert rules and docker-compose hardening remain. See [draft_grafana_plan.md](draft_grafana_plan.md).
- **6i — Phase 6+ schema adds.** **PARTIAL.** `FillAttempt`, `ProviderCreditLog`, `MutatorOutcome`, and `SmartWalletFunding` landed. `ExitPlanMutation`, `ConfigReplay`, and `ThresholdSearchRun/Trial` remain. See [draft_database_plan.md Phase 6+ additions](draft_database_plan.md#phase-6-additions).

Order of sub-phases: 6a ↔ 6b can run in parallel (different seams); 6c depends on nothing but benefits from 6d landing first so credit panels are accurate from day one; 6e → 6f is strict; 6g runs concurrently with 6c–6e as separate worktrees; 6h lands last and consumes the views from all prior sub-phases; 6i threads through 6a–6h (schema adds drop before their first consumer).

## 3. Sub-agent delegation map

Each phase is small enough for a focused sub-agent. Each agent gets: this doc + its phase block + the three companion docs + scoped read access.

| Agent role | Owns | Skill surface |
|---|---|---|
| `schema-migrator` | Phase 1 + 6i: Prisma, view SQL, `db:generate`, dual-write verification | `database-safety`, `strategy-safety` |
| `backend-extractor` | Phase 2: lane extraction, singleton collapse, pack import | `strategy-safety`, `code-navigation` |
| `execution-builder` | Phase 6b: `QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`, Jito lane, priority-fee service | `strategy-safety` |
| `enrichment-integrator` | Phase 6c: 8 clients + `TokenEnrichmentService` | `token-enrichment`, `birdeye-discovery-lab` |
| `helius-watcher` | Phase 6a: `HeliusWatchService`, webhooks, enhanced websocket subs | `smart-money-watcher`, `strategy-safety` |
| `credit-bookkeeper` | Phase 6d: `ProviderCreditLog`, forecast service, alerts | `database-safety`, `grafana` |
| `dashboard-decomposer` | Phase 4 + 6g: `results-board.tsx` split + new workbench/market routes | `dashboard-ui-ux`, `dashboard-operations` |
| `adaptive-engine-builder` | Phase 6e: `AdaptiveThresholdService` + pack seeds + exit mutators (extra review) | `adaptive-thresholds`, `strategy-pack-authoring`, `strategy-safety` |
| `smart-money-builder` | Phase 6f: wallet curation + webhook plumbing + signal aggregation for pack 2 | `smart-money-watcher`, `strategy-safety` |
| `grafana-builder` | Phase 6h: dashboard JSON + view additions | `grafana` |
| `session-briefer` (existing) | Pre-phase brief | `session-bookends` |
| `research-scout` (existing) | One-off provider API spot checks | `web-research-workflow` |

## 4. Skills prepared in this pass

New skills under `.agents/skills/`:

| Skill | Use when |
|---|---|
| `strategy-pack-authoring` | Editing or creating `StrategyPack` rows, pack versions, pack grades |
| `adaptive-thresholds` | Changes to `AdaptiveThresholdService`, mutator axes, or evaluator/exit-engine seams |
| `token-enrichment` | Adding/changing enrichment clients (Trench, Bubblemaps, Solsniffer, Pump.fun, Jupiter, GeckoTerminal, Cielo) or `TokenEnrichmentService` |
| `smart-money-watcher` | Wallet curation, Helius webhook plumbing, `SmartWalletEvent` ingestion, pack 2 |

Each has a Codex counterpart under `.codex/agents/` for harness parity. Run `node scripts/claude-harness/check-parity.mjs` after.

## 5. Global guardrails (carried from every phase)

- No live-capital code path changes in phases 1–3.
- Every table, view, and service addition ships with an acceptance-criteria line.
- Dual-write ≥7 days for every metadata→column promotion.
- Pack `LIVE` requires `grade ∈ {A, B}` — API-enforced.
- Exit-engine live mutators: 30 paper exits per mutator at neutral-or-better PnL before live.
- Webhook cap: 5 per active position + 60 smart-wallet.
- Smart-money pack: 7 days clean ingestion + 48 h sandbox before LIVE.
- Every planning doc is a draft — once its content is implemented, migrate to `notes/reference/*` and delete.

## 6. What happens next

1. Treat [draft_index.md](draft_index.md) as the current "landed vs remaining" snapshot before claiming work.
2. Run `node scripts/claude-harness/check-parity.mjs` before spawning any sub-agent that touches harness-owned skills or agent configs.
3. Preferred next production-hardening order from the current repo state: **6a remaining Helius wire-up + 6d session-budget enforcement in parallel → 6b engine cutover verification → 6e adaptive engine → 6f smart-money pack → 6g compatibility deletion → 6h alert/docker hardening**.
4. After each remaining slice lands, migrate the consumed content from its draft into `notes/reference/*` and delete the obsolete draft section (draft docs are blueprints, not permanent reference).
