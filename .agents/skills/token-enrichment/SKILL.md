---
name: token-enrichment
description: Use when adding/changing enrichment clients (Trench, Bubblemaps, Solsniffer, Pump.fun, Jupiter, GeckoTerminal, Cielo, DefiLlama) or TokenEnrichmentService caches.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebFetch
---

# Token Enrichment

## Graph Context

Graph: read `graphify-out/GRAPH_CLIENTS.md` for full client list, `graphify-out/GRAPH_ACTIONS.md` for enrichment actions

## Use when

- adding a new free-API provider (Trench.bot, Bubblemaps, Solsniffer, Pump.fun public, Jupiter Token, GeckoTerminal, Cielo, DefiLlama)
- editing `TokenEnrichmentService` or any provider client it owns
- touching `EnrichmentFact`, `BundleStats`, or `CreatorLineage` caches
- upgrading the market stats page or `/market/token/[mint]` view

## Read first

- `draft_market_stats_upgrade.md` — provider table, page additions, bundle stats ranking
- `draft_backend_plan.md` §1 — `TokenEnrichmentService` contract
- `draft_database_plan.md` §1 — `EnrichmentFact`, `BundleStats`, `CreatorLineage` shape
- `notes/reference/strategy.md` when enrichment feeds into entry scoring

## Rules

- Every new client goes behind `ProviderBudgetService`. Declare budget class + TTL before wiring.
- Caches must have per-source TTL (Trench 10 m, Bubblemaps 30 m, Solsniffer 15 m, Pump.fun 60 s, Jupiter 1 h, GeckoTerminal 5 m, DefiLlama 15 m, Cielo 60 s, Creator 6 h).
- Provider-heavy logic always reuses the shared client — never call providers directly from evaluators or UI.
- Feature-flag every new provider until phase 3 ships (`settings.enrichment.<source>.enabled`).
- Bundle stats primary is Trench.bot; Padre.gg fallback; self-build via Helius only as last resort (≈50–100 credits/token).
- Any new field surfaced on the dashboard must have a corresponding `EnrichmentFact.factType` enum value.
- Rate limits: Trench public (be polite), Bubblemaps public JSON, Solsniffer freemium ≤10/min, GeckoTerminal 30/min, Pump.fun public.

## Failure modes

- Calling providers bypassing the budget service → silent credit burn.
- Missing TTL → stale security flags shown as current.
- Using `EnrichmentFact.payload` JSON as a column-replacement (promote fields that Grafana filters on).
- Wiring Trench into evaluator without a fallback when the API is down.
- Treating Solsniffer and Rugcheck as redundant — they catch different classes of risk; keep both.
