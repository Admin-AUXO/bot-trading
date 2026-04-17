# trading_bot — Agent Guide

Package-scoped rules. Read [`../AGENTS.md`](../AGENTS.md) first for repo-wide guidance; this file only adds what's specific to `trading_bot/`.

## Reality

- Backend: TypeScript, Express 5, Prisma 7, PostgreSQL 16. Dashboard: Next.js 16.
- Strategy scope: graduation trading only. Providers: Birdeye + Helius.
- Runtime is interval-driven, adaptive-sized, score-aware on exits, dayparted on discovery, lane-budget-paced on Birdeye.
- Discovery default = `pump_dot_fun`. Live trading is `pump_dot_fun`-only until the desk widens sources deliberately.
- `LIVE` is wired (Jupiter quote/swap + Helius Sender) but depends on funded wallet + env config.

## Work areas

- [`backend/src/engine/`](backend/src/engine/) — runtime loops, discovery, exits, execution.
- [`backend/src/services/`](backend/src/services/) — provider clients, telemetry, config, budget pacing, snapshots.
- [`backend/prisma/`](backend/prisma/) — schema + SQL views.
- [`dashboard/`](dashboard/) — operator UI + proxy.

## Package-specific rules

- When strategy logic changes, touch `backend/src/engine/` and [`../notes/reference/strategy.md`](../notes/reference/strategy.md) in the same pass.
- Schema + views matter together → `npm run db:setup`.
- All other rules (safety-critical boundaries, no migration files, provider calls inside `services/`, dashboard writes via the proxy route) live in [`../AGENTS.md`](../AGENTS.md).

## Verification

- Prisma changed → `npm run db:generate` before trusting TypeScript output.
- Dashboard changed → confirm `trading_bot/dashboard` still builds.
- Backend runtime/routes/schema changed → update the matching doc under [`../notes/reference/`](../notes/reference/).

## Graphify

Repo graph lives at `../graphify-out/` and is code-only (markdown excluded). Build from repo root with `node ./.codex/scripts/graphify.mjs build-local .`; rebuild after code changes with `node ./.codex/scripts/graphify-rebuild.mjs`.
