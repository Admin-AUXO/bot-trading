# Rollout Plan — Phases, Sub-Agents, Confirmation Answers

Companion to all other `draft_*.md` docs. This is the execution schedule. User has confirmed: **no implementation yet — structured docs only.**

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

### Phase 3 — Enrichment & Helius expansion — **PARTIAL (phase 6 finishes)**
- Not yet landed: `TokenEnrichmentService` fanout with Trench / Bubblemaps / Solsniffer / Pump.fun public / Jupiter / GeckoTerminal / Cielo clients (see [draft_market_stats_upgrade.md §A](draft_market_stats_upgrade.md)).
- Not yet landed: `HeliusWatchService` (LP removal, holder dump, creator lineage on-demand) — see [draft_helius_integration.md](draft_helius_integration.md).
- `/api/operator/enrichment/:mint` composite endpoint still to land.

### Phase 4 — Workbench UI — **PARTIAL (first real surfaces landed)**
- Landed: dedicated `/workbench/packs`, `/workbench/sandbox`, `/workbench/sandbox/[runId]`, `/workbench/sessions` pages + backend routes.
- Still to land: `/workbench/editor` (and `/[id]`), `/workbench/grader/[runId]`, `/market/*` pages beyond the compatibility aliases.
- Still to land: `results-board.tsx` decomposition + deletion of remaining `discovery-lab/*` code.
- Guardrail still to land: `mode=LIVE` IP + 2FA gate; capital brake confirmation on manual entry.

### Phase 5 — Adaptive engine + 10 new packs — **OPERATOR SEAMS PARTIAL; engine/packs pending**
- Landed: operator seams for session/pack/run ownership that unblock the adaptive engine.
- Not yet landed: `AdaptiveThresholdService` wired into evaluator + exit-engine; default `settings.adaptive.enabled=false`.
- Not yet landed: seed packs 1–10 as `StrategyPack` DRAFT rows; 48 h sandbox each before `TESTING`.
- Not yet landed: exit-mutators (30 paper exits per mutator at neutral-or-better PnL before live).
- Not yet landed: smart-wallet stream + `SMART_MONEY_RUNNER` pack — go live after 7 days of clean `SmartWalletEvent` ingest.

### Phase 6 — Execution depth, enrichment fabric, credit accounting, Grafana v2, workbench completion

This phase is the large coordinated push across the surfaces the earlier phases staged. Sub-phases:

- **6a — Helius wire-up.** `HeliusWatchService` (LP-removal, holder-dump, creator-lineage on-demand). Enhanced websocket subscription manager. Sender lane integrated into `SwapSubmitter`. See [draft_helius_integration.md](draft_helius_integration.md).
- **6b — Execution depth.** `QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`, priority-fee service, Jito-lane support. Promote `Fill.metadata.live.*` into `FillAttempt`. Stale-exit detection + operator escalation. See [draft_execution_plan.md](draft_execution_plan.md).
- **6c — Enrichment fabric.** 8 free-provider clients; `TokenEnrichmentService` fanout with `EnrichmentFact` cache; `/api/operator/enrichment/:mint`; composite score wired into evaluator and `/market/token/:mint`. See [draft_market_stats_upgrade.md](draft_market_stats_upgrade.md).
- **6d — Credit tracking.** Generalize `ProviderBudgetService` across providers; `ProviderCreditLog`; `CreditForecastService` behind session start; alert rules. See [draft_credit_tracking.md](draft_credit_tracking.md).
- **6e — Adaptive engine & packs.** `AdaptiveThresholdService`; `MutatorOutcome` attribution; seed 10 packs. Exit mutators last.
- **6f — Smart-money pack.** Wallet curation + webhooks + `SmartWalletEvent` ingest; `SMART_MONEY_RUNNER` pack after 7 days clean data.
- **6g — Workbench completion.** `/workbench/editor`, `/workbench/grader`, full `/market/*` surfaces; decompose `results-board.tsx`; delete `discovery-lab/*`.
- **6h — Grafana v2.** Backfill missing views; 7 new dashboards via the extended auto-generator; alert rules; docker-compose hardening. See [draft_grafana_plan.md](draft_grafana_plan.md).
- **6i — Phase 6+ schema adds.** `FillAttempt`, `ProviderCreditLog`, `ExitPlanMutation`, `ConfigReplay`, `ThresholdSearchRun/Trial`, `MutatorOutcome`, `SmartWalletFunding`. See [draft_database_plan.md Phase 6+ additions](draft_database_plan.md#phase-6-additions).

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

1. Phase 1–5 ship status is captured in [draft_index.md](draft_index.md) progress snapshot (2026-04-18). Phase 6 sub-agents now claim their sub-phases per §3.
2. Run `node scripts/claude-harness/check-parity.mjs` before spawning any sub-agent.
3. Preferred sub-phase order for a single coordinated push: **6i schema adds that gate everything first → 6a + 6b + 6d in parallel → 6c → 6e → 6g → 6h → 6f**. 6f sits after 6e because the smart-money pack depends on the adaptive engine being online.
4. After each sub-phase lands, migrate the consumed content from its draft into `notes/reference/*` and delete the draft section (draft docs are blueprints, not permanent reference).
