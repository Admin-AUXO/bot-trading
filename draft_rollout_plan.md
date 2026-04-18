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

Phase order stays as specified in [draft_workflow_redesign.md §7](draft_workflow_redesign.md). Workbench UI (phase 4) ships **before** the adaptive engine (phase 5) so the operator has a UI surface to manage adaptive rollout from.

### Phase 1 — Foundation (no behavior change)
- Prisma adds all 12 new tables, fixes dangling FKs, promotes blob fields.
- Backfill 20 missing Grafana views + 3 pack-specific views.
- `npm run db:generate`. Existing tests green.
- Guardrail: dual-write (metadata + new columns) for ≥7 days, then read from columns only.

### Phase 2 — Pack as first-class object (internal only)
- `StrategyPackService` CRUD; import existing 3 presets as `StrategyPack` rows v1 status LIVE.
- Graduation engine reads pack from DB, falls back to hardcoded constants for parity; remove constants after one week.
- `ExitPlan` row written at open; exit-engine reads from `ExitPlan` with metadata fallback; remove metadata path after parity.
- Delete duplicated `ProviderBudgetService`/`SharedTokenFactsService`. Collapse graduation-engine into lanes.

### Phase 3 — Enrichment & Helius expansion
- `TokenEnrichmentService` with Trench.bot + Bubblemaps + Solsniffer + Pump.fun public + Jupiter + GeckoTerminal + Cielo clients, all feature-flagged.
- `HeliusWatchService` — creator lineage on-demand, LP-removal webhook, holder-dump webhook. Smart-wallet stream deferred to phase 5.
- Market stats + token detail view upgraded.
- `/api/operator/enrichment/:mint` single endpoint.

### Phase 4 — Workbench UI
- New routes `/workbench/{packs,editor,sandbox,grader,sessions}` and `/market/token/[mint]`.
- Decompose `results-board.tsx`. Server-side pagination on run-tokens endpoint.
- Wire `PackGradingService` suggestions into grader.
- Delete redirect-only routes + `discovery-lab/config` + `discovery-lab/strategy-ideas`.
- Guardrail: `TradingSession.start` requires explicit operator confirmation; `mode=LIVE` adds IP + 2FA gate.

### Phase 5 — Adaptive engine + 10 new packs
- `AdaptiveThresholdService` wired into evaluator + exit-engine, gated `settings.adaptive.enabled=false` by default.
- Seed packs 1–10 from [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) as `StrategyPack` rows status DRAFT. 48 h sandbox each before TESTING.
- Exit-mutators ship last; require 30 paper exits per mutator at neutral-or-better PnL.
- Smart-wallet stream + `SMART_MONEY_RUNNER` pack go live after 7 days of clean `SmartWalletEvent` ingestion.

### Phase 6 — Grafana v2
- Ship the 6 new dashboards via the extended auto-generator.
- Harden docker-compose (resources, bind, password).
- Add pack + config-version filter to every panel.

## 3. Sub-agent delegation map

Each phase is small enough for a focused sub-agent. Each agent gets: this doc + its phase block + the three companion docs + scoped read access.

| Agent role | Owns | Skill surface |
|---|---|---|
| `schema-migrator` | Phase 1: Prisma, view SQL, `db:generate`, dual-write verification | `database-safety`, `strategy-safety` |
| `backend-extractor` | Phase 2: lane extraction, singleton collapse, pack import | `strategy-safety`, `code-navigation` |
| `enrichment-integrator` | Phase 3: new clients + `TokenEnrichmentService` + `HeliusWatchService` non-capital pieces | `token-enrichment` (new), `birdeye-discovery-lab` |
| `dashboard-decomposer` | Phase 4: `results-board.tsx` split + new workbench routes | `dashboard-ui-ux`, `dashboard-operations` |
| `adaptive-engine-builder` | Phase 5: `AdaptiveThresholdService` + pack seeds + exit mutators (extra review) | `adaptive-thresholds` (new), `strategy-pack-authoring` (new), `strategy-safety` |
| `smart-money-builder` | Phase 5 sub-agent: wallet curation + webhook plumbing + signal aggregation for pack 2 | `smart-money-watcher` (new), `strategy-safety` |
| `grafana-builder` | Phase 6: dashboard JSON + view additions | `grafana` |
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

## 6. What happens next (when you green-light implementation)

1. Answer any follow-ups on the six `draft_*.md` docs.
2. Run `node scripts/claude-harness/check-parity.mjs` to confirm skill parity.
3. Spawn `schema-migrator` with phase 1 block + the database doc. Zero live-capital risk.
4. After phase 1 lands, migrate `draft_database_plan.md` content into `notes/reference/schema-plan.md` and delete the draft.
