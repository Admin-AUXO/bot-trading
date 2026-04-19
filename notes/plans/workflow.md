# Workflow Principles

Referenced by every other plan. Snapshot **2026-04-19**.

These are durable rules, not phase-specific work items. They should outlive the current plan set.

---

## 1. Repo rules

- **Schema-only Prisma.** No migration files. `prisma generate` only. `db push` on operator machines.
- **Views are managed separately.** `create_views.sql` is the source of truth; run against Postgres manually. Drop + replace is safe.
- **Never hand-edit emitted grafana JSON.** The generator rewrites it. Edit the theme module, regenerate, commit both.
- **Dual-write for 7 days** on any metadata → column promotion before deleting the metadata side.
- **Plans are not reference docs.** When the work in a plan is done, migrate durable content to `notes/reference/*` and delete the plan.

---

## 2. Trading rules

- **No live capital without a grade.** Only packs with `grade ∈ {A, B}` may flip to LIVE. Enforced server-side.
- **Live strategy off by default.** `settings.strategy.liveStrategy.enabled = false` in fresh configs. Operator must opt in through the session/deployment flow.
- **Exit mutator gate.** Every mutator code needs 30 paper exits at neutral-or-better PnL before it can fire in LIVE.
- **Smart-money pack gate.** `SMART_MONEY_RUNNER` requires 7 days of clean `SmartWalletEvent` ingest + 48 h sandbox before LIVE.
- **Webhook caps.** 5 Helius webhooks per active position + 60 smart-wallet subscriptions. Enforced in `HeliusWatchService`.
- **Stop loss is non-negotiable.** SL submission uses the highest-priority lane; fee is always a small fraction of the stopped loss. Never route SL through a slow lane to save credits.

---

## 3. Credit discipline

- Every paid call logs `ProviderCreditLog` with a non-UNKNOWN `purpose`.
- Every paid call passes through `ProviderBudgetService.requestSlot(...)` first.
- Discovery never calls free providers; only post-accept or on operator navigation.
- `CreditForecastService` gates session-start; operator can override with explicit `allowOverBudget: true`.

---

## 4. Code rules

- **One owner per surface.** Enrichment → `TokenEnrichmentService`. Execution → `SwapSubmitter`. Helius streams → `HeliusWatchService`. Credits → `ProviderBudgetService`. Adaptive → `AdaptiveThresholdService`. If a second service starts calling the same external API, consolidate.
- **No ad-hoc Jupiter/RPC calls.** Route through `QuoteBuilder` / `SwapBuilder` / `SwapSubmitter`.
- **No ad-hoc Birdeye calls in the evaluator.** Route through `TokenEnrichmentService`.
- **Test before declaring done.** A landed service without a test is not done; file the test gap in the plan and track it.
- **Delete only after proof.** If a compatibility surface still has importers, it is not cleanup-ready no matter how old it looks.

---

## 5. Session bookends

- At start: read [README.md](README.md) + the plan(s) for the surface you're touching. Check `git log --oneline -20`. Check `notes/sessions/index.md` for the last entry.
- At end: write a session log under `notes/sessions/<date>-<topic>.md` listing diffs and verification; update the relevant plan's "Remaining" list; if a whole plan is now empty, delete it (or migrate durable content to `notes/reference/*`).

---

## 6. Sub-agent usage

Use real Codex roles:

- `code_navigator` for read-only dependency maps and seam proof.
- `database_agent` for Prisma / SQL.
- `dashboard_handler` for dashboard UI/data wiring.
- `grafana_agent` for Grafana generation and alerting.
- `adaptive_engine_builder`, `enrichment_integrator`, `smart_money_builder` for their named seams.
- `implementation_worker` for bounded patches that do not need a specialist.
- `code_reviewer` after a batch lands.

Parallelism rule:

- Prefer `1` main agent plus `2-3` bounded write agents.
- Shared files mean serialization, even if an older plan once called them separate WPs.
- Discovery-lab cleanup, session/budget work, and Helius ownership are each serialized tracks.

---

## 7. Risky operations — confirm first

- `git push --force` to main — never without explicit approval.
- `git reset --hard` — only after confirming no uncommitted work.
- Dropping a Postgres table / column — always via a schema edit + `db push`, never raw SQL.
- Deleting webhook providers — confirm cap + active-position count first.
- Flipping a pack to LIVE — always requires the IP + 2FA + grade gate.

---

## 8. Plan lifecycle

1. A plan is written when a multi-PR initiative is about to kick off.
2. Each PR within the initiative updates the plan's "Remaining" section.
3. When the initiative is complete, the plan's durable content migrates to `notes/reference/`, and the plan is deleted.
4. A plan older than 30 days with no matching PRs is stale — check whether it's still real or should be deleted.
5. If a plan's execution assumptions become stale, fix the plan before using it as an implementation guide.
