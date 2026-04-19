# Plans

Snapshot date: **2026-04-19**.

These are active implementation plans, not reference truth. Re-check code before acting, and move durable facts into `notes/reference/`.

## Read order

1. [../reference/drafts-and-implementation-truth.md](../reference/drafts-and-implementation-truth.md)
2. [implementation-plan.md](implementation-plan.md)
3. One topic plan from this folder
4. One current session note from `notes/sessions/`

## Start here

- [implementation-plan.md](implementation-plan.md): fastest safe execution order for Codex agents
- [workflow.md](workflow.md): shared process guardrails

## Topic plans

- [dashboard.md](dashboard.md): `contract` for Next.js data boundaries, route cleanup, polling ownership
- [backend.md](backend.md): `contract` for trading-critical backend seams and staged cleanup
- [execution.md](execution.md): `contract` for quote, submit, confirm hardening
- [helius.md](helius.md): `contract` for webhook/admin ownership and smart-wallet readiness
- [database.md](database.md): `target policy` for schema and view changes
- [credit-tracking.md](credit-tracking.md): `target policy` for budget telemetry
- [grafana.md](grafana.md): `target policy` for view bindings, lint, alerts
- [market-enrichment.md](market-enrichment.md): `target policy` for enrichment bundle and degraded-path behavior
- [strategy-packs.md](strategy-packs.md): `backlog` for pack recipes and rollout constraints

## Current priorities from the re-audit

- Keep SSR reads direct and browser writes behind the dashboard proxy.
- Keep session-open forecast and LIVE gating on `TradingSessionService`.
- Treat the enrichment bundle as the evaluator contract.
- Harden the existing Solana execution path instead of wrapping it in a second abstraction.
- Stage discovery-lab cleanup after compatibility collapse, not before.

## Maintenance rule

Update the touched plan in the same PR. If a plan becomes mostly durable guidance, move the lasting parts into `notes/reference/` and delete the plan.
