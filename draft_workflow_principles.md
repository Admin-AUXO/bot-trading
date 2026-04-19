# Workflow Principles — Durable Guardrails

Referenced by every other draft. Snapshot **2026-04-18**.

These are durable rules, not phase-specific work items. They should outlive the draft set.

---

## 1. Repo rules

- **Schema-only Prisma.** No migration files. `prisma generate` only. `db push` on operator machines.
- **Views are managed separately.** `create_views.sql` is the source of truth; run against Postgres manually. Drop + replace is safe.
- **Never hand-edit emitted grafana JSON.** The generator rewrites it. Edit the theme module, regenerate, commit both.
- **Dual-write for 7 days** on any metadata → column promotion before deleting the metadata side.
- **Drafts are not reference docs.** When the work in a draft is done, migrate durable content to `notes/reference/*` and delete the draft.

---

## 2. Trading rules

- **No live capital without a grade.** Only packs with `grade ∈ {A, B}` may flip to LIVE. Enforced server-side.
- **Adaptive off by default.** `settings.adaptive.enabled = false` in fresh configs. Operator must opt in per session.
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
- **Test before declaring done.** A landed service without a test is not done; file the test gap in the draft and track it.

---

## 5. Session bookends

- At start: read [draft_index.md](draft_index.md) + the draft(s) for the surface you're touching. Check `git log --oneline -20`. Check `notes/sessions/index.md` for the last entry.
- At end: write a session log under `notes/sessions/<date>-<topic>.md` listing diffs and verification; update the relevant draft's "Remaining" list; if a whole draft is now empty, delete it (or migrate durable content to `notes/reference/*`).

---

## 6. Sub-agent usage

Delegate read-heavy investigations to `Explore` / `code-explorer` sub-agents. Use `research-scout` for external docs (provider APIs, changelog checks). Don't duplicate work across agents — one owner per question.

Each phase has a recommended owner (see [draft_rollout_plan.md §3](draft_rollout_plan.md)). Spawn agents in parallel only when the work is genuinely independent.

---

## 7. Risky operations — confirm first

- `git push --force` to main — never without explicit approval.
- `git reset --hard` — only after confirming no uncommitted work.
- Dropping a Postgres table / column — always via a schema edit + `db push`, never raw SQL.
- Deleting webhook providers — confirm cap + active-position count first.
- Flipping a pack to LIVE — always requires the IP + 2FA + grade gate.

---

## 8. The draft lifecycle

1. A draft is written when a multi-PR initiative is about to kick off.
2. Each PR within the initiative updates the draft's "Remaining" section.
3. When the initiative is complete, the draft's durable content migrates to `notes/reference/`, and the draft is deleted.
4. A draft older than 30 days with no matching PRs is stale — check whether it's still real or should be deleted.
