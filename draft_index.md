# Planning Docs — Index

Design + planning for the bot-trading rewrite. All docs are drafts — once a phase lands, its content migrates into `notes/reference/*` and the draft is deleted.

**Status:** no implementation yet. These docs are the blueprint.

---

## Start here

| Doc | Read when |
|---|---|
| [draft_workflow_principles.md](draft_workflow_principles.md) | First. The "why" — trading principles, guardrails, operator session flow. |
| [draft_strategy_packs_v2.md](draft_strategy_packs_v2.md) | The "what" — 10 packs (6 runners, 4 scalps), adaptive engine, removal audit. |
| [draft_rollout_plan.md](draft_rollout_plan.md) | The "how" — 6 phases, sub-agent delegation, guardrails per phase. |

## Deep specs (one per surface)

| Doc | Covers |
|---|---|
| [draft_database_plan.md](draft_database_plan.md) | 12 new tables, column promotions, 25 views, deletions |
| [draft_backend_plan.md](draft_backend_plan.md) | Service-by-service spec, engine pipeline, API routes, webhooks, Smart-Money build |
| [draft_dashboard_plan.md](draft_dashboard_plan.md) | Next.js page-by-page UI/UX, shell, IA, component decomposition |
| [draft_grafana_plan.md](draft_grafana_plan.md) | 6 new dashboards + auto-generator extension recipe + compose hardening |

## Reference

| Doc | Covers |
|---|---|
| [draft_market_stats_upgrade.md](draft_market_stats_upgrade.md) | Free-API provider table (Trench / Bubblemaps / Solsniffer / Pump.fun / Jupiter / GeckoTerminal / Cielo / DefiLlama) + bundle-stats source ranking |

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
- **Adding an enrichment provider:** backend plan §4.4 + market-stats reference + `token-enrichment` skill.
- **Shipping the Smart-Money pack:** backend plan §4.5 + packs v2 §B.1 pack 2 + `smart-money-watcher` skill.
