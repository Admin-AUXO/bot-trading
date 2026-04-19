---
type: reference
status: active
area: repo
date: 2026-04-19
source_files:
  - ../plans/README.md
  - ../plans/implementation-plan.md
  - ../plans/execution.md
  - ../plans/helius.md
  - ../plans/credit-tracking.md
  - ../plans/grafana.md
  - ../plans/strategy-packs.md
  - trading_bot/backend/src/services/live-trade-executor.ts
  - trading_bot/backend/src/services/execution/swap-submitter.ts
graph_checked:
next_action: After any seam you close, update this note and the task-specific reference (`api-surface.md`, `prisma-and-views.md`, or `strategy.md`) in the same pass.
---

# Plans vs code reality

Purpose: stop agents from re-deriving what the `notes/plans/*.md` set already narrates, while making it obvious which seams are **landed**, **partial**, or **still open**. Always confirm in code before trusting this note or the plans.

## Where the plans live

- Index: [`../plans/README.md`](../plans/README.md)
- Execution order: [`../plans/implementation-plan.md`](../plans/implementation-plan.md)
- Topic plans: `backend.md`, `database.md`, `execution.md`, `credit-tracking.md`, `helius.md`, `market-enrichment.md`, `dashboard.md`, `grafana.md`, `strategy-packs.md`

Treat plans as **intent and checklists**, not as a live spec. They can lag merges.

## Generally landed (verify before relying)

- P0-style schema and credit-reporting views exist; execution helpers (`QuoteBuilder`, `SwapBuilder`, `SwapSubmitter`, priority-fee service) are the intended live path.
- Session start can be gated by credit forecast (`CreditForecastService` + `TradingSessionService`); env contract includes budget forecast knobs.
- Enrichment operator route, market pages, Grafana generator wiring, packs/runs/sessions operator surface, and workbench routes have substantial implementation behind them.

## Hardening seams that still deserve proof

Pick **one** track per session; prove with runtime or DB rows, not narrative.

1. **Helius paid-path ownership** — every intended billable call should flow through the budget / telemetry owner; watch for direct RPC or Sender bypasses (`live-trade-executor.ts`, `swap-submitter.ts`, and related services).
2. **Credit telemetry proof** — `ProviderCreditLog` (and Grafana-facing views) should be non-empty from a real or injected runtime path you can name.
3. **Grafana alerts** — dashboards may exist while alert rules are still thin; confirm repo-owned generation if you claim alerting.
4. **Execution retries** — stale quote, `BLOCKHASH_EXPIRED`, lane fallback, and `FillAttempt` completeness: code + tests + one exercised path beat comments alone.
5. **Adaptive loop** — thresholds and `MutatorOutcome` attribution must influence real decisions or be explicitly documented as deferred.
6. **Smart-money exploitation** — live use of `SmartWalletEvent`, pack wiring, and an explicit story for `SmartWalletFunding` (live vs intentionally dead).
7. **Compatibility cleanup** — delete or isolate duplicate routes only after proving no active page depends on them.

## Agent habits (from shipped sessions)

- Do not trust plan language over `git` history, types, or a runtime check.
- If a table is never written, the feature slice is not “done.”
- Duplicating `ProviderBudgetService` (or any runtime owner) locally invites drift.
- Boolean env flags: avoid silent string coercion on safety guards.
- “Backend build green” is not the same as “typecheck clean” or “production safe.”
- Sub-agents: good for bounded read-only traces (Helius bypass grep, Grafana view sources); bad for delegating the main seam.

## Verification shortcuts

After schema or backend changes:

```bash
cd trading_bot/backend && npm run db:generate && npm run build
```

After dashboard changes:

```bash
cd trading_bot/dashboard && npm run build
```

After Grafana JSON changes:

```bash
cd trading_bot/grafana && node scripts/build-dashboards.mjs
```

Then add **targeted** proof for the seam you touched (rows written, route hit, screenshot, or injected path).

## Related vault notes

- [`api-surface.md`](api-surface.md), [`prisma-and-views.md`](prisma-and-views.md), [`strategy.md`](strategy.md)
- Active handoff: [`../sessions/2026-04-18-dashboard-backend-simplification-pass.md`](../sessions/2026-04-18-dashboard-backend-simplification-pass.md)
- UI surface: [`../sessions/2026-04-18-dashboard-ui-ux-pass.md`](../sessions/2026-04-18-dashboard-ui-ux-pass.md)
